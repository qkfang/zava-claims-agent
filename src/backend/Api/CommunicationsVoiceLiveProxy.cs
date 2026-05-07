using System.Net.WebSockets;
using Azure.Core;
using Azure.Identity;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

/// <summary>
/// Browser ↔ Azure AI Foundry Voice Live API WebSocket proxy that powers
/// the "Voice chat" tab on <c>/agents/customer-communications</c>.
///
/// Voice Live is a low-latency speech-to-speech WebSocket service hosted
/// at
/// <c>wss://&lt;resource&gt;.services.ai.azure.com/voice-live/realtime</c>,
/// reusing the Azure OpenAI Realtime event schema. It accepts a Foundry
/// <c>agent_id</c> + <c>agent-project-name</c> so the live conversation is
/// driven by the same Customer Communications Agent (Cara) the demo uses
/// elsewhere.
///
/// Browsers can't set <c>Authorization</c> headers on a <c>new WebSocket()</c>,
/// so this proxy:
///
/// 1. Accepts the browser's WebSocket upgrade on
///    <c>/communications/voice-live</c>.
/// 2. Acquires a bearer token via <see cref="DefaultAzureCredential"/> for
///    the Cognitive Services scope.
/// 3. Opens a <see cref="ClientWebSocket"/> to the Voice Live endpoint.
/// 4. Pumps frames bidirectionally between the two sockets until either
///    side closes.
/// </summary>
public static class CommunicationsVoiceLiveProxy
{
    private const string VoiceLiveApiVersion = "2025-10-01";
    private const string CommunicationsAgentId = "customer-communications-agent";
    private const string AzureAiScope = "https://ai.azure.com/.default";
    private const string CognitiveServicesScope = "https://cognitiveservices.azure.com/.default";

    public static void MapCommunicationsVoiceLiveEndpoints(
        this WebApplication app,
        ClaimsAgentOptions options,
        ClaimsAgentFactory agentFactory,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("CommunicationsVoiceLiveProxy");

        // Lightweight config probe so the front-end can decide whether to
        // even offer the live mic button.
        app.MapGet("/communications/voice-live/config", () =>
        {
            var (host, project) = TryParseProjectEndpoint(options.ProjectEndpoint);
            var enabled = !string.IsNullOrWhiteSpace(host) && !string.IsNullOrWhiteSpace(project);
            return Results.Ok(new
            {
                enabled,
                resourceHost = host,
                projectName = project,
                agentId = CommunicationsAgentId,
                apiVersion = VoiceLiveApiVersion
            });
        });

        // Browser ↔ Voice Live proxy.
        app.Map("/communications/voice-live", async (HttpContext ctx) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest)
            {
                ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                await ctx.Response.WriteAsync("WebSocket upgrade required.");
                return;
            }

            var (host, project) = TryParseProjectEndpoint(options.ProjectEndpoint);
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(project))
            {
                ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await ctx.Response.WriteAsync("Voice Live is not configured (AZURE_AI_PROJECT_ENDPOINT missing).");
                return;
            }

            // Make sure the Foundry agent version exists in the project so
            // Voice Live can resolve the agent_id. ClaimsAgent constructors
            // call CreateAgentVersion under the hood; we discard the result.
            try
            {
                if (agentFactory.IsConfigured)
                    _ = agentFactory.Create("communications");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not ensure Customer Communications agent exists; Voice Live may fail to resolve agent_id.");
            }

            // Acquire a Foundry / Speech bearer token. Try the modern
            // ai.azure.com scope first, fall back to the legacy scope used
            // by other endpoints in this app.
            string accessToken;
            try
            {
                accessToken = await AcquireTokenAsync(options.TenantId, ctx.RequestAborted);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to acquire bearer token for Voice Live");
                ctx.Response.StatusCode = StatusCodes.Status502BadGateway;
                await ctx.Response.WriteAsync("Failed to acquire Azure credential for Voice Live.");
                return;
            }

            // Classic Foundry Agent Service integration uses three query
            // parameters on the WebSocket URL:
            //
            //   agent-id            — the agent name (the value passed to
            //                         CreateAgentVersion).
            //   agent-project-name  — the Foundry project that owns the
            //                         agent.
            //   agent-access-token  — bearer token that Voice Live uses on
            //                         the caller's behalf to fetch the
            //                         agent definition. Without this token
            //                         Voice Live emits an "error" event
            //                         "Failed to initialize AI agent,
            //                         check connection string and the
            //                         identity permissions" and closes
            //                         the socket (close code 1006 on the
            //                         browser side).
            //
            // The Authorization header authenticates *us* to the Voice Live
            // resource; the agent-access-token authorises Voice Live to
            // call Foundry. They are the same token here because the
            // server-side identity has both Cognitive Services User (on
            // Voice Live) and Azure AI User (on the Foundry project).
            var voiceLiveUri = new Uri(
                $"wss://{host}/voice-live/realtime" +
                $"?api-version={VoiceLiveApiVersion}" +
                $"&agent-id={Uri.EscapeDataString(CommunicationsAgentId)}" +
                $"&agent-project-name={Uri.EscapeDataString(project!)}" +
                $"&agent-access-token={Uri.EscapeDataString(accessToken)}");

            using var azure = new ClientWebSocket();
            azure.Options.SetRequestHeader("Authorization", $"Bearer {accessToken}");
            // Voice Live also accepts an x-ms-client-request-id header which
            // helps with diagnostics on the service side.
            azure.Options.SetRequestHeader("x-ms-client-request-id", Guid.NewGuid().ToString("D"));

            try
            {
                // Don't log the agent-access-token query parameter.
                var safeUri = voiceLiveUri.ToString();
                var idx = safeUri.IndexOf("agent-access-token=", StringComparison.Ordinal);
                if (idx > 0) safeUri = safeUri.Substring(0, idx) + "agent-access-token=***";
                logger.LogInformation("Voice Live connecting to {Uri}", safeUri);
                await azure.ConnectAsync(voiceLiveUri, ctx.RequestAborted);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Voice Live upstream connect failed");
                ctx.Response.StatusCode = StatusCodes.Status502BadGateway;
                await ctx.Response.WriteAsync("Voice Live upstream connect failed: " + ex.Message);
                return;
            }

            using var browser = await ctx.WebSockets.AcceptWebSocketAsync();

            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted);
            var cancel = linkedCts.Token;

            var browserToAzure = PumpAsync(browser, azure, "browser→azure", logger, cancel);
            var azureToBrowser = PumpAsync(azure, browser, "azure→browser", logger, cancel);

            try
            {
                await Task.WhenAny(browserToAzure, azureToBrowser);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Voice Live proxy pump faulted");
            }
            finally
            {
                linkedCts.Cancel();
                await SafeCloseAsync(browser, "session ended");
                await SafeCloseAsync(azure, "session ended");
            }
        });
    }

    private static async Task<string> AcquireTokenAsync(string? tenantId, CancellationToken cancel)
    {
        var credentialOptions = new DefaultAzureCredentialOptions
        {
            ExcludeVisualStudioCredential = true,
            ExcludeVisualStudioCodeCredential = true,
            ExcludeSharedTokenCacheCredential = true
        };
        if (!string.IsNullOrWhiteSpace(tenantId))
            credentialOptions.TenantId = tenantId;
        var credential = new DefaultAzureCredential(credentialOptions);

        try
        {
            var token = await credential.GetTokenAsync(
                new TokenRequestContext(new[] { AzureAiScope }), cancel);
            return token.Token;
        }
        catch
        {
            // Some environments only have the legacy CognitiveServices scope
            // wired up; fall back to it.
            var token = await credential.GetTokenAsync(
                new TokenRequestContext(new[] { CognitiveServicesScope }), cancel);
            return token.Token;
        }
    }

    /// <summary>
    /// Pump messages from <paramref name="from"/> to <paramref name="to"/>
    /// until either socket closes or the cancellation token fires.
    /// Forwards binary and text frames preserving message boundaries.
    /// </summary>
    private static async Task PumpAsync(WebSocket from, WebSocket to, string direction, ILogger logger, CancellationToken cancel)
    {
        var buffer = new byte[16 * 1024];
        try
        {
            while (from.State == WebSocketState.Open && to.State == WebSocketState.Open && !cancel.IsCancellationRequested)
            {
                WebSocketReceiveResult result;
                try
                {
                    result = await from.ReceiveAsync(buffer, cancel);
                }
                catch (OperationCanceledException) { break; }
                catch (WebSocketException ex)
                {
                    logger.LogDebug(ex, "Voice Live pump {Direction} receive ended", direction);
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    logger.LogInformation("Voice Live pump {Direction} received close ({Status})", direction, result.CloseStatus);
                    if (to.State == WebSocketState.Open)
                    {
                        await to.CloseOutputAsync(
                            result.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                            result.CloseStatusDescription,
                            CancellationToken.None);
                    }
                    break;
                }

                // Re-emit. If the message arrived in multiple frames, keep
                // forwarding chunks with EndOfMessage matching the source.
                var segment = new ArraySegment<byte>(buffer, 0, result.Count);
                if (to.State == WebSocketState.Open)
                {
                    await to.SendAsync(segment, result.MessageType, result.EndOfMessage, cancel);
                }

                while (!result.EndOfMessage && !cancel.IsCancellationRequested)
                {
                    result = await from.ReceiveAsync(buffer, cancel);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    var seg = new ArraySegment<byte>(buffer, 0, result.Count);
                    if (to.State == WebSocketState.Open)
                        await to.SendAsync(seg, result.MessageType, result.EndOfMessage, cancel);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Voice Live pump {Direction} faulted", direction);
        }
    }

    private static async Task SafeCloseAsync(WebSocket ws, string reason)
    {
        try
        {
            if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, cts.Token);
            }
        }
        catch { /* swallow */ }
    }

    /// <summary>
    /// Parse <c>https://&lt;resource&gt;.services.ai.azure.com/api/projects/&lt;project&gt;</c>
    /// into <c>(host, project)</c>. Tolerates trailing slashes and missing
    /// project segment.
    /// </summary>
    public static (string? host, string? project) TryParseProjectEndpoint(string? projectEndpoint)
    {
        if (string.IsNullOrWhiteSpace(projectEndpoint)) return (null, null);
        if (!Uri.TryCreate(projectEndpoint, UriKind.Absolute, out var uri)) return (null, null);
        var host = uri.Host;
        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        // Expect ["api", "projects", "<projectName>"].
        var project = segments.Length >= 3 && string.Equals(segments[0], "api", StringComparison.OrdinalIgnoreCase)
            && string.Equals(segments[1], "projects", StringComparison.OrdinalIgnoreCase)
            ? segments[2]
            : null;
        return (host, project);
    }
}

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
    // Voice Live API version. The new Foundry Agent integration
    // (the one that uses declarative agents like ours) is wired up via the
    // 2026-01-01-preview surface; older preview versions only support the
    // classic Agent Service `asst_xxx` flow.
    private const string VoiceLiveApiVersion = "2026-01-01-preview";
    // Voice Live attaches to a *voice-specific* Cara agent
    // (CustomerCommunicationsVoiceAgent) whose instructions are
    // conversational and explicitly forbid speaking the written
    // "Channel / Customer Sentiment / Draft Message / Tone & Compliance /
    // Approval Required" template. The standard customer-communications
    // agent is still used for written-channel drafts.
    private const string CommunicationsAgentId = "customer-communications-voice-agent";
    private const string CommunicationsAgentRole = "communications-voice";
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
                    _ = agentFactory.Create(CommunicationsAgentRole);
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

            // New Foundry Agent integration (matches the official
            // azure-ai-voicelive SDK): the WebSocket URL carries
            //
            //   agent-name          — the agent name (the value passed to
            //                         CreateAgentVersion in BaseAgent).
            //   agent-project-name  — the Foundry project that owns the
            //                         agent.
            //
            // Authentication is done purely via the Authorization: Bearer
            // header on the upgrade request. The legacy classic flow
            // additionally required `agent-id` + `agent-access-token`
            // query parameters; that flow only works for classic
            // `asst_xxx` agents from the Azure AI Agent Service. Our
            // agents are declarative `agent.version` agents, so we use
            // the new shape.
            var voiceLiveUri = new Uri(
                $"wss://{host}/voice-live/realtime" +
                $"?api-version={VoiceLiveApiVersion}" +
                $"&agent-name={Uri.EscapeDataString(CommunicationsAgentId)}" +
                $"&agent-project-name={Uri.EscapeDataString(project!)}");

            using var azure = new ClientWebSocket();
            azure.Options.SetRequestHeader("Authorization", $"Bearer {accessToken}");
            // Voice Live also accepts an x-ms-client-request-id header which
            // helps with diagnostics on the service side.
            azure.Options.SetRequestHeader("x-ms-client-request-id", Guid.NewGuid().ToString("D"));

            try
            {
                logger.LogInformation("Voice Live connecting to {Uri}", voiceLiveUri);
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
                    logger.LogInformation(ex, "Voice Live pump {Direction} receive ended (WebSocketError={ErrorCode}, NativeError={NativeErrorCode})", direction, ex.WebSocketErrorCode, ex.ErrorCode);
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

using System.Text.Json;
using Microsoft.AspNetCore.Http;
using ZavaClaims.Agents;

namespace ZavaClaims.App.Api;

/// <summary>
/// Server-Sent Events helper used by every agent "Try It Out" /process endpoint
/// to stream the live Foundry agent response to the browser.
///
/// Each /process endpoint accepts a streaming request when the client sends
/// <c>Accept: text/event-stream</c>. The handler builds the prompt and the
/// final-envelope projection and delegates to <see cref="StreamAsync"/>, which
/// emits one <c>delta</c> event per text token plus a single terminal
/// <c>done</c> event carrying the same JSON envelope the non-streaming JSON
/// path returns. An <c>error</c> event is sent if the live agent throws.
///
/// When Foundry is not configured we still respond with SSE so the browser
/// keeps a uniform code path: zero deltas, then a <c>done</c> event with the
/// deterministic-fallback envelope so the page still flows end-to-end.
/// </summary>
internal static class AgentSseStreaming
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// Returns true when the request explicitly asks for an SSE stream via the
    /// HTTP <c>Accept</c> header. We deliberately require an exact match for
    /// <c>text/event-stream</c> so existing JSON callers keep working unchanged.
    /// </summary>
    public static bool WantsEventStream(HttpContext httpContext)
    {
        foreach (var value in httpContext.Request.Headers.Accept)
        {
            if (string.IsNullOrEmpty(value)) continue;
            if (value.Contains("text/event-stream", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Stream the agent's reply over SSE, then emit a final <c>done</c> event
    /// carrying <paramref name="buildEnvelope"/>'s projection of the agent
    /// trace into the page-specific envelope shape (fields, urgency, calculation,
    /// supplier match, etc).
    ///
    /// Pass <paramref name="agent"/> as <c>null</c> to send only the
    /// deterministic-fallback envelope (zero deltas, single <c>done</c> event).
    /// This keeps the SSE branch usable when Foundry is not configured.
    /// </summary>
    public static async Task StreamAsync(
        HttpContext httpContext,
        ClaimsAgent? agent,
        string prompt,
        Func<AgentTraceResult?, string?, object> buildEnvelope,
        ILogger logger,
        string agentLabel)
    {
        var response = httpContext.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";
        response.Headers["X-Accel-Buffering"] = "no";

        var ct = httpContext.RequestAborted;

        AgentTraceResult? trace = null;
        string? agentError = null;

        if (agent is not null)
        {
            try
            {
                await foreach (var ev in agent.RunStreamingTraceAsync(prompt, ct))
                {
                    switch (ev)
                    {
                        case AgentStreamingDelta delta:
                            if (!string.IsNullOrEmpty(delta.Text))
                                await WriteEventAsync(response, "delta", new { text = delta.Text }, ct);
                            break;
                        case AgentStreamingCompleted completed:
                            trace = completed.Trace;
                            break;
                    }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // Client disconnected; nothing more to do.
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "{AgentLabel} streaming invocation failed; falling back to deterministic demo data", agentLabel);
                agentError = ex.Message;
                await WriteEventAsync(response, "error", new { message = ex.Message }, ct);
            }
        }

        var envelope = buildEnvelope(trace, agentError);
        await WriteEventAsync(response, "done", envelope, ct);
    }

    private static async Task WriteEventAsync(HttpResponse response, string eventName, object payload, CancellationToken ct)
    {
        if (ct.IsCancellationRequested) return;
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        // SSE frames: each "data:" line is a single text line. Embedded newlines
        // would break the frame, so split the JSON across continuation lines.
        var safeJson = json.Replace("\r", string.Empty);
        var lines = safeJson.Split('\n');

        var sb = new System.Text.StringBuilder(safeJson.Length + 32);
        sb.Append("event: ").Append(eventName).Append('\n');
        foreach (var line in lines)
            sb.Append("data: ").Append(line).Append('\n');
        sb.Append('\n');

        await response.WriteAsync(sb.ToString(), ct);
        await response.Body.FlushAsync(ct);
    }
}

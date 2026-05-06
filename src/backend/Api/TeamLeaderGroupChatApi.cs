using System.Text.Json;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

internal record GroupChatStartRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the new Team Leader Group Chat demo on
/// <c>/agents/team-leader</c>. The Team Leader agent acts as a group-chat
/// manager (modelled on <c>Microsoft.Agents.AI.Workflows.GroupChatManager</c>)
/// and runs a conversation with the seven other claims-office specialist
/// agents about a single claim, deciding which specialist speaks next and
/// when the team has reached a conclusion.
/// </summary>
public static class TeamLeaderGroupChatApi
{
    public static void MapTeamLeaderGroupChatEndpoints(
        this WebApplication app,
        TeamLeaderGroupChatService service,
        ILogger logger)
    {
        // Static metadata about the participants — used by the UI to render
        // a roster before the discussion starts.
        app.MapGet("/team-leader/groupchat/participants", () => Results.Ok(
            TeamLeaderGroupChatService.Participants.Select(p => new
            {
                id = p.Id,
                persona = p.Persona,
                role = p.Role
            })));

        // Start a new group-chat session for a claim. Returns the session id
        // straight away; orchestration runs on a background task and turns
        // are streamed via the /stream endpoint below.
        app.MapPost("/team-leader/groupchat/start", (GroupChatStartRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            if (!service.IsConfigured)
                return Results.BadRequest(new
                {
                    error = "Team Leader Foundry agent is not configured. " +
                            "Set AZURE_AI_PROJECT_ENDPOINT and AZURE_AI_MODEL_DEPLOYMENT_NAME to enable it."
                });

            var claim = service.GetClaim(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Team Leader group chat starting: claimNumber={ClaimNumber}",
                Sanitize(claim.ClaimNumber));

            var session = service.StartSession(claim);
            return Results.Ok(new
            {
                sessionId = session.Id,
                claimNumber = session.ClaimNumber,
                participants = TeamLeaderGroupChatService.Participants.Select(p => new
                {
                    id = p.Id,
                    persona = p.Persona,
                    role = p.Role
                })
            });
        });

        // Server-Sent-Events stream of turns for a given session. The browser
        // connects with EventSource and renders each turn as it arrives.
        app.MapGet("/team-leader/groupchat/stream/{sessionId}", async (HttpContext ctx, string sessionId) =>
        {
            var session = service.GetSession(sessionId);
            if (session is null)
            {
                ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                await ctx.Response.WriteAsJsonAsync(new { error = $"session '{sessionId}' not found" });
                return;
            }

            ctx.Response.Headers.CacheControl = "no-cache";
            ctx.Response.Headers.ContentType = "text/event-stream";
            ctx.Response.Headers["X-Accel-Buffering"] = "no";
            await ctx.Response.Body.FlushAsync();

            // Stream turns as they arrive on the unbounded channel. The
            // orchestrator started before the client connected, but the
            // channel buffers every event, so no turns are lost.
            try
            {
                await foreach (var turn in session.Events.Reader.ReadAllAsync(ctx.RequestAborted))
                {
                    await WriteEventAsync(ctx, turn, ctx.RequestAborted);
                    if (turn.Kind == "done") break;
                }
            }
            catch (OperationCanceledException)
            {
                // Client disconnected; nothing to do.
            }
        });
    }

    private static async Task WriteEventAsync(HttpContext ctx, GroupChatTurn turn, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            kind = turn.Kind,
            speakerId = turn.SpeakerId,
            persona = turn.SpeakerPersona,
            role = turn.SpeakerRole,
            text = turn.Text,
            timestamp = turn.Timestamp
        });
        await ctx.Response.WriteAsync($"data: {payload}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record CommunicationsProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Customer
/// Communications agent page (<c>/agents/customer-communications</c>).
///
/// The flow mirrors the Claims Intake demo:
///
/// 1. List the claims minted by the Claims Intake demo (held in
///    <see cref="IntakeClaimStore"/>) so the user can pick one from a
///    dropdown.
/// 2. Run the selected claim through the Customer Communications Agent
///    (Cara) which drafts empathetic plain-English updates across
///    email / SMS / portal, summarises current status &amp; next steps,
///    and surfaces vulnerability flags for human review.
/// </summary>
public static class CommunicationsApi
{
    public static void MapCommunicationsEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // Lightweight list used to populate the Claim ID dropdown on the
        // Try It Out tab. Returns claims most-recent first.
        app.MapGet("/communications/claims", () =>
        {
            var claims = claimStore.All().Select(c => new
            {
                claimNumber = c.ClaimNumber,
                customerName = c.CustomerName,
                claimType = c.ClaimType,
                urgency = c.Urgency,
                policyNumber = c.PolicyNumber,
                createdAt = c.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Full record for a single claim — mirrors /intake/claims/{n}.
        app.MapGet("/communications/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Customer Communications Agent on the selected claim.
        // Deterministic drafts are generated server-side so the demo always
        // produces output; when Foundry is configured the live agent is
        // also invoked and its narrative is surfaced in `agentNotes`.
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/communications/process", async (HttpContext httpContext, CommunicationsProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var record = claimStore.Get(request.ClaimNumber);
            if (record is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Communications process: claimNumber={ClaimNumber}",
                Sanitize(record.ClaimNumber));

            var drafts = CustomerCommunicationsDrafter.Draft(record);

            var prompt =
                "CLAIM CASE FOR CUSTOMER COMMUNICATIONS\n" +
                "======================================\n" +
                $"Claim number   : {record.ClaimNumber}\n" +
                $"Customer       : {record.CustomerName}\n" +
                $"Email          : {record.CustomerEmail}\n" +
                $"Phone          : {record.CustomerPhone}\n" +
                $"Preferred      : {record.PreferredContact}\n" +
                $"Policy         : {record.PolicyNumber}\n" +
                $"Claim type     : {record.ClaimType}\n" +
                $"Incident date  : {record.IncidentDate}\n" +
                $"Incident place : {record.IncidentLocation}\n" +
                $"Description    : {record.IncidentDescription}\n" +
                $"Estimated loss : {record.EstimatedLoss}\n" +
                $"Urgency        : {record.Urgency} — {record.UrgencyReason}\n" +
                $"Stage          : Lodged, awaiting Claims Assessment\n\n" +
                "Please draft empathetic, plain-English customer updates for this claim across " +
                "the most appropriate channels (email, SMS, portal). Include a short summary of " +
                "current status and next steps, and surface any vulnerability flags that need a " +
                "human reviewer before sending.";

            object BuildEnvelope(AgentTraceResult? trace, string? agentError) => new
            {
                claimNumber = record.ClaimNumber,
                customerName = record.CustomerName,
                claimType = record.ClaimType,
                urgency = record.Urgency,
                stage = "Lodged — awaiting Claims Assessment",
                drafts.Email,
                drafts.Sms,
                drafts.Portal,
                drafts.Summary,
                drafts.NextSteps,
                drafts.VulnerabilityFlags,
                drafts.HumanApprovalRequired,
                drafts.HumanApprovalReason,
                agentNotes = trace?.Text,
                agentConfigured = agentFactory.IsConfigured,
                agentError,
                agentInput = trace?.Input,
                agentRawOutput = trace is null ? null : new
                {
                    text = trace.Text,
                    citations = trace.Citations,
                    outputItems = trace.OutputItems,
                    responseId = trace.ResponseId,
                    durationMs = trace.DurationMs
                }
            };

            if (AgentSseStreaming.WantsEventStream(httpContext))
            {
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("communications") : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, prompt, BuildEnvelope, logger, "Customer Communications Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("communications");
                    traceResult = await agent.RunWithTraceAsync(prompt);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Customer Communications Agent invocation failed; falling back to deterministic drafts");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

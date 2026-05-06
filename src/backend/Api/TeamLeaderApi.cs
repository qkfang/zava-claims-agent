using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record TeamLeaderProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Team Leader agent
/// page (<c>/agents/team-leader</c>). These let the page:
///
/// 1. List the claim cases minted by the Claims Intake demo (held in the
///    in-memory <see cref="IntakeClaimStore"/>).
/// 2. Engage the Team Leader Foundry agent on a selected claim — the agent
///    receives the claim's intake details and returns a structured team-leader
///    narrative (workload summary, escalations, approval queue, coaching
///    insights, priorities) so the human team leader can confirm next steps.
/// </summary>
public static class TeamLeaderApi
{
    public static void MapTeamLeaderEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // List of claim cases available for the Team Leader demo. These
        // come from the in-memory Intake store, populated by the Claims
        // Intake "Try It Out" tab.
        app.MapGet("/team-leader/claims", () =>
        {
            var claims = claimStore.All().Select(c => new
            {
                claimNumber = c.ClaimNumber,
                customerName = c.CustomerName,
                claimType = c.ClaimType,
                policyNumber = c.PolicyNumber,
                incidentDate = c.IncidentDate,
                incidentLocation = c.IncidentLocation,
                estimatedLoss = c.EstimatedLoss,
                urgency = c.Urgency,
                createdAt = c.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Read-only view of a single claim — used by the page to show the
        // Team Leader what the case currently contains before engaging
        // the agent.
        app.MapGet("/team-leader/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Team Leader Agent on a claim held in memory. The
        // agent receives the claim's structured intake fields and returns
        // its workload / escalation / approval / coaching narrative so the
        // human team leader can prioritise the floor.
        app.MapPost("/team-leader/process", async (TeamLeaderProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Team Leader process: claimNumber={ClaimNumber}",
                Sanitize(claim.ClaimNumber));

            string? agentNotes = null;
            string? agentError = null;
            string? agentInput = null;
            object? agentRawOutput = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var brief =
                        "CLAIM CASE FOR TEAM-LEADER REVIEW\n" +
                        "=================================\n" +
                        $"Claim number    : {claim.ClaimNumber}\n" +
                        $"Customer        : {claim.CustomerName}\n" +
                        $"Customer email  : {claim.CustomerEmail}\n" +
                        $"Customer phone  : {claim.CustomerPhone}\n" +
                        $"Policy number   : {claim.PolicyNumber}\n" +
                        $"Claim type      : {claim.ClaimType}\n" +
                        $"Incident date   : {claim.IncidentDate}\n" +
                        $"Incident location: {claim.IncidentLocation}\n" +
                        $"Estimated loss  : {claim.EstimatedLoss}\n" +
                        $"Urgency         : {claim.Urgency} ({claim.UrgencyReason})\n" +
                        $"Lodged at       : {claim.CreatedAt:u}\n\n" +
                        "INCIDENT DESCRIPTION\n" +
                        "--------------------\n" +
                        claim.IncidentDescription + "\n\n" +
                        "TASK\n" +
                        "----\n" +
                        "Review this claim from a team-leader perspective. Produce your\n" +
                        "structured Team Leader output: Workload Summary, Escalations,\n" +
                        "Approval Queue, Quality / Coaching Insights, and Recommended\n" +
                        "Priorities for Today. Flag SLA risk, vulnerable-customer concerns,\n" +
                        "and any items that need human approval. Recommend, do not decide.";

                    var agent = agentFactory.Create("team-leader");
                    var result = await agent.RunWithTraceAsync(brief);
                    agentNotes = result.Text;
                    agentInput = result.Input;
                    agentRawOutput = new
                    {
                        text = result.Text,
                        citations = result.Citations,
                        outputItems = result.OutputItems,
                        responseId = result.ResponseId,
                        durationMs = result.DurationMs
                    };
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Team Leader Agent invocation failed");
                    agentError = ex.Message;
                }
            }

            return Results.Ok(new
            {
                claimNumber = claim.ClaimNumber,
                customerName = claim.CustomerName,
                claimType = claim.ClaimType,
                agentNotes,
                agentError,
                agentConfigured = agentFactory.IsConfigured,
                agentInput,
                agentRawOutput
            });
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

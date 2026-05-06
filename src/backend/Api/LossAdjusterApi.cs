using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record LossAdjusterProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Loss Adjuster agent
/// page (<c>/agents/loss-adjuster</c>). These let the page:
///
/// 1. List the claim cases minted by the Claims Intake demo (held in the
///    in-memory <see cref="IntakeClaimStore"/>).
/// 2. Engage the Loss Adjuster Foundry agent on a selected claim — the agent
///    receives the claim's intake details and returns a structured adjuster
///    report (damage scope, cause of loss, cost reasonableness, inspection
///    questions, recommended reserve, escalation flag).
/// </summary>
public static class LossAdjusterApi
{
    public static void MapLossAdjusterEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // List of claim cases available for the Loss Adjuster demo. These
        // come from the in-memory Intake store, populated by the Claims
        // Intake "Try It Out" tab.
        app.MapGet("/loss-adjuster/claims", () =>
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
        // Loss Adjuster what the case currently contains before engaging
        // the agent.
        app.MapGet("/loss-adjuster/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Loss Adjuster Agent on a claim held in memory. The
        // agent receives the claim's structured intake fields (analogous to
        // the email + form bundle the Claims Intake Agent receives) and
        // returns its damage-scope / cause-of-loss / inspection-brief
        // narrative as plain text.
        app.MapPost("/loss-adjuster/process", async (LossAdjusterProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Loss Adjuster process: claimNumber={ClaimNumber}",
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
                        "CLAIM CASE FOR LOSS-ADJUSTER REVIEW\n" +
                        "===================================\n" +
                        $"Claim number    : {claim.ClaimNumber}\n" +
                        $"Customer        : {claim.CustomerName}\n" +
                        $"Customer email  : {claim.CustomerEmail}\n" +
                        $"Customer phone  : {claim.CustomerPhone}\n" +
                        $"Policy number   : {claim.PolicyNumber}\n" +
                        $"Claim type      : {claim.ClaimType}\n" +
                        $"Incident date   : {claim.IncidentDate}\n" +
                        $"Incident location: {claim.IncidentLocation}\n" +
                        $"Estimated loss  : {claim.EstimatedLoss}\n" +
                        $"Urgency         : {claim.Urgency} ({claim.UrgencyReason})\n\n" +
                        "INCIDENT DESCRIPTION\n" +
                        "--------------------\n" +
                        claim.IncidentDescription + "\n\n" +
                        "TASK\n" +
                        "----\n" +
                        "Investigate the damage / complex loss on this claim. Review the\n" +
                        "available report and site evidence, validate the scope and\n" +
                        "quantum, and produce your structured Loss Adjuster Report\n" +
                        "(Damage Scope, Cause of Loss, Cost Reasonableness, Inspection\n" +
                        "Questions, Recommendation for Assessor, recommended reserve,\n" +
                        "and Human Approval Required).";

                    var agent = agentFactory.Create("loss-adjuster");
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
                    logger.LogWarning(ex, "Loss Adjuster Agent invocation failed");
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

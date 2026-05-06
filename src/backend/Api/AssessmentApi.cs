using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record AssessmentProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Claims Assessment
/// agent page (<c>/agents/claims-assessment</c>). They let the page:
///
/// 1. List the claim cases currently held in the in-memory
///    <see cref="IntakeClaimStore"/> (created by the Claims Intake demo).
/// 2. Look a single claim up by its claim number for display.
/// 3. Engage the Foundry <see cref="ZavaClaims.Agents.ClaimsAssessmentAgent"/>
///    on the selected claim so the page can render the agent's coverage
///    recommendation, reasoning and plain-English explanation.
/// </summary>
public static class AssessmentApi
{
    public static void MapAssessmentEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // Dropdown source — claim cases minted by the Claims Intake demo.
        app.MapGet("/assessment/claims", () =>
        {
            var claims = claimStore.All().Select(r => new
            {
                claimNumber = r.ClaimNumber,
                customerName = r.CustomerName,
                policyNumber = r.PolicyNumber,
                claimType = r.ClaimType,
                incidentDate = r.IncidentDate,
                urgency = r.Urgency,
                createdAt = r.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Per-claim view used by the Try It Out panel to render the
        // Claim Case before the agent is engaged.
        app.MapGet("/assessment/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Claims Assessment Agent on the selected claim. Mirrors
        // /intake/process: when Foundry is configured we invoke the live
        // ClaimsAssessmentAgent and return its narrative; otherwise we return
        // a deterministic demo summary so the page still flows.
        app.MapPost("/assessment/process", async (AssessmentProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Assessment process: claimNumber={ClaimNumber}", Sanitize(claim.ClaimNumber));

            string? agentNotes = null;
            string? agentError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var prompt =
                        "CLAIM CASE FOR ASSESSMENT\n" +
                        "=========================\n" +
                        $"Claim number: {claim.ClaimNumber}\n" +
                        $"Customer: {claim.CustomerName}\n" +
                        $"Customer email: {claim.CustomerEmail}\n" +
                        $"Customer phone: {claim.CustomerPhone}\n" +
                        $"Policy number: {claim.PolicyNumber}\n" +
                        $"Claim type: {claim.ClaimType}\n" +
                        $"Incident date: {claim.IncidentDate}\n" +
                        $"Incident location: {claim.IncidentLocation}\n" +
                        $"Estimated loss: {claim.EstimatedLoss}\n" +
                        $"Preferred contact: {claim.PreferredContact}\n" +
                        $"Intake urgency: {claim.Urgency} — {claim.UrgencyReason}\n\n" +
                        "INCIDENT DESCRIPTION\n" +
                        "--------------------\n" +
                        claim.IncidentDescription + "\n\n" +
                        "Please review this claim against the relevant Zava Insurance policy " +
                        "wording for the customer's policy, identify coverage and exclusions, " +
                        "list any missing information, and recommend approve / partial / decline " +
                        "in your standard output format.";

                    var agent = agentFactory.Create("assessment");
                    var result = await agent.RunAsync(prompt);
                    agentNotes = result.Text;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Claims Assessment Agent invocation failed; returning deterministic demo summary");
                    agentError = ex.Message;
                }
            }

            // Deterministic fallback so the demo still flows when Foundry is
            // not configured (or the call failed). Keeps the same shape as
            // the live agent's output sections.
            if (string.IsNullOrWhiteSpace(agentNotes))
            {
                agentNotes = BuildFallbackAssessment(claim);
            }

            return Results.Ok(new
            {
                claimNumber = claim.ClaimNumber,
                agentNotes,
                agentConfigured = agentFactory.IsConfigured,
                agentError
            });
        });
    }

    private static string BuildFallbackAssessment(IntakeClaimRecord c) =>
        "1. **Coverage Recommendation** — Need More Info.\n" +
        "2. **Reasoning** — Foundry agent is not configured in this environment, so " +
        "the live policy lookup against the Azure AI Search knowledge base is unavailable. " +
        $"On the surface the {c.ClaimType} loss appears to fall within the standard cover " +
        $"on policy {c.PolicyNumber}, subject to confirmation of the applicable excess and " +
        "any policy-specific exclusions.\n" +
        "3. **Missing Information** —\n" +
        "   - Confirm policy wording and effective version for this customer.\n" +
        "   - Confirm the applicable excess / deductible.\n" +
        "   - Photos / supporting evidence for the items listed in the description.\n" +
        $"4. **Plain-English Explanation** — Hi {c.CustomerName}, we've received your claim " +
        $"({c.ClaimNumber}) and we're reviewing it against your policy. We'll be in touch " +
        "shortly to confirm cover and request anything else we need.\n" +
        "5. **Human Approval Required** — Yes — final decisions on coverage, exclusions and " +
        "settlement amounts must be confirmed by the Claims Assessor.";

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

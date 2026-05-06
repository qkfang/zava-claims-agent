using ZavaClaims.Agents;
using ZavaClaims.App.Models;
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

        // Sample policy document for a given policy number — drives the
        // "Policy document" card on the assessment page so the user can see
        // exactly what the agent is comparing the claim against.
        app.MapGet("/assessment/policy/{policyNumber}", (string policyNumber) =>
        {
            var policy = PolicyDocumentCatalog.FindPolicy(policyNumber);
            return policy is null
                ? Results.NotFound(new { error = $"policy '{policyNumber}' not found" })
                : Results.Ok(policy);
        });

        // Visual assessment checklist for a given claim — the per-item
        // pass/fail breakdown the agent worked through against the policy
        // document, plus the overall recommendation and reason for it.
        app.MapGet("/assessment/checklist/{claimNumber}", (string claimNumber) =>
        {
            var claim = claimStore.Get(claimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{claimNumber}' not found" });

            var report = PolicyDocumentCatalog.BuildReport(claim);
            return Results.Ok(new
            {
                claimNumber = report.ClaimNumber,
                policyNumber = report.PolicyNumber,
                recommendation = report.Recommendation.ToString(),
                recommendationLabel = report.RecommendationLabel,
                recommendationReason = report.RecommendationReason,
                settlementPosition = report.SettlementPosition,
                items = report.Items.Select(i => new
                {
                    id = i.Id,
                    label = i.Label,
                    status = i.Status.ToString().ToLowerInvariant(),
                    finding = i.Finding,
                    clauseRef = i.ClauseRef,
                }),
            });
        });

        // Engage the Claims Assessment Agent on the selected claim. Mirrors
        // /intake/process: when Foundry is configured we invoke the live
        // ClaimsAssessmentAgent and return its narrative; otherwise we return
        // a deterministic demo summary so the page still flows.
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/assessment/process", async (HttpContext httpContext, AssessmentProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Assessment process: claimNumber={ClaimNumber}", Sanitize(claim.ClaimNumber));

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

            object BuildEnvelope(AgentTraceResult? trace, string? agentError)
            {
                var notes = trace?.Text;
                if (string.IsNullOrWhiteSpace(notes))
                    notes = BuildFallbackAssessment(claim);

                return new
                {
                    claimNumber = claim.ClaimNumber,
                    agentNotes = notes,
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
            }

            if (AgentSseStreaming.WantsEventStream(httpContext))
            {
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("assessment") : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, prompt, BuildEnvelope, logger, "Claims Assessment Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("assessment");
                    traceResult = await agent.RunWithTraceAsync(prompt);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Claims Assessment Agent invocation failed; returning deterministic demo summary");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
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

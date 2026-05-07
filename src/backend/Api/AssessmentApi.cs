using System.Text.Json;
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

            // Build a concise rendering of the policy validation checklist so
            // the agent's narrative can address each clause-level check
            // directly (rather than only summarising at a high level).
            var checklistReport = PolicyDocumentCatalog.BuildReport(claim);
            var checklistBlock = string.Join("\n", checklistReport.Items.Select(i =>
                $"- id={i.Id} | clause={i.ClauseRef} | {i.Label} — preliminary status: {i.Status} — {i.Finding}"));

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
                "POLICY VALIDATION CHECKLIST (per-clause checks for this claim)\n" +
                "--------------------------------------------------------------\n" +
                checklistBlock + "\n\n" +
                "Please review this claim against the relevant Zava Insurance policy " +
                "wording for the customer's policy and assess EACH item in the Policy " +
                "Validation Checklist above. For every checklist item, confirm whether " +
                "it passes, fails, or needs more information, and cite the supporting " +
                "policy clause. Then identify coverage and exclusions, list any missing " +
                "information, and recommend approve / partial / decline in your standard " +
                "output format. Add a section titled \"Policy Validation Checklist Review\" " +
                "with one bullet per checklist item before the Plain-English Explanation, " +
                "and at the very end of your reply emit the fenced ```json``` block " +
                "described in your system instructions, containing one entry in `items` " +
                "for every checklist id supplied above (preserve the id and clauseRef).";

            object BuildEnvelope(AgentTraceResult? trace, string? agentError)
            {
                var rawText = trace?.Text;

                // Try to extract the structured checklist report the agent
                // is instructed to emit, so Step 4 in the UI can render the
                // agent's own validation results. Fall back to the
                // deterministic per-claim report when the agent isn't
                // configured or didn't produce a parseable JSON block.
                var agentChecklistReport = TryExtractAgentChecklist(rawText)
                    ?? ChecklistReportFromBuilt(checklistReport);

                // Strip the trailing fenced ```json``` block from the
                // narrative tab so the operator sees a clean prose write-up;
                // the structured data is exposed via agentChecklistReport
                // and the unmodified text is still in agentRawOutput.text.
                var notes = StripTrailingJsonFence(rawText);
                if (string.IsNullOrWhiteSpace(notes))
                    notes = BuildFallbackAssessment(claim);

                return new
                {
                    claimNumber = claim.ClaimNumber,
                    agentNotes = notes,
                    agentConfigured = agentFactory.IsConfigured,
                    agentError,
                    agentInput = trace?.Input,
                    agentChecklistReport,
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

    /// <summary>
    /// Project the deterministic <see cref="AssessmentReport"/> into the same
    /// JSON shape the Claims Assessment Agent is asked to emit, so the UI can
    /// render Step 4 from a single field regardless of whether the agent
    /// produced the result or we fell back to the built-in catalogue.
    /// </summary>
    private static object ChecklistReportFromBuilt(AssessmentReport report) => new
    {
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
        }).ToArray(),
    };

    /// <summary>
    /// Locate a fenced <c>```json … ```</c> block inside the agent's reply
    /// and parse it as the structured checklist report described in the
    /// agent system prompt. Returns null when no parseable block is found.
    /// </summary>
    private static object? TryExtractAgentChecklist(string? agentText)
    {
        if (string.IsNullOrWhiteSpace(agentText)) return null;

        // Walk the text and consider every fenced ```json block; take the
        // last one that parses successfully — the agent is instructed to
        // place the JSON at the end of its reply.
        const string fence = "```";
        object? parsed = null;
        var search = 0;
        while (search < agentText.Length)
        {
            var openIdx = agentText.IndexOf(fence, search, StringComparison.Ordinal);
            if (openIdx < 0) break;

            var langStart = openIdx + fence.Length;
            var langEnd = agentText.IndexOf('\n', langStart);
            if (langEnd < 0) break;

            var lang = agentText.Substring(langStart, langEnd - langStart).Trim();
            var bodyStart = langEnd + 1;
            var closeIdx = agentText.IndexOf(fence, bodyStart, StringComparison.Ordinal);
            if (closeIdx < 0) break;

            if (string.Equals(lang, "json", StringComparison.OrdinalIgnoreCase))
            {
                var body = agentText.Substring(bodyStart, closeIdx - bodyStart).Trim();
                var maybe = TryParseChecklistJson(body);
                if (maybe is not null) parsed = maybe;
            }

            search = closeIdx + fence.Length;
        }

        // Fallback — some models drop the fence; try slicing from the first
        // '{' to the last '}' and parse that as JSON.
        if (parsed is null)
        {
            var firstBrace = agentText.IndexOf('{');
            var lastBrace = agentText.LastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace)
            {
                var slice = agentText.Substring(firstBrace, lastBrace - firstBrace + 1);
                parsed = TryParseChecklistJson(slice);
            }
        }

        return parsed;
    }

    private static object? TryParseChecklistJson(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("items", out var itemsEl) || itemsEl.ValueKind != JsonValueKind.Array)
                return null;

            string? Str(JsonElement el, string name) =>
                el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

            var items = new List<object>();
            foreach (var it in itemsEl.EnumerateArray())
            {
                if (it.ValueKind != JsonValueKind.Object) continue;
                var status = (Str(it, "status") ?? "info").ToLowerInvariant();
                if (status is not ("pass" or "fail" or "info")) status = "info";
                items.Add(new
                {
                    id = Str(it, "id") ?? string.Empty,
                    label = Str(it, "label") ?? string.Empty,
                    status,
                    finding = Str(it, "finding") ?? string.Empty,
                    clauseRef = Str(it, "clauseRef") ?? string.Empty,
                });
            }

            return new
            {
                recommendation = Str(root, "recommendation") ?? "NeedMoreInfo",
                recommendationLabel = Str(root, "recommendationLabel") ?? "Need More Info",
                recommendationReason = Str(root, "recommendationReason") ?? string.Empty,
                settlementPosition = Str(root, "settlementPosition") ?? string.Empty,
                items = items.ToArray(),
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Remove a trailing fenced <c>```json … ```</c> block from the agent's
    /// reply so the narrative tab shows only the prose write-up; the
    /// structured checklist is exposed separately via
    /// <c>agentChecklistReport</c>.
    /// </summary>
    private static string? StripTrailingJsonFence(string? agentText)
    {
        if (string.IsNullOrWhiteSpace(agentText)) return agentText;

        var trimmed = agentText.TrimEnd();
        if (!trimmed.EndsWith("```", StringComparison.Ordinal)) return agentText;

        var bodyEnd = trimmed.Length - 3;
        var openIdx = trimmed.LastIndexOf("```", bodyEnd - 1, StringComparison.Ordinal);
        if (openIdx < 0) return agentText;

        var langStart = openIdx + 3;
        var langEnd = trimmed.IndexOf('\n', langStart);
        if (langEnd < 0 || langEnd > bodyEnd) return agentText;
        var lang = trimmed.Substring(langStart, langEnd - langStart).Trim();
        if (!string.Equals(lang, "json", StringComparison.OrdinalIgnoreCase)) return agentText;

        return trimmed.Substring(0, openIdx).TrimEnd();
    }
}

using System.Text;
using System.Text.RegularExpressions;
using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record FraudProcessRequest(string ClaimNumber, List<string>? DocumentIds);
record FraudVerifyRequest(string ClaimNumber, List<string> DocumentIds);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Fraud Investigation
/// agent page (<c>/agents/fraud-investigation</c>). These let the page:
///
/// 1. List every claim minted by the Claims Intake Try It Out tab so the
///    user can pick a Claim ID from a dropdown.
/// 2. Show the scan documents / IDs already attached to each claim and
///    allow extra sample documents to be tacked on.
/// 3. Run the selected case + its documents through the Fraud Investigation
///    Agent (Felix) and the document-authenticity verifier:
///    Content Understanding extracts authenticity-oriented fields from
///    every document, a deterministic rules layer scores each one as
///    legit / suspicious / fake, and the Foundry agent's narrative
///    references the document findings.
///
/// A deterministic fallback runs when Foundry / Content Understanding is
/// not configured so the demo always tells a complete story end-to-end.
/// </summary>
public static class FraudApi
{
    public static void MapFraudEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        FraudCaseDocumentStore caseDocStore,
        FraudDocumentVerifier verifier,
        ILogger logger)
    {
        // List of claims currently held in memory. Used to populate the
        // dropdown on the Fraud Investigation Try It Out tab.
        app.MapGet("/fraud/claims", () =>
        {
            var claims = claimStore.All().Select(r =>
            {
                caseDocStore.EnsureClaimAttachments(r.ClaimNumber, r.SampleId);
                return new
                {
                    claimNumber = r.ClaimNumber,
                    customerName = r.CustomerName,
                    policyNumber = r.PolicyNumber,
                    claimType = r.ClaimType,
                    incidentDate = r.IncidentDate,
                    incidentLocation = r.IncidentLocation,
                    incidentDescription = r.IncidentDescription,
                    estimatedLoss = r.EstimatedLoss,
                    urgency = r.Urgency,
                    createdAt = r.CreatedAt.ToString("u"),
                };
            });
            return Results.Ok(claims);
        });

        // Static manifest of every sample document the demo can attach to a
        // claim. Drives both the case-document panel and the "📎 Add sample
        // docs" popover on the page.
        app.MapGet("/fraud/samples", () =>
        {
            var samples = caseDocStore.AllSamples().Select(s => new
            {
                id = s.Id,
                label = s.Label,
                kind = s.Kind,
                src = s.Src,
                expected = s.Expected,
                description = s.Description,
            });
            return Results.Ok(samples);
        });

        // Documents pre-attached to a specific claim (deterministic per
        // sampleId — see FraudCaseDocumentStore.SeedCaseDefaults).
        app.MapGet("/fraud/claims/{claimNumber}/documents", (string claimNumber) =>
        {
            var claim = claimStore.Get(claimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{claimNumber}' not found" });

            caseDocStore.EnsureClaimAttachments(claim.ClaimNumber, claim.SampleId);
            var docs = caseDocStore.DocumentsForClaim(claim.ClaimNumber);
            return Results.Ok(docs);
        });

        // Verify a list of sample documents against a claim. Returns the
        // per-document verdict, failure reasons, and the full list of
        // checks that were performed.
        app.MapPost("/fraud/documents/verify", async (FraudVerifyRequest request, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            var samples = caseDocStore.ResolveSamples(request.DocumentIds ?? new List<string>());
            var baseUrl = $"{ctx.Request.Scheme}://{ctx.Request.Host}";
            var verifications = await verifier.VerifyAsync(claim, samples, baseUrl);

            return Results.Ok(new
            {
                claimNumber = claim.ClaimNumber,
                contentUnderstandingConfigured = verifier.ContentUnderstandingConfigured,
                checkNames = verifier.CheckNames,
                documents = verifications,
            });
        });

        // Engage the Fraud Investigation Agent on the selected claim.
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/fraud/process", async (HttpContext httpContext, FraudProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Fraud process: claimNumber={ClaimNumber}", Sanitize(claim.ClaimNumber));

            // Verify any documents the page asked us to include. Defaults
            // to the seeded case documents when none are supplied so the
            // demo always has something to talk about.
            caseDocStore.EnsureClaimAttachments(claim.ClaimNumber, claim.SampleId);
            var requestedIds = request.DocumentIds is { Count: > 0 }
                ? request.DocumentIds
                : caseDocStore.DocumentsForClaim(claim.ClaimNumber).Select(d => d.Id).ToList();
            var samples = caseDocStore.ResolveSamples(requestedIds);
            var baseUrl = $"{httpContext.Request.Scheme}://{httpContext.Request.Host}";
            IReadOnlyList<FraudDocumentVerification> documentVerifications = samples.Count > 0
                ? await verifier.VerifyAsync(claim, samples, baseUrl)
                : Array.Empty<FraudDocumentVerification>();

            // Build a deterministic fraud-review summary from the captured
            // claim. This is what we surface in the UI; the live Foundry
            // agent's narrative is added alongside when configured.
            var (riskLevel, riskScore, riskSummary, indicators, inconsistencies, actions, approvalRequired)
                = AnalyseClaim(claim, documentVerifications);

            var prompt = BuildAgentPrompt(claim, documentVerifications);

            object BuildEnvelope(AgentTraceResult? trace, string? agentError) => new
            {
                claimNumber = claim.ClaimNumber,
                riskLevel,
                riskScore,
                riskSummary,
                indicators,
                inconsistencies,
                actions,
                approvalRequired,
                documents = documentVerifications,
                checkNames = verifier.CheckNames,
                contentUnderstandingConfigured = verifier.ContentUnderstandingConfigured,
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
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("fraud") : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, prompt, BuildEnvelope, logger, "Fraud Investigation Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("fraud");
                    traceResult = await agent.RunWithTraceAsync(prompt);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Fraud Investigation Agent invocation failed; using deterministic demo analysis only");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
        });
    }

    /// <summary>
    /// Build a structured prompt for the Fraud Investigation Agent. Mirrors
    /// the way the Claims Intake demo concatenates the email + form text,
    /// and now also surfaces the per-document authenticity findings so the
    /// agent can incorporate them into the risk narrative.
    /// </summary>
    private static string BuildAgentPrompt(
        IntakeClaimRecord c,
        IReadOnlyList<FraudDocumentVerification> documents)
    {
        var sb = new StringBuilder();
        sb.AppendLine("CLAIM CASE FOR FRAUD REVIEW");
        sb.AppendLine("===========================");
        sb.AppendLine($"Claim number: {c.ClaimNumber}");
        sb.AppendLine($"Lodged: {c.CreatedAt:u}");
        sb.AppendLine($"Customer: {c.CustomerName} <{c.CustomerEmail}> {c.CustomerPhone}");
        sb.AppendLine($"Policy: {c.PolicyNumber}");
        sb.AppendLine($"Claim type: {c.ClaimType}");
        sb.AppendLine($"Incident date: {c.IncidentDate}");
        sb.AppendLine($"Incident location: {c.IncidentLocation}");
        sb.AppendLine($"Estimated loss: {c.EstimatedLoss}");
        sb.AppendLine($"Urgency at intake: {c.Urgency} — {c.UrgencyReason}");
        sb.AppendLine();
        sb.AppendLine("Incident description (as captured at intake):");
        sb.AppendLine(c.IncidentDescription);
        sb.AppendLine();

        if (documents.Count > 0)
        {
            sb.AppendLine("DOCUMENT AUTHENTICITY FINDINGS");
            sb.AppendLine("------------------------------");
            sb.AppendLine("Each scan document attached to the case has been processed through");
            sb.AppendLine("Azure Content Understanding and a deterministic checks layer. Use");
            sb.AppendLine("these findings as evidence when you cite indicators in your output.");
            sb.AppendLine();
            int i = 1;
            foreach (var doc in documents)
            {
                sb.AppendLine($"Document #{i} — {doc.Label} ({doc.Kind})");
                sb.AppendLine($"  Verdict: {doc.Verdict}    Source: {doc.Source}");
                if (doc.FailureReasons.Count > 0)
                {
                    sb.AppendLine("  Why this verdict:");
                    foreach (var reason in doc.FailureReasons)
                        sb.AppendLine($"    - {reason}");
                }
                sb.AppendLine("  Checks performed:");
                foreach (var check in doc.Checks)
                    sb.AppendLine($"    [{check.Status}] {check.Name} — {check.Detail}");
                sb.AppendLine();
                i++;
            }
        }

        sb.AppendLine("Please review this claim for fraud indicators. Build a timeline,");
        sb.AppendLine("compare against the customer's prior history (assume relevant signals");
        sb.AppendLine("are available via the prior-claims and document tools), and produce");
        sb.AppendLine("a Fraud Risk Score, Risk Indicators, Timeline Inconsistencies,");
        sb.AppendLine("Investigation Action Plan, and Human Approval Required sections.");
        sb.AppendLine("When citing indicators driven by document findings, refer to the");
        sb.AppendLine("specific document by its number above.");
        return sb.ToString();
    }

    /// <summary>
    /// Deterministic fraud-indicator analysis used to drive the Try It Out
    /// panel. Looks at the captured claim fields for common signals (high
    /// estimated loss, urgent reports, missing data, suspicious wording),
    /// and folds in the document-authenticity verdicts so document-level
    /// red flags show up alongside the claim-level ones.
    /// </summary>
    private static (string Level, int Score, string Summary, List<string> Indicators,
        List<string> Inconsistencies, List<string> Actions, string ApprovalRequired)
        AnalyseClaim(IntakeClaimRecord c, IReadOnlyList<FraudDocumentVerification> documents)
    {
        var indicators = new List<string>();
        var inconsistencies = new List<string>();
        var actions = new List<string>();
        int score = 15; // baseline review score

        // Indicator 1 — high estimated loss
        var lossAmount = ParseCurrency(c.EstimatedLoss);
        if (lossAmount >= 10000)
        {
            indicators.Add($"High estimated loss ({c.EstimatedLoss}) — exceeds the routine straight-through threshold; verify with itemised proof of ownership.");
            score += 25;
        }
        else if (lossAmount >= 3000)
        {
            indicators.Add($"Moderate estimated loss ({c.EstimatedLoss}) — confirm valuations with receipts or independent quotes.");
            score += 10;
        }

        // Indicator 2 — high urgency at intake (often correlates with vulnerability,
        // but for fraud we use it as a tempo signal worth verifying).
        if (string.Equals(c.Urgency, "High", StringComparison.OrdinalIgnoreCase))
        {
            indicators.Add("Intake flagged urgency as High — verify the urgency driver (emergency repairs, vulnerability, time pressure to settle).");
            score += 10;
        }

        // Indicator 3 — suspicious wording in the description
        var desc = (c.IncidentDescription ?? string.Empty).ToLowerInvariant();
        if (Regex.IsMatch(desc, "\\b(stolen|theft|burglary|break-?in)\\b"))
        {
            indicators.Add("Reported as theft/burglary — request the police event number and cross-check against police records and prior-claims theft history.");
            score += 15;
        }
        if (Regex.IsMatch(desc, "\\b(no witnesses?|alone|nobody saw|no one saw)\\b"))
        {
            indicators.Add("Reported as having no witnesses — consider canvassing for CCTV, neighbours, or transaction records to corroborate the timeline.");
            score += 10;
        }
        if (Regex.IsMatch(desc, "\\b(cash|cash only|no receipts?)\\b"))
        {
            indicators.Add("Reported cash purchase or missing receipts — request alternative proof of ownership (photos with metadata, bank statements, serial numbers).");
            score += 10;
        }

        // Indicator 4 — recently lodged policy details vs incident date
        if (TryParseDate(c.IncidentDate, out var incidentDate))
        {
            var daysUntilIncident = (incidentDate.Date - DateTime.UtcNow.Date).Days;
            if (daysUntilIncident > 30)
            {
                inconsistencies.Add($"Incident date ({c.IncidentDate}) is more than 30 days in the future relative to lodgement — confirm the date is correct.");
                score += 10;
            }
        }
        else if (!string.IsNullOrWhiteSpace(c.IncidentDate))
        {
            inconsistencies.Add($"Incident date '{c.IncidentDate}' is not a parseable YYYY-MM-DD date — request clarification.");
            score += 5;
        }

        // Inconsistency — missing key fields
        if (string.IsNullOrWhiteSpace(c.PolicyNumber))
        {
            inconsistencies.Add("Policy number was not captured — claim cannot be verified against a live policy.");
            score += 10;
        }
        if (string.IsNullOrWhiteSpace(c.IncidentLocation))
        {
            inconsistencies.Add("Incident location was not captured — request the address or geotag for cross-checks.");
            score += 5;
        }

        // Document-level indicators / inconsistencies
        int docIndex = 0;
        foreach (var doc in documents)
        {
            docIndex++;
            if (doc.Verdict == "fake")
            {
                indicators.Add($"Document #{docIndex} ({doc.Label}) flagged as **fake** — {string.Join("; ", doc.FailureReasons.Take(2))}");
                score += 25;
            }
            else if (doc.Verdict == "suspicious")
            {
                indicators.Add($"Document #{docIndex} ({doc.Label}) flagged as **suspicious** — {string.Join("; ", doc.FailureReasons.Take(2))}");
                score += 12;
            }

            foreach (var check in doc.Checks.Where(c => c.Status == "fail"))
            {
                inconsistencies.Add($"Document #{docIndex}: {check.Name} — {check.Detail}");
            }
        }

        score = Math.Clamp(score, 5, 95);
        var level = score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";

        // Recommended next actions (always include the standard fraud kit)
        actions.Add("Build a full timeline from the email, claim form, and any attached evidence and look for gaps or contradictions.");
        actions.Add("Run a duplicate-receipt and document-tamper check against the network and prior claims.");
        actions.Add($"Pull the customer's prior-claims history for policy {c.PolicyNumber} and any cross-industry signals.");
        if (documents.Any(d => d.Verdict == "fake"))
        {
            actions.Add("Quarantine the document(s) flagged as fake and request originals through the customer's preferred contact channel.");
        }
        if (level == "High")
        {
            actions.Add("Escalate to a human Fraud Investigator for a structured review before any settlement movement.");
            actions.Add("Recommend a holding letter (drafted by Customer Communications) while verification is in progress — never accuse.");
        }
        else if (level == "Medium")
        {
            actions.Add("Request the missing proof of ownership and let assessment continue in parallel; re-score after evidence arrives.");
        }
        else
        {
            actions.Add("No elevated indicators — continue along the standard claims path with routine spot-checks.");
        }

        var summary = level switch
        {
            "High"   => $"Multiple elevated indicators on claim {c.ClaimNumber}. Recommend a human Fraud Investigator review before any payment is approved.",
            "Medium" => $"Some indicators worth verifying on claim {c.ClaimNumber}. Continue assessment in parallel and re-score once evidence is gathered.",
            _        => $"No elevated fraud indicators on claim {c.ClaimNumber}. Continue along the standard claims path."
        };

        var approval = level == "Low"
            ? "No — routine claim, no fraud-related decisions required."
            : "Yes — fraud referral, claim delay, customer interview or fraud-based decline always require human approval.";

        return (level, score, summary, indicators, inconsistencies, actions, approval);
    }

    private static decimal ParseCurrency(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0m;
        var digits = Regex.Replace(raw, "[^0-9.]", "");
        return decimal.TryParse(digits, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;
    }

    private static bool TryParseDate(string? raw, out DateTime value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        return DateTime.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
            out value);
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

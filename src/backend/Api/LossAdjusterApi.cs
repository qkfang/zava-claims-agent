using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record LossAdjusterProcessRequest(string ClaimNumber);
record LossAdjusterChatRequest(string PreviousResponseId, string Message);

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
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/loss-adjuster/process", async (HttpContext httpContext, LossAdjusterProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Loss Adjuster process: claimNumber={ClaimNumber}",
                Sanitize(claim.ClaimNumber));

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
                "AVAILABLE QUOTE DOCUMENTS (call analyzeQuote on each)\n" +
                "----------------------------------------------------\n" +
                "- /loss-adjuster/samples/quote-acme-restoration.json\n" +
                "- /loss-adjuster/samples/quote-bayside-build.json\n" +
                "- /loss-adjuster/samples/quote-sunrise-home.json\n\n" +
                "TASK\n" +
                "----\n" +
                "Investigate the damage / complex loss on this claim.\n" +
                "1. Call the analyzeQuote MCP tool for each quote URL above.\n" +
                "2. Call compareQuotes with the resulting JSON array to get a\n" +
                "   markdown comparison table, a Mermaid bar-chart diagram of\n" +
                "   totals, and flagged anomalies. Embed those verbatim in\n" +
                "   the 'Cost Reasonableness' section of your report.\n" +
                "3. Call generateClaimExcel with the claim summary, the quotes\n" +
                "   array, and your recommendations. Include the returned\n" +
                "   download URL as a markdown link in the 'Recommendation\n" +
                "   for Assessor' section.\n" +
                "4. Produce your structured Loss Adjuster Report (Damage\n" +
                "   Scope, Cause of Loss, Cost Reasonableness, Inspection\n" +
                "   Questions, Recommendation for Assessor, Human Approval\n" +
                "   Required).";

            object BuildEnvelope(AgentTraceResult? trace, string? agentError)
            {
                var notes = trace?.Text;
                if (string.IsNullOrWhiteSpace(notes))
                    notes = BuildFallbackAdjusterReport(claim, agentError, agentFactory.IsConfigured);

                return new
                {
                    claimNumber = claim.ClaimNumber,
                    customerName = claim.CustomerName,
                    claimType = claim.ClaimType,
                    agentNotes = notes,
                    agentError,
                    agentConfigured = agentFactory.IsConfigured,
                    agentInput = trace?.Input,
                    // Surface previousResponseId so the page can chain follow-up
                    // chat turns into the same Foundry conversation.
                    previousResponseId = trace?.ResponseId,
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
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("loss-adjuster") : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, brief, BuildEnvelope, logger, "Loss Adjuster Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("loss-adjuster");
                    traceResult = await agent.RunWithTraceAsync(brief);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Loss Adjuster Agent invocation failed");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
        });

        // Continue the Loss Adjuster conversation. Takes the previousResponseId
        // returned from the initial /loss-adjuster/process call (or the most
        // recent /loss-adjuster/chat turn) plus a free-form follow-up question
        // from the user, and streams the agent's reply back over SSE in the
        // same envelope shape as /process. This powers the "Chat with the
        // agent" follow-up panel on the Loss Adjuster page so end users can
        // ask follow-up questions and have a discussion with the agent in the
        // same Foundry conversation, with citations / tool calls preserved.
        app.MapPost("/loss-adjuster/chat", async (HttpContext httpContext, LossAdjusterChatRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.PreviousResponseId))
                return Results.BadRequest(new { error = "previousResponseId is required" });
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest(new { error = "message is required" });

            logger.LogInformation("Loss Adjuster chat: previousResponseId={ResponseId}",
                Sanitize(request.PreviousResponseId));

            object BuildChatEnvelope(AgentTraceResult? trace, string? agentError)
            {
                var notes = trace?.Text ?? string.Empty;
                if (string.IsNullOrWhiteSpace(notes))
                {
                    notes = !agentFactory.IsConfigured
                        ? "_Foundry agent is not configured in this environment, so the live loss-adjuster chat is unavailable._"
                        : !string.IsNullOrWhiteSpace(agentError)
                            ? $"_The Loss Adjuster Agent did not return a follow-up reply ({agentError})._"
                            : "_The Loss Adjuster Agent completed without producing follow-up text._";
                }

                return new
                {
                    agentNotes = notes,
                    agentError,
                    agentConfigured = agentFactory.IsConfigured,
                    agentInput = trace?.Input,
                    previousResponseId = trace?.ResponseId ?? request.PreviousResponseId,
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
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("loss-adjuster") : null;
                await AgentSseStreaming.StreamChatAsync(
                    httpContext, streamingAgent, request.PreviousResponseId, request.Message,
                    BuildChatEnvelope, logger, "Loss Adjuster Agent");
                return Results.Empty;
            }

            AgentTraceResult? chatTrace = null;
            string? chatError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("loss-adjuster");
                    chatTrace = await agent.ChatWithTraceAsync(request.PreviousResponseId, request.Message);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Loss Adjuster Agent chat invocation failed");
                    chatError = ex.Message;
                }
            }

            return Results.Ok(BuildChatEnvelope(chatTrace, chatError));
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');

    /// <summary>
    /// Deterministic Loss Adjuster narrative used when the live Foundry agent
    /// is not configured, fails, or returns no text. Guarantees the
    /// <c>agentNotes</c> field on the response envelope is always populated so
    /// the page never falls through to "Loss Adjuster Agent returned no
    /// narrative." The structure mirrors the markdown sections the real agent
    /// is instructed to produce (Damage Scope, Cause of Loss, Cost
    /// Reasonableness, Inspection Questions, Recommendation for Assessor,
    /// Human Approval Required) so the UI renders consistently.
    /// </summary>
    private static string BuildFallbackAdjusterReport(
        IntakeClaimRecord c, string? agentError, bool agentConfigured)
    {
        string preface;
        if (!agentConfigured)
        {
            preface =
                "_Foundry agent is not configured in this environment, so the live " +
                "loss-adjuster review is unavailable. The summary below is a " +
                "deterministic fallback based on the intake details only._\n\n";
        }
        else if (!string.IsNullOrWhiteSpace(agentError))
        {
            preface =
                "_The Loss Adjuster Agent invocation did not return a narrative " +
                $"({agentError}). The summary below is a deterministic fallback " +
                "based on the intake details only._\n\n";
        }
        else
        {
            preface =
                "_The Loss Adjuster Agent completed without producing narrative " +
                "text (it may have only invoked tools). The summary below is a " +
                "deterministic fallback based on the intake details only._\n\n";
        }

        var location = string.IsNullOrWhiteSpace(c.IncidentLocation) ? "the incident location" : c.IncidentLocation;
        var description = string.IsNullOrWhiteSpace(c.IncidentDescription) ? "(no incident description provided)" : c.IncidentDescription;

        return preface +
            $"### Loss Adjuster Report — {c.ClaimNumber}\n\n" +
            "1. **Damage Scope**\n" +
            $"   - Reported {c.ClaimType} loss at {location} on {c.IncidentDate}.\n" +
            $"   - Customer-reported estimated loss: {c.EstimatedLoss}.\n" +
            $"   - Description on file: {description}\n\n" +
            "2. **Cause of Loss** — Unconfirmed (Confidence: Low). On-site " +
            "inspection and supporting documentation are required to verify " +
            "the proximate cause described by the customer.\n\n" +
            "3. **Cost Reasonableness** — Not yet assessed. No contractor " +
            "quotes have been analysed in this fallback path. Once quotes are " +
            "available the live agent will produce the comparison table and " +
            "Mermaid totals chart.\n\n" +
            "4. **Inspection Questions**\n" +
            "   - Confirm the proximate cause and timeline of the loss.\n" +
            "   - Photograph and document all damaged items and surrounding context.\n" +
            "   - Identify any pre-existing damage or maintenance issues.\n" +
            "   - Verify access, safety and any third-party involvement.\n\n" +
            "5. **Recommendation for Assessor** — Hold coverage decision pending " +
            "on-site inspection and at least one verified contractor quote. " +
            "Engage the supplier panel to obtain quotes for comparison.\n\n" +
            $"6. **Human Approval Required** — Yes — urgency on file is **{c.Urgency}**" +
            (string.IsNullOrWhiteSpace(c.UrgencyReason) ? "" : $" ({c.UrgencyReason})") +
            "; final scope, cause and cost reasonableness must be signed off by a human loss adjuster.";
    }
}

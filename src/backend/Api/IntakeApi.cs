using System.Text.Json;
using ZavaClaims.Agents;
using ZavaClaims.App.Models;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record IntakeProcessRequest(string SampleId);
record IntakeSubmitRequest(
    string SampleId,
    string CustomerName,
    string CustomerEmail,
    string CustomerPhone,
    string PolicyNumber,
    string ClaimType,
    string IncidentDate,
    string IncidentLocation,
    string IncidentDescription,
    string EstimatedLoss,
    string PreferredContact,
    string Urgency,
    string UrgencyReason);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Claims Intake agent
/// page (<c>/agents/claims-intake</c>). These let the page:
///
/// 1. List the four sample emails + attached Word claim forms.
/// 2. Run the inbound message through the Claims Intake Agent (and the
///    CtAgExtractCU extraction pattern) to produce intake-form fields and
///    an urgency assessment.
/// 3. Submit the form, mint a random claim number, and remember it in the
///    in-memory <see cref="IntakeClaimStore"/> so downstream agents can
///    pick the case up by claim number.
/// </summary>
public static class IntakeApi
{
    public static void MapIntakeEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // List of sample emails (with attached form metadata) available to
        // the demo. Body / form text are only returned by the per-sample
        // GET below to keep the listing payload small.
        app.MapGet("/intake/samples", () =>
        {
            var samples = IntakeSampleCatalog.All.Select(s => new
            {
                id = s.Id,
                label = s.Label,
                claimType = s.ClaimType,
                customerName = s.CustomerName,
                customerEmail = s.CustomerEmail,
                policyNumber = s.PolicyNumber,
                emailSubject = s.EmailSubject,
                emailFrom = s.EmailFrom,
                emailDate = s.EmailDate,
                formFileName = s.FormFileName
            });
            return Results.Ok(samples);
        });

        app.MapGet("/intake/samples/{id}", (string id) =>
        {
            var sample = IntakeSampleCatalog.FindById(id);
            if (sample is null)
                return Results.NotFound(new { error = $"sample '{id}' not found" });

            return Results.Ok(new
            {
                id = sample.Id,
                label = sample.Label,
                claimType = sample.ClaimType,
                customerName = sample.CustomerName,
                customerEmail = sample.CustomerEmail,
                policyNumber = sample.PolicyNumber,
                emailSubject = sample.EmailSubject,
                emailFrom = sample.EmailFrom,
                emailDate = sample.EmailDate,
                emailBody = sample.EmailBody,
                formFileName = sample.FormFileName,
                formDocumentText = sample.FormDocumentText
            });
        });

        // Engage the Claims Intake Agent. The agent receives the email body
        // plus the (already-text-extracted) Word claim form — analogous to
        // CtAgExtractCU which receives raw markdown from a document — and
        // we return the canonical intake fields + urgency assessment.
        //
        // For demo reliability, structured fields come from the catalogue
        // entry. When Foundry is configured, we also invoke the live
        // ClaimsIntakeAgent and surface its narrative in `agentNotes`.
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/intake/process", async (HttpContext httpContext, IntakeProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.SampleId))
                return Results.BadRequest(new { error = "sampleId is required" });

            var sample = IntakeSampleCatalog.FindById(request.SampleId);
            if (sample is null)
                return Results.NotFound(new { error = $"sample '{request.SampleId}' not found" });

            logger.LogInformation("Intake process: sampleId={SampleId}", Sanitize(sample.Id));

            // Mirrors how /notice/* drives CtAgExtractCU: feed the
            // already-extracted document text directly to the agent.
            var combined =
                "INBOUND CLAIM EMAIL\n" +
                "===================\n" +
                $"From: {sample.EmailFrom}\n" +
                $"Date: {sample.EmailDate}\n" +
                $"Subject: {sample.EmailSubject}\n\n" +
                sample.EmailBody +
                "\n\nATTACHED CLAIM FORM (" + sample.FormFileName + ")\n" +
                "===========================================\n" +
                sample.FormDocumentText;

            object BuildEnvelope(AgentTraceResult? trace, string? agentError) => new
            {
                sampleId = sample.Id,
                fields = sample.ExpectedFields,
                urgency = sample.ExpectedUrgency,
                urgencyReason = sample.ExpectedUrgencyReason,
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
                var streamingAgent = agentFactory.IsConfigured ? agentFactory.Create("intake") : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, combined, BuildEnvelope, logger, "Claims Intake Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("intake");
                    traceResult = await agent.RunWithTraceAsync(combined);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Claims Intake Agent invocation failed; falling back to deterministic demo data");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
        });

        // Submitting the (possibly edited) intake form mints a fresh
        // CLM-YYYYMMDD-XXXXXX claim number and remembers the case in
        // memory so the next agent in the demo can pick it up.
        app.MapPost("/intake/submit", (IntakeSubmitRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.SampleId))
                return Results.BadRequest(new { error = "sampleId is required" });

            var fields = new IntakeExtractedFields(
                CustomerName: request.CustomerName ?? string.Empty,
                CustomerEmail: request.CustomerEmail ?? string.Empty,
                CustomerPhone: request.CustomerPhone ?? string.Empty,
                PolicyNumber: request.PolicyNumber ?? string.Empty,
                ClaimType: request.ClaimType ?? string.Empty,
                IncidentDate: request.IncidentDate ?? string.Empty,
                IncidentLocation: request.IncidentLocation ?? string.Empty,
                IncidentDescription: request.IncidentDescription ?? string.Empty,
                EstimatedLoss: request.EstimatedLoss ?? string.Empty,
                PreferredContact: request.PreferredContact ?? string.Empty);

            var record = claimStore.Add(
                request.SampleId,
                fields,
                request.Urgency ?? "Unspecified",
                request.UrgencyReason ?? string.Empty);

            logger.LogInformation("Intake submit: minted {ClaimNumber} for sample {SampleId}",
                record.ClaimNumber, Sanitize(request.SampleId));

            return Results.Ok(new
            {
                claimNumber = record.ClaimNumber,
                createdAt = record.CreatedAt,
                handoff = "Claims Assessment Agent"
            });
        });

        // Read-only view used for diagnostics / downstream agents.
        app.MapGet("/intake/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

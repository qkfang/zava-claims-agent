using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record SupplierProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Supplier Coordinator
/// agent page (<c>/agents/supplier-coordinator</c>). These let the page:
///
/// 1. List the claims minted earlier by the Claims Intake demo, so the user
///    can pick one from a dropdown.
/// 2. Engage the <see cref="ZavaClaims.Agents.SupplierCoordinatorAgent"/>
///    against the selected claim — recommending a supplier, suggesting
///    appointment slots, and drafting a customer update — and surface its
///    narrative back to the page alongside a deterministic supplier match
///    so the demo also works without a Foundry connection configured.
/// 3. Download the generated quote-request PDF.
/// </summary>
public static class SupplierApi
{
    public static void MapSupplierEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        var pdfService = app.Services.GetRequiredService<QuoteRequestPdfService>();
        // List the claims currently held in memory by the intake demo, so
        // the Supplier Coordination "Try It Out" page can populate its
        // claim-ID dropdown. Returns just the lightweight summary needed
        // for the dropdown — full details are fetched by claim number.
        app.MapGet("/supplier/claims", () =>
        {
            var claims = claimStore.All().Select(c => new
            {
                claimNumber = c.ClaimNumber,
                customerName = c.CustomerName,
                claimType = c.ClaimType,
                incidentLocation = c.IncidentLocation,
                urgency = c.Urgency,
                createdAt = c.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Single-claim lookup so the page can render a quick claim summary
        // before the user engages the agent. (The /intake/claims/{id}
        // endpoint already exists and returns the same record; this is the
        // supplier-flow alias to keep the demo URL surface self-contained.)
        app.MapGet("/supplier/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Supplier Coordinator Agent on the selected claim.
        // Mirrors /intake/process: a deterministic match is always returned
        // so the demo is reliable, and — when Foundry is configured — the
        // live agent's narrative is surfaced in `agentNotes`.
        app.MapPost("/supplier/process", async (SupplierProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var claim = claimStore.Get(request.ClaimNumber);
            if (claim is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Supplier process: claimNumber={ClaimNumber} claimType={ClaimType}",
                Sanitize(claim.ClaimNumber), Sanitize(claim.ClaimType));

            var match = SupplierCatalog.Match(claim.ClaimType, claim.IncidentLocation, claim.ClaimNumber);

            // Look up the directory entries for the claim type so we can
            // surface indicative pricing and a "best price" pick alongside
            // the deterministic match. Mirrors what the Foundry agent will
            // see via the lookupSuppliers MCP tool.
            var directory = SupplierDirectory.Lookup(claim.ClaimType, claim.IncidentLocation);
            var bestPrice = directory.FirstOrDefault();

            // Deterministically generate the quote-request PDF so the
            // download link in the UI always works, even when Foundry is
            // not configured. When it is configured the agent can also
            // generate a (separate) PDF via the generateQuoteRequestPdf
            // MCP tool and include its URL in the narrative.
            var pdfRecord = pdfService.Generate(new QuoteRequestPdfInput(
                ClaimNumber: claim.ClaimNumber,
                CustomerName: claim.CustomerName,
                PolicyNumber: claim.PolicyNumber,
                ClaimType: claim.ClaimType,
                IncidentDate: claim.IncidentDate,
                IncidentLocation: claim.IncidentLocation,
                IncidentDescription: claim.IncidentDescription,
                EstimatedLoss: claim.EstimatedLoss,
                Urgency: claim.Urgency,
                SupplierName: bestPrice?.Name ?? match.Recommended.Name,
                SupplierSpecialty: bestPrice?.Specialty ?? match.Recommended.Specialty,
                SupplierLocation: bestPrice?.Location ?? match.Recommended.Location,
                QuoteAmount: bestPrice?.QuoteAmount ?? 0m,
                QuoteCurrency: bestPrice?.QuoteCurrency ?? "AUD",
                Scope: match.Scope,
                AppointmentOptions: match.AppointmentOptions));
            var quoteRequestPdfUrl = $"/supplier/quote-request/{pdfRecord.Id}.pdf";

            string? agentNotes = null;
            string? agentInput = null;
            object? agentRawOutput = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var prompt =
                        "APPROVED CLAIM — READY FOR SUPPLIER COORDINATION\n" +
                        "================================================\n" +
                        $"Claim number: {claim.ClaimNumber}\n" +
                        $"Customer: {claim.CustomerName} ({claim.CustomerEmail}, {claim.CustomerPhone})\n" +
                        $"Policy: {claim.PolicyNumber}\n" +
                        $"Claim type: {claim.ClaimType}\n" +
                        $"Incident date: {claim.IncidentDate}\n" +
                        $"Incident location: {claim.IncidentLocation}\n" +
                        $"Estimated loss: {claim.EstimatedLoss}\n" +
                        $"Urgency: {claim.Urgency} — {claim.UrgencyReason}\n" +
                        $"Preferred contact: {claim.PreferredContact}\n\n" +
                        "Incident description:\n" +
                        claim.IncidentDescription + "\n\n" +
                        "AVAILABLE SUPPLIERS (from Zava's approved network)\n" +
                        "==================================================\n" +
                        match.CandidatesText + "\n\n" +
                        "TASK\n" +
                        "====\n" +
                        "1. Call the lookupSuppliers MCP tool with this claim's " +
                        "type and location to retrieve indicative quotes for the " +
                        "approved supplier network and identify the best-priced " +
                        "supplier for the scope.\n" +
                        "2. Call the generateQuoteRequestPdf MCP tool with the " +
                        "claim and selected supplier details to produce a Zava " +
                        "quote-request PDF. Surface the resulting downloadUrl in " +
                        "your response so it can be downloaded.\n" +
                        "3. Propose appointment options, dispatch the work order, " +
                        "and draft a short plain-English update for the customer.";

                    var agent = agentFactory.Create("supplier");
                    var result = await agent.RunWithTraceAsync(prompt);
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
                    logger.LogWarning(ex, "Supplier Coordinator Agent invocation failed; falling back to deterministic demo data");
                }
            }

            return Results.Ok(new
            {
                claimNumber = claim.ClaimNumber,
                supplierType = match.SupplierType,
                recommendedSupplier = new
                {
                    name = match.Recommended.Name,
                    specialty = match.Recommended.Specialty,
                    location = match.Recommended.Location,
                    rating = match.Recommended.Rating,
                    slaDays = match.Recommended.SlaDays
                },
                alternativeSuppliers = match.Alternatives.Select(s => new
                {
                    name = s.Name,
                    specialty = s.Specialty,
                    location = s.Location,
                    rating = s.Rating,
                    slaDays = s.SlaDays
                }),
                appointmentOptions = match.AppointmentOptions,
                workOrder = new
                {
                    workOrderNumber = match.WorkOrderNumber,
                    scope = match.Scope,
                    dispatchedAt = DateTimeOffset.UtcNow,
                    status = "Dispatched",
                    eta = match.Eta
                },
                customerUpdate = match.CustomerUpdate(claim.CustomerName),
                humanApprovalRequired = match.HumanApprovalRequired,
                humanApprovalReason = match.HumanApprovalReason,
                quoteRequestPdfUrl,
                quoteRequestPdfFileName = pdfRecord.FileName,
                supplierDirectory = directory.Select(s => new
                {
                    name = s.Name,
                    specialty = s.Specialty,
                    location = s.Location,
                    rating = s.Rating,
                    slaDays = s.SlaDays,
                    quoteAmount = s.QuoteAmount,
                    quoteCurrency = s.QuoteCurrency,
                    notes = s.Notes
                }),
                bestPriceSupplier = bestPrice is null ? null : new
                {
                    name = bestPrice.Name,
                    quoteAmount = bestPrice.QuoteAmount,
                    quoteCurrency = bestPrice.QuoteCurrency
                },
                agentNotes,
                agentConfigured = agentFactory.IsConfigured,
                agentInput,
                agentRawOutput
            });
        });

        // Download endpoint for the PDF generated by either /supplier/process
        // or the generateQuoteRequestPdf MCP tool. Streams the PDF bytes back
        // as an attachment so the browser triggers a download.
        app.MapGet("/supplier/quote-request/{id}.pdf", (string id) =>
        {
            var record = pdfService.Get(id);
            if (record is null)
                return Results.NotFound(new { error = $"quote request '{id}' not found" });
            return Results.File(record.Content, "application/pdf", record.FileName);
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}

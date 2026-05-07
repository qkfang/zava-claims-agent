using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Server;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Mcp;

/// <summary>
/// MCP tools that back the Supplier Coordinator agent. Exposes a supplier
/// directory lookup (with indicative pricing) and a quote-request PDF
/// generator. Tools are surfaced under the <c>/mcp</c> endpoint, so a
/// Foundry agent can call them via the MCP transport configured in
/// <see cref="Program"/>.
/// </summary>
[McpServerToolType]
public class SupplierMcpTools
{
    private readonly QuoteRequestPdfService _pdfService;
    private readonly IConfiguration _configuration;

    public SupplierMcpTools(QuoteRequestPdfService pdfService, IConfiguration configuration)
    {
        _pdfService = pdfService;
        _configuration = configuration;
    }

    [McpServerTool(Name = "lookupSuppliers"),
     Description("Look up Zava's approved-network supplier directory for a claim. " +
                 "Returns suppliers (with indicative quote, rating and SLA) ordered by " +
                 "ascending quote price so the cheapest match is first. Use this to pick " +
                 "the best-priced supplier before generating a quote request.")]
    public string LookupSuppliers(
        [Description("Claim type (e.g. 'home', 'motor', 'travel', 'business', 'life').")]
        string claimType,
        [Description("Optional incident location, used to bias the ordering (e.g. 'Sydney, NSW').")]
        string? location = null)
    {
        var suppliers = SupplierDirectory.Lookup(claimType, location);
        var payload = new
        {
            claimType,
            location,
            count = suppliers.Count,
            suppliers = suppliers.Select(s => new
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
            bestPrice = suppliers.Count == 0 ? null : new
            {
                name = suppliers[0].Name,
                quoteAmount = suppliers[0].QuoteAmount,
                quoteCurrency = suppliers[0].QuoteCurrency
            }
        };
        return JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool(Name = "generateQuoteRequestPdf"),
     Description("Generate a Zava Insurance quote-request PDF for a claim and supplier. " +
                 "Returns a JSON object with a downloadUrl that the operator can click to " +
                 "fetch the PDF. Use this once a supplier has been selected from " +
                 "lookupSuppliers.")]
    public string GenerateQuoteRequestPdf(
        [Description("Claim number (from the intake store).")] string claimNumber,
        [Description("Customer's full name.")] string customerName,
        [Description("Policy number on the claim.")] string policyNumber,
        [Description("Claim type (e.g. 'home', 'motor').")] string claimType,
        [Description("Incident date (free text, e.g. '2025-04-22').")] string incidentDate,
        [Description("Incident location (city/state).")] string incidentLocation,
        [Description("Incident description.")] string incidentDescription,
        [Description("Estimated loss (free text, e.g. 'AUD 7500').")] string estimatedLoss,
        [Description("Urgency label (e.g. 'High').")] string urgency,
        [Description("Selected supplier name.")] string supplierName,
        [Description("Selected supplier specialty.")] string supplierSpecialty,
        [Description("Selected supplier service location.")] string supplierLocation,
        [Description("Indicative quote amount in major currency units (e.g. 4950).")] decimal quoteAmount,
        [Description("Quote currency (ISO code, e.g. 'AUD').")] string quoteCurrency,
        [Description("Scope of work being requested.")] string scope,
        [Description("Optional appointment options (display strings).")] string[]? appointmentOptions = null)
    {
        var record = _pdfService.Generate(new QuoteRequestPdfInput(
            ClaimNumber: claimNumber ?? string.Empty,
            CustomerName: customerName ?? string.Empty,
            PolicyNumber: policyNumber ?? string.Empty,
            ClaimType: claimType ?? string.Empty,
            IncidentDate: incidentDate ?? string.Empty,
            IncidentLocation: incidentLocation ?? string.Empty,
            IncidentDescription: incidentDescription ?? string.Empty,
            EstimatedLoss: estimatedLoss ?? string.Empty,
            Urgency: urgency ?? string.Empty,
            SupplierName: supplierName ?? string.Empty,
            SupplierSpecialty: supplierSpecialty ?? string.Empty,
            SupplierLocation: supplierLocation ?? string.Empty,
            QuoteAmount: quoteAmount,
            QuoteCurrency: string.IsNullOrWhiteSpace(quoteCurrency) ? "AUD" : quoteCurrency,
            Scope: scope ?? string.Empty,
            AppointmentOptions: appointmentOptions ?? Array.Empty<string>()));

        var baseUrl = (_configuration["APP_BASE_URL"]
            ?? _configuration["APP_MCP_URL"]
            ?? "http://localhost:5212").TrimEnd('/');

        var payload = new
        {
            id = record.Id,
            fileName = record.FileName,
            byteLength = record.Content.Length,
            createdAt = record.CreatedAt,
            downloadUrl = $"{baseUrl}/supplier/quote-request/{record.Id}.pdf",
            relativeUrl = $"/supplier/quote-request/{record.Id}.pdf"
        };
        return JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
    }
}


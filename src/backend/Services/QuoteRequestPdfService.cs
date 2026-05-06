using System.Collections.Concurrent;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ZavaClaims.App.Services;

/// <summary>
/// One generated quote-request PDF, kept in memory so the HTTP download
/// endpoint can stream it back to the browser. Keyed by a random id.
/// </summary>
public record QuoteRequestPdfRecord(
    string Id,
    string FileName,
    byte[] Content,
    DateTimeOffset CreatedAt);

/// <summary>
/// Input model for <see cref="QuoteRequestPdfService.Generate"/>.
/// </summary>
public record QuoteRequestPdfInput(
    string ClaimNumber,
    string CustomerName,
    string PolicyNumber,
    string ClaimType,
    string IncidentDate,
    string IncidentLocation,
    string IncidentDescription,
    string EstimatedLoss,
    string Urgency,
    string SupplierName,
    string SupplierSpecialty,
    string SupplierLocation,
    decimal QuoteAmount,
    string QuoteCurrency,
    string Scope,
    IReadOnlyList<string> AppointmentOptions);

/// <summary>
/// Generates a Zava Insurance "Quote Request" PDF for a claim/supplier pair
/// using QuestPDF, and caches the result in memory so the supplier
/// coordinator page can download it.
/// </summary>
public class QuoteRequestPdfService
{
    private readonly ConcurrentDictionary<string, QuoteRequestPdfRecord> _store = new();

    static QuoteRequestPdfService()
    {
        // QuestPDF is free to use under the Community licence for this demo.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    /// <summary>
    /// Generate a quote-request PDF and store it in memory. Returns the
    /// resulting record so the caller can surface its <c>Id</c> in a
    /// download URL.
    /// </summary>
    public QuoteRequestPdfRecord Generate(QuoteRequestPdfInput input)
    {
        var id = Guid.NewGuid().ToString("N").Substring(0, 12);
        var safeClaim = new string((input.ClaimNumber ?? "claim").Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrEmpty(safeClaim)) safeClaim = "claim";
        var fileName = $"Zava-QuoteRequest-{safeClaim}-{id}.pdf";

        byte[] bytes = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(36);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(t => t.FontSize(10).FontColor("#1f2937"));

                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("ZAVA INSURANCE")
                                .FontSize(16).Bold().FontColor("#0f766e");
                            c.Item().Text("Claims Office — Supplier Coordination")
                                .FontSize(9).FontColor("#475569");
                        });
                        row.ConstantItem(160).AlignRight().Column(c =>
                        {
                            c.Item().Text("QUOTE REQUEST").FontSize(14).Bold().FontColor("#10b981");
                            c.Item().Text($"Issued: {DateTimeOffset.Now:ddd dd MMM yyyy}")
                                .FontSize(9).FontColor("#475569");
                            c.Item().Text($"Reference: QR-{safeClaim}-{id}")
                                .FontSize(9).FontColor("#475569");
                        });
                    });
                    col.Item().PaddingVertical(6).LineHorizontal(1).LineColor("#10b981");
                });

                page.Content().PaddingVertical(8).Column(col =>
                {
                    col.Spacing(10);

                    col.Item().Text(t =>
                    {
                        t.Span("To: ").Bold();
                        t.Span(input.SupplierName);
                    });
                    col.Item().Text(t =>
                    {
                        t.Span("Specialty: ").Bold();
                        t.Span(input.SupplierSpecialty);
                    });
                    col.Item().Text(t =>
                    {
                        t.Span("Service area: ").Bold();
                        t.Span(input.SupplierLocation);
                    });

                    col.Item().PaddingTop(6).Text("Claim details").FontSize(12).Bold().FontColor("#0f766e");
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(120);
                            c.RelativeColumn();
                        });
                        void Row(string k, string? v)
                        {
                            table.Cell().Padding(3).Text(k).Bold().FontColor("#475569");
                            table.Cell().Padding(3).Text(string.IsNullOrWhiteSpace(v) ? "—" : v);
                        }
                        Row("Claim number", input.ClaimNumber);
                        Row("Customer", input.CustomerName);
                        Row("Policy number", input.PolicyNumber);
                        Row("Claim type", input.ClaimType);
                        Row("Incident date", input.IncidentDate);
                        Row("Incident location", input.IncidentLocation);
                        Row("Estimated loss", input.EstimatedLoss);
                        Row("Urgency", input.Urgency);
                    });

                    col.Item().PaddingTop(6).Text("Incident description").FontSize(12).Bold().FontColor("#0f766e");
                    col.Item().Background("#f8fafc").Padding(8)
                        .Text(string.IsNullOrWhiteSpace(input.IncidentDescription)
                            ? "(no description provided)"
                            : input.IncidentDescription);

                    col.Item().PaddingTop(6).Text("Scope of work requested").FontSize(12).Bold().FontColor("#0f766e");
                    col.Item().Background("#f8fafc").Padding(8)
                        .Text(string.IsNullOrWhiteSpace(input.Scope) ? "—" : input.Scope);

                    col.Item().PaddingTop(6).Text("Indicative quote (per supplier directory)").FontSize(12).Bold().FontColor("#0f766e");
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.ConstantColumn(120);
                        });
                        table.Cell().Padding(4).Text("Item").Bold();
                        table.Cell().Padding(4).AlignRight().Text("Amount").Bold();

                        table.Cell().Padding(4).Text($"{input.SupplierSpecialty} — scope above");
                        table.Cell().Padding(4).AlignRight().Text(
                            $"{input.QuoteCurrency} {input.QuoteAmount:N2}");

                        table.Cell().Padding(4).Text("Total (ex. GST)").Bold();
                        table.Cell().Padding(4).AlignRight().Text(
                            $"{input.QuoteCurrency} {input.QuoteAmount:N2}").Bold();
                    });

                    if (input.AppointmentOptions != null && input.AppointmentOptions.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Proposed appointment options").FontSize(12).Bold().FontColor("#0f766e");
                        col.Item().Column(c =>
                        {
                            foreach (var slot in input.AppointmentOptions)
                                c.Item().Text($"•  {slot}");
                        });
                    }

                    col.Item().PaddingTop(6).Text("Instructions to supplier").FontSize(12).Bold().FontColor("#0f766e");
                    col.Item().Text(
                        "Please confirm acceptance of this quote request, your earliest available " +
                        "appointment, and any variation to scope or price within 2 business days. " +
                        "Quote is subject to Zava's approved network terms and the policy scope of cover.");
                });

                page.Footer().AlignCenter().Text(t =>
                {
                    t.Span("Zava Insurance · Supplier Coordination · ")
                        .FontSize(8).FontColor("#64748b");
                    t.Span("Claims Team in a Day demo")
                        .FontSize(8).FontColor("#64748b");
                });
            });
        }).GeneratePdf();

        var record = new QuoteRequestPdfRecord(id, fileName, bytes, DateTimeOffset.UtcNow);
        _store[id] = record;

        // Bound the in-memory cache so a long-running demo can't grow unbounded.
        if (_store.Count > 200)
        {
            foreach (var stale in _store.Values
                         .OrderBy(r => r.CreatedAt)
                         .Take(_store.Count - 200))
            {
                _store.TryRemove(stale.Id, out _);
            }
        }

        return record;
    }

    public QuoteRequestPdfRecord? Get(string id)
        => _store.TryGetValue(id ?? string.Empty, out var record) ? record : null;
}

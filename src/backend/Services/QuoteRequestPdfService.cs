using System.Collections.Concurrent;
using MigraDoc.DocumentObjectModel;
using MigraDoc.DocumentObjectModel.Tables;
using MigraDoc.Rendering;
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
/// using PDFsharp + MigraDoc (pure managed, cross-platform, no native
/// dependencies — works on win-x64, win-arm64, linux-*, osx-*), and caches
/// the result in memory so the supplier coordinator page can download it.
/// </summary>
public class QuoteRequestPdfService
{
    // Brand colours (parsed once).
    private static readonly Color BrandTeal = Color.FromRgb(0x0f, 0x76, 0x6e);
    private static readonly Color BrandGreen = Color.FromRgb(0x10, 0xb9, 0x81);
    private static readonly Color TextDark = Color.FromRgb(0x1f, 0x29, 0x37);
    private static readonly Color TextMuted = Color.FromRgb(0x47, 0x55, 0x69);
    private static readonly Color TextSubtle = Color.FromRgb(0x64, 0x74, 0x8b);
    private static readonly Color PanelBg = Color.FromRgb(0xf8, 0xfa, 0xfc);
    private static readonly Color PanelBorder = Color.FromRgb(0xcb, 0xd5, 0xe1);

    private readonly ConcurrentDictionary<string, QuoteRequestPdfRecord> _store = new();

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

        var doc = BuildDocument(input, safeClaim, id);

        var renderer = new PdfDocumentRenderer { Document = doc };
        renderer.RenderDocument();

        using var ms = new MemoryStream();
        renderer.PdfDocument.Save(ms, false);
        var bytes = ms.ToArray();

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

    private static Document BuildDocument(QuoteRequestPdfInput input, string safeClaim, string id)
    {
        var doc = new Document();
        doc.Info.Title = $"Zava Quote Request {safeClaim}";
        doc.Info.Author = "Zava Insurance";
        doc.Info.Subject = "Supplier quote request";

        // Default text style.
        var normal = doc.Styles["Normal"]!;
        normal.Font.Name = "Arial";
        normal.Font.Size = 10;
        normal.Font.Color = TextDark;

        var section = doc.AddSection();
        section.PageSetup.PageFormat = PageFormat.A4;
        section.PageSetup.LeftMargin = Unit.FromPoint(36);
        section.PageSetup.RightMargin = Unit.FromPoint(36);
        section.PageSetup.TopMargin = Unit.FromPoint(36);
        section.PageSetup.BottomMargin = Unit.FromPoint(36);

        BuildHeader(section, safeClaim, id);
        BuildFooter(section);
        BuildBody(section, input);

        return doc;
    }

    private static void BuildHeader(Section section, string safeClaim, string id)
    {
        var header = section.Headers.Primary;

        var table = header.AddTable();
        table.Borders.Visible = false;
        table.AddColumn(Unit.FromCentimeter(10));
        table.AddColumn(Unit.FromCentimeter(7));
        var row = table.AddRow();

        var leftCell = row.Cells[0];
        var leftBrand = leftCell.AddParagraph("ZAVA INSURANCE");
        leftBrand.Format.Font.Size = 16;
        leftBrand.Format.Font.Bold = true;
        leftBrand.Format.Font.Color = BrandTeal;
        var leftSub = leftCell.AddParagraph("Claims Office — Supplier Coordination");
        leftSub.Format.Font.Size = 9;
        leftSub.Format.Font.Color = TextMuted;

        var rightCell = row.Cells[1];
        var title = rightCell.AddParagraph("QUOTE REQUEST");
        title.Format.Alignment = ParagraphAlignment.Right;
        title.Format.Font.Size = 14;
        title.Format.Font.Bold = true;
        title.Format.Font.Color = BrandGreen;
        var issued = rightCell.AddParagraph($"Issued: {DateTimeOffset.Now:ddd dd MMM yyyy}");
        issued.Format.Alignment = ParagraphAlignment.Right;
        issued.Format.Font.Size = 9;
        issued.Format.Font.Color = TextMuted;
        var refPara = rightCell.AddParagraph($"Reference: QR-{safeClaim}-{id}");
        refPara.Format.Alignment = ParagraphAlignment.Right;
        refPara.Format.Font.Size = 9;
        refPara.Format.Font.Color = TextMuted;

        // Accent rule under the masthead.
        var rule = header.AddParagraph();
        rule.Format.Borders.Bottom.Color = BrandGreen;
        rule.Format.Borders.Bottom.Width = 1;
        rule.Format.SpaceBefore = Unit.FromPoint(6);
        rule.Format.SpaceAfter = Unit.FromPoint(6);
    }

    private static void BuildFooter(Section section)
    {
        var footer = section.Footers.Primary;
        var p = footer.AddParagraph();
        p.Format.Alignment = ParagraphAlignment.Center;
        p.Format.Font.Size = 8;
        p.Format.Font.Color = TextSubtle;
        p.AddText("Zava Insurance · Supplier Coordination · Claims Team in a Day demo");
    }

    private static void BuildBody(Section section, QuoteRequestPdfInput input)
    {
        AddLabelled(section, "To: ", input.SupplierName);
        AddLabelled(section, "Specialty: ", input.SupplierSpecialty);
        AddLabelled(section, "Service area: ", input.SupplierLocation);

        AddSectionHeading(section, "Claim details");
        var claimTable = section.AddTable();
        claimTable.Borders.Visible = false;
        claimTable.AddColumn(Unit.FromPoint(120));
        claimTable.AddColumn(Unit.FromPoint(360));

        AddKeyValueRow(claimTable, "Claim number", input.ClaimNumber);
        AddKeyValueRow(claimTable, "Customer", input.CustomerName);
        AddKeyValueRow(claimTable, "Policy number", input.PolicyNumber);
        AddKeyValueRow(claimTable, "Claim type", input.ClaimType);
        AddKeyValueRow(claimTable, "Incident date", input.IncidentDate);
        AddKeyValueRow(claimTable, "Incident location", input.IncidentLocation);
        AddKeyValueRow(claimTable, "Estimated loss", input.EstimatedLoss);
        AddKeyValueRow(claimTable, "Urgency", input.Urgency);

        AddSectionHeading(section, "Incident description");
        AddPanelParagraph(section, string.IsNullOrWhiteSpace(input.IncidentDescription)
            ? "(no description provided)"
            : input.IncidentDescription);

        AddSectionHeading(section, "Scope of work requested");
        AddPanelParagraph(section, string.IsNullOrWhiteSpace(input.Scope) ? "—" : input.Scope);

        AddSectionHeading(section, "Indicative quote (per supplier directory)");
        var quoteTable = section.AddTable();
        quoteTable.Borders.Width = 0.5;
        quoteTable.Borders.Color = PanelBorder;
        quoteTable.AddColumn(Unit.FromPoint(360));
        quoteTable.AddColumn(Unit.FromPoint(120));

        var headerRow = quoteTable.AddRow();
        headerRow.Shading.Color = PanelBg;
        var hItem = headerRow.Cells[0].AddParagraph("Item");
        hItem.Format.Font.Bold = true;
        var hAmt = headerRow.Cells[1].AddParagraph("Amount");
        hAmt.Format.Font.Bold = true;
        hAmt.Format.Alignment = ParagraphAlignment.Right;

        var lineRow = quoteTable.AddRow();
        lineRow.Cells[0].AddParagraph($"{input.SupplierSpecialty} — scope above");
        var lineAmt = lineRow.Cells[1].AddParagraph($"{input.QuoteCurrency} {input.QuoteAmount:N2}");
        lineAmt.Format.Alignment = ParagraphAlignment.Right;

        var totalRow = quoteTable.AddRow();
        var totalLabel = totalRow.Cells[0].AddParagraph("Total (ex. GST)");
        totalLabel.Format.Font.Bold = true;
        var totalAmt = totalRow.Cells[1].AddParagraph($"{input.QuoteCurrency} {input.QuoteAmount:N2}");
        totalAmt.Format.Font.Bold = true;
        totalAmt.Format.Alignment = ParagraphAlignment.Right;

        if (input.AppointmentOptions is { Count: > 0 })
        {
            AddSectionHeading(section, "Proposed appointment options");
            foreach (var slot in input.AppointmentOptions)
            {
                var bullet = section.AddParagraph($"•  {slot}");
                bullet.Format.SpaceAfter = Unit.FromPoint(2);
            }
        }

        AddSectionHeading(section, "Instructions to supplier");
        section.AddParagraph(
            "Please confirm acceptance of this quote request, your earliest available " +
            "appointment, and any variation to scope or price within 2 business days. " +
            "Quote is subject to Zava's approved network terms and the policy scope of cover.");
    }

    private static void AddLabelled(Section section, string label, string? value)
    {
        var p = section.AddParagraph();
        var bold = p.AddFormattedText(label);
        bold.Bold = true;
        p.AddText(string.IsNullOrWhiteSpace(value) ? "—" : value!);
    }

    private static void AddSectionHeading(Section section, string text)
    {
        var p = section.AddParagraph(text);
        p.Format.Font.Size = 12;
        p.Format.Font.Bold = true;
        p.Format.Font.Color = BrandTeal;
        p.Format.SpaceBefore = Unit.FromPoint(8);
        p.Format.SpaceAfter = Unit.FromPoint(4);
    }

    private static void AddKeyValueRow(Table table, string key, string? value)
    {
        var row = table.AddRow();
        var k = row.Cells[0].AddParagraph(key);
        k.Format.Font.Bold = true;
        k.Format.Font.Color = TextMuted;
        row.Cells[0].VerticalAlignment = VerticalAlignment.Top;
        row.Cells[1].AddParagraph(string.IsNullOrWhiteSpace(value) ? "—" : value!);
        row.TopPadding = Unit.FromPoint(2);
        row.BottomPadding = Unit.FromPoint(2);
    }

    private static void AddPanelParagraph(Section section, string text)
    {
        var p = section.AddParagraph(text);
        p.Format.Shading.Color = PanelBg;
        p.Format.LeftIndent = Unit.FromPoint(8);
        p.Format.RightIndent = Unit.FromPoint(8);
        p.Format.SpaceBefore = Unit.FromPoint(2);
        p.Format.SpaceAfter = Unit.FromPoint(2);
        p.Format.Borders.Distance = Unit.FromPoint(4);
    }
}

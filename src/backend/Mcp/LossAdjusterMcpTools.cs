using System.ComponentModel;
using System.Globalization;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;

namespace ZavaClaims.App.Mcp;

/// <summary>
/// MCP tools surfaced to the Loss Adjuster Foundry agent. They give the agent
/// concrete, deterministic skills it can decide to call when reviewing a
/// complex claim:
///
/// - <c>analyzeQuote</c>      — fetch a contractor / repairer quote document
///   (markdown, JSON, or plain text) and return its parsed line items so the
///   agent can reason about scope and price.
/// - <c>compareQuotes</c>     — diff two or more parsed quotes line-by-line
///   and emit a markdown comparison table plus a Mermaid bar-chart diagram of
///   their totals so the agent's narrative can include the chart.
/// - <c>generateClaimExcel</c> — write a structured XLSX workbook for the
///   case (claim summary + quote comparison + recommendations) onto disk and
///   return a download URL. The Loss Adjuster page links to the file so a
///   human adjuster can open it, edit it, and attach it to the claim file.
///
/// All three tools are exposed via the shared <c>/mcp</c> server so the
/// Loss Adjuster Foundry agent picks them up over the MCP transport.
/// </summary>
[McpServerToolType]
public class LossAdjusterMcpTools
{
    private const string OutputSubdir = "loss-adjuster/output";

    private readonly IWebHostEnvironment _environment;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<LossAdjusterMcpTools> _logger;

    public LossAdjusterMcpTools(
        IWebHostEnvironment environment,
        IHttpClientFactory httpClientFactory,
        ILogger<LossAdjusterMcpTools> logger)
    {
        _environment = environment;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────
    // analyzeQuote
    // ─────────────────────────────────────────────────────────────────────

    [McpServerTool(Name = "analyzeQuote"),
     Description("Fetch a contractor repair-quote document (JSON, markdown, plain text, or absolute path under /loss-adjuster/samples/) and return its parsed line items, totals and metadata as JSON. Use this to read each quote on a complex claim before comparing them.")]
    public async Task<string> AnalyzeQuote(
        [Description("URL or absolute path to the quote document. Absolute paths starting with '/' are resolved against the app's wwwroot (e.g. /loss-adjuster/samples/quote-acme-restoration.json). Public http(s) URLs are also supported.")]
        string documentUrl)
    {
        if (string.IsNullOrWhiteSpace(documentUrl))
            return JsonError("documentUrl is required.");

        try
        {
            var content = await ReadDocumentAsync(documentUrl);
            if (content is null)
                return JsonError($"Quote document not found: '{documentUrl}'.");

            var quote = ParseQuote(documentUrl, content);

            return JsonSerializer.Serialize(new
            {
                source = documentUrl,
                quote
            }, JsonOpts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "analyzeQuote failed for {Url}", documentUrl);
            return JsonError($"Failed to analyze quote: {ex.Message}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // compareQuotes
    // ─────────────────────────────────────────────────────────────────────

    [McpServerTool(Name = "compareQuotes"),
     Description("Compare two or more parsed quotes (the output of analyzeQuote, or any equivalent JSON). Returns a markdown comparison table, a Mermaid bar-chart diagram of the totals, and a list of flagged anomalies (large total spread, missing line items, line items priced more than 25% above the median).")]
    public string CompareQuotes(
        [Description("JSON array of quote objects. Each quote should have at least: vendor (string), total (number), lineItems (array of {description, amount}). The output of analyzeQuote is accepted directly — pass either the full result objects or just the .quote payloads.")]
        string quotesJson)
    {
        if (string.IsNullOrWhiteSpace(quotesJson))
            return JsonError("quotesJson is required.");

        ParsedQuote[] quotes;
        try
        {
            quotes = NormaliseQuotesPayload(quotesJson);
        }
        catch (Exception ex)
        {
            return JsonError($"Could not parse quotesJson: {ex.Message}");
        }

        if (quotes.Length < 2)
            return JsonError("Provide at least two quotes to compare.");

        var allDescriptions = quotes
            .SelectMany(q => q.LineItems.Select(li => li.Description))
            .Where(d => !string.IsNullOrWhiteSpace(d))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        // ── Markdown table ──────────────────────────────────────────────
        var md = new StringBuilder();
        md.Append("| Line item |");
        foreach (var q in quotes) md.Append($" {q.Vendor} |");
        md.AppendLine();
        md.Append("|---|");
        foreach (var _ in quotes) md.Append("---:|");
        md.AppendLine();

        foreach (var desc in allDescriptions)
        {
            md.Append($"| {EscapeMd(desc)} |");
            foreach (var q in quotes)
            {
                var li = q.LineItems.FirstOrDefault(x =>
                    string.Equals(x.Description, desc, StringComparison.OrdinalIgnoreCase));
                md.Append(li is null ? " — |" : $" {li.Amount.ToString("C2", CultureInfo.GetCultureInfo("en-AU"))} |");
            }
            md.AppendLine();
        }
        md.Append("| **Total** |");
        foreach (var q in quotes)
            md.Append($" **{q.Total.ToString("C2", CultureInfo.GetCultureInfo("en-AU"))}** |");
        md.AppendLine();

        // ── Mermaid bar chart of totals ─────────────────────────────────
        var mermaid = new StringBuilder();
        mermaid.AppendLine("```mermaid");
        mermaid.AppendLine("xychart-beta");
        mermaid.AppendLine("    title \"Quote totals (AUD)\"");
        mermaid.Append("    x-axis [");
        mermaid.Append(string.Join(", ", quotes.Select(q => $"\"{EscapeMermaid(q.Vendor)}\"")));
        mermaid.AppendLine("]");
        var maxTotal = Math.Max(1m, quotes.Max(q => q.Total));
        mermaid.AppendLine($"    y-axis \"AUD\" 0 --> {Math.Ceiling(maxTotal * 1.1m)}");
        mermaid.Append("    bar [");
        mermaid.Append(string.Join(", ", quotes.Select(q => q.Total.ToString("0.##", CultureInfo.InvariantCulture))));
        mermaid.AppendLine("]");
        mermaid.AppendLine("```");

        // ── Anomaly detection ───────────────────────────────────────────
        var totals = quotes.Select(q => q.Total).OrderBy(t => t).ToArray();
        var median = totals[totals.Length / 2];
        var spread = totals[^1] - totals[0];
        var spreadPct = median > 0 ? (double)(spread / median) * 100 : 0;

        var anomalies = new List<string>();
        if (spreadPct > 20)
            anomalies.Add($"Total spread is {spreadPct:F1}% of the median (${spread:N0} AUD) — investigate scope differences.");

        foreach (var desc in allDescriptions)
        {
            var amounts = quotes
                .Select(q => q.LineItems.FirstOrDefault(x =>
                    string.Equals(x.Description, desc, StringComparison.OrdinalIgnoreCase))?.Amount)
                .Where(a => a.HasValue)
                .Select(a => a!.Value)
                .OrderBy(a => a)
                .ToArray();

            if (amounts.Length >= 2)
            {
                var med = amounts[amounts.Length / 2];
                if (med > 0)
                {
                    foreach (var q in quotes)
                    {
                        var li = q.LineItems.FirstOrDefault(x =>
                            string.Equals(x.Description, desc, StringComparison.OrdinalIgnoreCase));
                        if (li is not null && li.Amount > med * 1.25m)
                            anomalies.Add($"{q.Vendor}: '{desc}' is {(double)((li.Amount - med) / med) * 100:F0}% above median (${li.Amount:N0} vs ${med:N0}).");
                    }
                }
            }

            var missingFrom = quotes
                .Where(q => !q.LineItems.Any(x =>
                    string.Equals(x.Description, desc, StringComparison.OrdinalIgnoreCase)))
                .Select(q => q.Vendor)
                .ToArray();
            if (missingFrom.Length > 0 && missingFrom.Length < quotes.Length)
                anomalies.Add($"'{desc}' missing from quote(s): {string.Join(", ", missingFrom)}.");
        }

        var lowest = quotes.OrderBy(q => q.Total).First();
        var highest = quotes.OrderByDescending(q => q.Total).First();

        return JsonSerializer.Serialize(new
        {
            comparisonMarkdown = md.ToString(),
            totalsChartMermaid = mermaid.ToString(),
            anomalies,
            summary = new
            {
                vendors = quotes.Select(q => q.Vendor).ToArray(),
                totals = quotes.ToDictionary(q => q.Vendor, q => q.Total),
                median,
                spread,
                spreadPercent = Math.Round(spreadPct, 1),
                lowestVendor = lowest.Vendor,
                lowestTotal = lowest.Total,
                highestVendor = highest.Vendor,
                highestTotal = highest.Total
            }
        }, JsonOpts);
    }

    // ─────────────────────────────────────────────────────────────────────
    // generateClaimExcel
    // ─────────────────────────────────────────────────────────────────────

    [McpServerTool(Name = "generateClaimExcel"),
     Description("Generate an Excel (.xlsx) workbook for a loss-adjuster case. The workbook contains: 1) Claim Summary, 2) Quote Comparison (one row per line item per vendor), 3) Recommendations. Saves the file under wwwroot/loss-adjuster/output/ and returns its download URL.")]
    public string GenerateClaimExcel(
        [Description("The claim number, e.g. CL-1001. Used in the file name.")]
        string claimNumber,
        [Description("JSON object with the claim summary fields to include on the Claim Summary sheet (any flat object — keys become labels, values become cell values).")]
        string claimSummaryJson,
        [Description("Same JSON array of quotes accepted by compareQuotes — used to populate the Quote Comparison sheet.")]
        string quotesJson,
        [Description("Optional JSON object of recommendations: { recommendedReserve, recommendedVendor, notes, humanApprovalRequired }. Pass an empty object {} if none.")]
        string recommendationsJson)
    {
        if (string.IsNullOrWhiteSpace(claimNumber))
            return JsonError("claimNumber is required.");

        var safeClaim = SafeFileToken(claimNumber);
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var fileName = $"{safeClaim}-loss-adjuster-{stamp}.xlsx";

        var outputDir = Path.Combine(_environment.WebRootPath ?? "wwwroot", "loss-adjuster", "output");
        Directory.CreateDirectory(outputDir);
        var fullPath = Path.Combine(outputDir, fileName);

        ParsedQuote[] quotes;
        try
        {
            quotes = string.IsNullOrWhiteSpace(quotesJson)
                ? Array.Empty<ParsedQuote>()
                : NormaliseQuotesPayload(quotesJson);
        }
        catch (Exception ex)
        {
            return JsonError($"Could not parse quotesJson: {ex.Message}");
        }

        Dictionary<string, string> summary;
        try
        {
            summary = FlattenJsonObject(claimSummaryJson);
        }
        catch (Exception ex)
        {
            return JsonError($"Could not parse claimSummaryJson: {ex.Message}");
        }

        Dictionary<string, string> recs;
        try
        {
            recs = FlattenJsonObject(recommendationsJson);
        }
        catch (Exception ex)
        {
            return JsonError($"Could not parse recommendationsJson: {ex.Message}");
        }

        try
        {
            using var wb = new XLWorkbook();

            // Claim Summary sheet
            var ws1 = wb.AddWorksheet("Claim Summary");
            ws1.Cell(1, 1).Value = "Field";
            ws1.Cell(1, 2).Value = "Value";
            ws1.Range(1, 1, 1, 2).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.LightGray);
            ws1.Cell(2, 1).Value = "Claim number";
            ws1.Cell(2, 2).Value = claimNumber;
            int row = 3;
            foreach (var kv in summary)
            {
                ws1.Cell(row, 1).Value = kv.Key;
                ws1.Cell(row, 2).Value = kv.Value;
                row++;
            }
            ws1.Columns(1, 2).AdjustToContents();

            // Quote Comparison sheet
            var ws2 = wb.AddWorksheet("Quote Comparison");
            ws2.Cell(1, 1).Value = "Vendor";
            ws2.Cell(1, 2).Value = "Line item";
            ws2.Cell(1, 3).Value = "Amount (AUD)";
            ws2.Range(1, 1, 1, 3).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.LightGray);
            row = 2;
            foreach (var q in quotes)
            {
                foreach (var li in q.LineItems)
                {
                    ws2.Cell(row, 1).Value = q.Vendor;
                    ws2.Cell(row, 2).Value = li.Description;
                    ws2.Cell(row, 3).Value = li.Amount;
                    ws2.Cell(row, 3).Style.NumberFormat.Format = "#,##0.00";
                    row++;
                }
                ws2.Cell(row, 1).Value = q.Vendor;
                ws2.Cell(row, 2).Value = "TOTAL";
                ws2.Cell(row, 3).Value = q.Total;
                ws2.Range(row, 1, row, 3).Style.Font.SetBold();
                ws2.Cell(row, 3).Style.NumberFormat.Format = "#,##0.00";
                row++;
            }
            ws2.Columns(1, 3).AdjustToContents();

            // Recommendations sheet
            var ws3 = wb.AddWorksheet("Recommendations");
            ws3.Cell(1, 1).Value = "Field";
            ws3.Cell(1, 2).Value = "Value";
            ws3.Range(1, 1, 1, 2).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.LightGray);
            row = 2;
            foreach (var kv in recs)
            {
                ws3.Cell(row, 1).Value = kv.Key;
                ws3.Cell(row, 2).Value = kv.Value;
                row++;
            }
            if (recs.Count == 0)
            {
                ws3.Cell(2, 1).Value = "Recommendations";
                ws3.Cell(2, 2).Value = "(none provided)";
            }
            ws3.Columns(1, 2).AdjustToContents();

            wb.SaveAs(fullPath);

            var downloadUrl = $"/loss-adjuster/download/{Uri.EscapeDataString(fileName)}";
            _logger.LogInformation("generateClaimExcel wrote {Path}", fullPath);

            return JsonSerializer.Serialize(new
            {
                claimNumber,
                fileName,
                downloadUrl,
                sheets = new[] { "Claim Summary", "Quote Comparison", "Recommendations" },
                quoteCount = quotes.Length
            }, JsonOpts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "generateClaimExcel failed for {ClaimNumber}", claimNumber);
            return JsonError($"Failed to generate workbook: {ex.Message}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static string JsonError(string message) =>
        JsonSerializer.Serialize(new { error = message }, JsonOpts);

    private async Task<string?> ReadDocumentAsync(string documentUrl)
    {
        if (documentUrl.StartsWith("/", StringComparison.Ordinal))
        {
            var rel = documentUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var webRoot = _environment.WebRootPath ?? "wwwroot";
            var local = Path.Combine(webRoot, rel);
            var fullRoot = Path.GetFullPath(webRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                + Path.DirectorySeparatorChar;
            var fullLocal = Path.GetFullPath(local);
            if (!fullLocal.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                return null; // path traversal guard
            return File.Exists(fullLocal) ? await File.ReadAllTextAsync(fullLocal) : null;
        }

        if (!Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri))
            return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return null;

        using var http = _httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(15);
        var resp = await http.GetAsync(uri);
        if (!resp.IsSuccessStatusCode) return null;
        return await resp.Content.ReadAsStringAsync();
    }

    private static ParsedQuote ParseQuote(string source, string content)
    {
        var trimmed = content.TrimStart();
        if (trimmed.StartsWith("{") || trimmed.StartsWith("["))
        {
            try
            {
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;
                var quote = NormaliseQuoteElement(root);
                if (quote is not null) return quote;
            }
            catch
            {
                // fall through to text parser
            }
        }

        return ParseTextQuote(source, content);
    }

    private static ParsedQuote? NormaliseQuoteElement(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;

        string vendor = TryGetString(el, "vendor")
            ?? TryGetString(el, "contractor")
            ?? TryGetString(el, "company")
            ?? "Unknown vendor";

        var items = new List<ParsedLineItem>();
        if (el.TryGetProperty("lineItems", out var liArr) && liArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var li in liArr.EnumerateArray())
            {
                var desc = TryGetString(li, "description") ?? TryGetString(li, "item") ?? "";
                var amt = TryGetDecimal(li, "amount") ?? TryGetDecimal(li, "price") ?? 0m;
                if (!string.IsNullOrWhiteSpace(desc))
                    items.Add(new ParsedLineItem(desc, amt));
            }
        }

        var total = TryGetDecimal(el, "total")
            ?? TryGetDecimal(el, "grandTotal")
            ?? items.Sum(i => i.Amount);

        return new ParsedQuote(vendor, total, items.ToArray());
    }

    private static ParsedQuote ParseTextQuote(string source, string content)
    {
        var vendor = Path.GetFileNameWithoutExtension(source);
        var items = new List<ParsedLineItem>();
        decimal? total = null;

        foreach (var rawLine in content.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0) continue;

            // Look for "Vendor: ..." or "Contractor: ..."
            var vMatch = System.Text.RegularExpressions.Regex.Match(line,
                @"^(?:vendor|contractor|company)\s*[:\-]\s*(.+)$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (vMatch.Success) { vendor = vMatch.Groups[1].Value.Trim(); continue; }

            // "Total: $1234.56"
            var tMatch = System.Text.RegularExpressions.Regex.Match(line,
                @"^total\s*[:\-]?\s*\$?([\d,]+(?:\.\d+)?)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (tMatch.Success && decimal.TryParse(tMatch.Groups[1].Value.Replace(",", ""),
                NumberStyles.Number, CultureInfo.InvariantCulture, out var tv))
            {
                total = tv;
                continue;
            }

            // "Description ........ $123.45" / "Description: $123.45"
            var liMatch = System.Text.RegularExpressions.Regex.Match(line,
                @"^(.+?)[\s\.\:\-]+\$?([\d,]+(?:\.\d+)?)$");
            if (liMatch.Success && decimal.TryParse(liMatch.Groups[2].Value.Replace(",", ""),
                NumberStyles.Number, CultureInfo.InvariantCulture, out var amt))
            {
                var desc = liMatch.Groups[1].Value.Trim().TrimEnd(':', '-', '.');
                if (desc.Length > 0 && !desc.Equals("total", StringComparison.OrdinalIgnoreCase))
                    items.Add(new ParsedLineItem(desc, amt));
            }
        }

        return new ParsedQuote(vendor, total ?? items.Sum(i => i.Amount), items.ToArray());
    }

    private static ParsedQuote[] NormaliseQuotesPayload(string quotesJson)
    {
        using var doc = JsonDocument.Parse(quotesJson);
        var root = doc.RootElement;

        IEnumerable<JsonElement> elements = root.ValueKind == JsonValueKind.Array
            ? root.EnumerateArray()
            : new[] { root };

        var list = new List<ParsedQuote>();
        foreach (var el in elements)
        {
            // Accept analyzeQuote output shape { source, quote: { ... } }
            if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty("quote", out var inner))
            {
                var q = NormaliseQuoteElement(inner);
                if (q is not null) list.Add(q);
            }
            else
            {
                var q = NormaliseQuoteElement(el);
                if (q is not null) list.Add(q);
            }
        }
        return list.ToArray();
    }

    private static Dictionary<string, string> FlattenJsonObject(string? json)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(json)) return result;

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;

        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            string value = prop.Value.ValueKind switch
            {
                JsonValueKind.String => prop.Value.GetString() ?? "",
                JsonValueKind.Number => prop.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null => "",
                _ => prop.Value.GetRawText()
            };
            result[Humanize(prop.Name)] = value;
        }
        return result;
    }

    private static string? TryGetString(JsonElement el, string name)
        => el.ValueKind == JsonValueKind.Object
            && el.TryGetProperty(name, out var v)
            && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

    private static decimal? TryGetDecimal(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        if (!el.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
        if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(),
            NumberStyles.Number, CultureInfo.InvariantCulture, out var sd)) return sd;
        return null;
    }

    private static string Humanize(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        var sb = new StringBuilder();
        sb.Append(char.ToUpperInvariant(name[0]));
        for (int i = 1; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c)) sb.Append(' ');
            sb.Append(c);
        }
        return sb.ToString();
    }

    private static string EscapeMd(string s) => s.Replace("|", "\\|");
    private static string EscapeMermaid(string s) => s.Replace("\"", "'");

    private static string SafeFileToken(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s)
            sb.Append(char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '-');
        return sb.ToString();
    }

    private record ParsedLineItem(string Description, decimal Amount);
    private record ParsedQuote(string Vendor, decimal Total, ParsedLineItem[] LineItems);
}

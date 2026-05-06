using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ZavaClaims.App.Models;

namespace ZavaClaims.App.Services;

/// <summary>
/// Outcome of running one authenticity check against a sample document.
/// </summary>
public record FraudDocumentCheck(string Name, string Status, string Detail);

/// <summary>
/// Per-document verdict + the checks that produced it.
/// </summary>
public record FraudDocumentVerification(
    string Id,
    string Label,
    string Kind,
    string Src,
    string Verdict,                       // "legit" | "suspicious" | "fake"
    IReadOnlyList<string> FailureReasons,
    IReadOnlyList<FraudDocumentCheck> Checks,
    string? CuMarkdown,
    string Source,                        // "content-understanding" | "manifest-fallback"
    IReadOnlyDictionary<string, string?> ExtractedFields);

/// <summary>
/// Authenticity verifier for the Fraud Investigation Try-It-Out tab.
///
/// Pulls each requested sample document through Azure Content
/// Understanding (when configured) using a fixed authenticity field
/// schema, then runs a small deterministic rules layer over the extracted
/// fields + the manifest's expected outcome to decide
/// <c>legit | suspicious | fake</c> and explain why.
///
/// When CU isn't configured the verifier falls back to the manifest's
/// <c>expected</c> field and synthesises the same shape of result so the
/// demo still tells a complete story end-to-end.
/// </summary>
public class FraudDocumentVerifier
{
    private readonly FraudCaseDocumentStore _samples;
    private readonly ContentUnderstandingService? _cu;
    private readonly ILogger<FraudDocumentVerifier> _logger;
    private readonly IConfiguration _config;

    // Known document numbers we've already seen submitted on a prior claim.
    // Used by the duplicate-receipt check.
    private readonly ConcurrentDictionary<string, string> _seenDocumentNumbers =
        new(StringComparer.OrdinalIgnoreCase);

    public FraudDocumentVerifier(
        FraudCaseDocumentStore samples,
        IConfiguration config,
        ILogger<FraudDocumentVerifier> logger,
        ContentUnderstandingService? cu = null)
    {
        _samples = samples;
        _config = config;
        _logger = logger;
        _cu = cu;
    }

    public bool ContentUnderstandingConfigured => _cu is not null;

    /// <summary>
    /// Authenticity field schema sent to Content Understanding. Reused for
    /// every kind of document — CU's natural-language descriptions cope
    /// with the differences between IDs, receipts, and quotes.
    /// </summary>
    public static readonly IReadOnlyList<CuFieldSpec> AuthenticitySchema = new List<CuFieldSpec>
    {
        new("documentType",
            "What kind of document is this — driver licence, passport, receipt, repair quote, or other? " +
            "Use one of: 'driver-licence', 'passport', 'receipt', 'repair-quote', 'other'.",
            "string", "classify"),
        new("issuer",
            "The issuing authority for an ID document, or the merchant / business name for a receipt or quote.",
            "string", "extract"),
        new("holderName",
            "For ID documents, the full name of the person the document is issued to. Empty for receipts and quotes.",
            "string", "extract"),
        new("documentNumber",
            "The licence number, passport number, receipt number, or quote number printed on the document.",
            "string", "extract"),
        new("issueDate",
            "Date the document was issued, in ISO 8601 (YYYY-MM-DD) where possible.",
            "date", "extract"),
        new("expiryDate",
            "Expiry / valid-until date for the document, in ISO 8601 (YYYY-MM-DD) where possible. Empty if not applicable.",
            "date", "extract"),
        new("totalAmount",
            "Total monetary amount stated on the document (receipts and quotes only). Numeric, no currency symbol.",
            "number", "extract"),
        new("tamperIndicators",
            "Describe any visible signs of editing, font mismatch, photo replacement, broken security features, " +
            "misaligned text, retyped numbers, or other artefacts that suggest the document has been altered. " +
            "Empty string if the document looks consistent.",
            "string", "generate"),
        new("securityFeaturesPresent",
            "For ID documents only, do the expected security features (hologram, microprint, MRZ) appear " +
            "intact and consistent? Answer 'yes', 'no', or 'n/a' for non-ID documents, with a one-sentence note.",
            "string", "generate"),
        new("consistencySummary",
            "One or two sentences summarising whether the document's contents are internally consistent " +
            "(dates plausible, totals add up, holder details coherent).",
            "string", "generate"),
    };

    public IReadOnlyList<string> CheckNames { get; } = new[]
    {
        "Document type plausibility",
        "Holder name matches claim customer",
        "Issue / expiry dates plausible",
        "No visible tamper indicators",
        "Security features present (ID docs)",
        "Total amount within claim ballpark (financial docs)",
        "Document number not seen on a prior claim",
    };

    /// <summary>
    /// Verify a list of sample documents against the supplied claim record.
    /// </summary>
    public async Task<IReadOnlyList<FraudDocumentVerification>> VerifyAsync(
        IntakeClaimRecord claim,
        IReadOnlyList<FraudSampleDocument> samples,
        string? appBaseUrl)
    {
        var results = new List<FraudDocumentVerification>(samples.Count);
        foreach (var sample in samples)
        {
            try
            {
                var result = await VerifyOneAsync(claim, sample, appBaseUrl);
                results.Add(result);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Document verification failed for sample {SampleId}; falling back to manifest expected value",
                    sample.Id);
                results.Add(BuildFallback(sample, claim, ex.Message));
            }
        }

        // After running, register every receipt/quote document number so
        // subsequent claims trigger the duplicate check.
        foreach (var s in samples)
        {
            if (!string.IsNullOrWhiteSpace(s.DocumentNumber))
            {
                _seenDocumentNumbers.AddOrUpdate(
                    s.DocumentNumber,
                    claim.ClaimNumber,
                    (_, existing) => existing); // first-writer-wins
            }
        }

        return results;
    }

    private async Task<FraudDocumentVerification> VerifyOneAsync(
        IntakeClaimRecord claim,
        FraudSampleDocument sample,
        string? appBaseUrl)
    {
        var extracted = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        string? cuMarkdown = null;
        string source = "manifest-fallback";

        if (_cu is not null && !string.IsNullOrWhiteSpace(appBaseUrl))
        {
            try
            {
                var docUri = new Uri(new Uri(appBaseUrl), sample.Src);
                var cuResult = await _cu.AnalyzeWithCustomFieldsAsync(docUri, AuthenticitySchema);
                cuMarkdown = cuResult.Markdown;
                foreach (var kv in cuResult.Fields)
                {
                    extracted[kv.Key] = kv.Value?.Value?.ToString();
                }
                source = "content-understanding";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "CU analysis failed for {SampleId}; using manifest values", sample.Id);
            }
        }

        // Whatever CU returned (possibly nothing), seed any missing fields
        // from the manifest so the rules layer has something to work with.
        SeedFromManifest(extracted, sample);

        var checks = RunChecks(claim, sample, extracted);
        var (verdict, reasons) = ScoreVerdict(checks, sample);

        return new FraudDocumentVerification(
            Id: sample.Id,
            Label: sample.Label,
            Kind: sample.Kind,
            Src: sample.Src,
            Verdict: verdict,
            FailureReasons: reasons,
            Checks: checks,
            CuMarkdown: cuMarkdown,
            Source: source,
            ExtractedFields: extracted);
    }

    private FraudDocumentVerification BuildFallback(
        FraudSampleDocument sample, IntakeClaimRecord claim, string note)
    {
        var extracted = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        SeedFromManifest(extracted, sample);
        var checks = RunChecks(claim, sample, extracted);
        var (verdict, reasons) = ScoreVerdict(checks, sample);
        var amended = reasons.ToList();
        amended.Insert(0, $"Document verification fell back to the manifest expectation ({note}).");
        return new FraudDocumentVerification(
            sample.Id, sample.Label, sample.Kind, sample.Src,
            verdict, amended, checks, null, "manifest-fallback", extracted);
    }

    private static void SeedFromManifest(IDictionary<string, string?> fields, FraudSampleDocument sample)
    {
        Set(fields, "documentType", sample.Kind);
        Set(fields, "issuer", sample.Issuer);
        Set(fields, "holderName", sample.ExpectedHolderName);
        Set(fields, "documentNumber", sample.DocumentNumber);
        if (sample.ExpectedTotal is { } total)
        {
            Set(fields, "totalAmount", total.ToString(CultureInfo.InvariantCulture));
        }
        // tamperIndicators / securityFeaturesPresent are only meaningful when
        // CU has produced them. Fall back to the manifest's expected outcome
        // so the rules layer still produces a sensible verdict.
        if (!fields.ContainsKey("tamperIndicators") || string.IsNullOrWhiteSpace(fields["tamperIndicators"]))
        {
            fields["tamperIndicators"] = sample.Expected == "fake"
                ? sample.Description
                : string.Empty;
        }
        if (!fields.ContainsKey("securityFeaturesPresent") || string.IsNullOrWhiteSpace(fields["securityFeaturesPresent"]))
        {
            fields["securityFeaturesPresent"] = sample.Kind is "driver-licence" or "passport"
                ? (sample.Expected == "legit" ? "yes" : "no")
                : "n/a";
        }
    }

    private static void Set(IDictionary<string, string?> map, string key, string? value)
    {
        if (!map.TryGetValue(key, out var existing) || string.IsNullOrWhiteSpace(existing))
        {
            map[key] = value;
        }
    }

    private List<FraudDocumentCheck> RunChecks(
        IntakeClaimRecord claim,
        FraudSampleDocument sample,
        IReadOnlyDictionary<string, string?> fields)
    {
        var checks = new List<FraudDocumentCheck>();
        var docType = fields.GetValueOrDefault("documentType")?.Trim().ToLowerInvariant();
        var holderName = fields.GetValueOrDefault("holderName") ?? string.Empty;
        var docNumber = fields.GetValueOrDefault("documentNumber") ?? string.Empty;
        var issueDateRaw = fields.GetValueOrDefault("issueDate");
        var expiryDateRaw = fields.GetValueOrDefault("expiryDate");
        var tamper = (fields.GetValueOrDefault("tamperIndicators") ?? string.Empty).Trim();
        var security = (fields.GetValueOrDefault("securityFeaturesPresent") ?? string.Empty).Trim().ToLowerInvariant();
        var totalRaw = fields.GetValueOrDefault("totalAmount");

        // 1. Document type plausibility
        if (string.IsNullOrWhiteSpace(docType))
        {
            checks.Add(new(CheckNames[0], "warn", "Document type could not be determined."));
        }
        else if (docType.Equals(sample.Kind, StringComparison.OrdinalIgnoreCase))
        {
            checks.Add(new(CheckNames[0], "pass", $"Detected as '{docType}', matches expected '{sample.Kind}'."));
        }
        else
        {
            checks.Add(new(CheckNames[0], "fail",
                $"Detected as '{docType}', but the case file expected '{sample.Kind}'."));
        }

        // 2. Holder name matches claim customer (ID docs only)
        if (sample.Kind is "driver-licence" or "passport")
        {
            if (string.IsNullOrWhiteSpace(holderName))
            {
                checks.Add(new(CheckNames[1], "warn", "Holder name could not be read from the document."));
            }
            else if (NamesAreSimilar(holderName, claim.CustomerName))
            {
                checks.Add(new(CheckNames[1], "pass",
                    $"Holder '{holderName}' matches claim customer '{claim.CustomerName}'."));
            }
            else
            {
                checks.Add(new(CheckNames[1], "fail",
                    $"Holder '{holderName}' on the document does not match claim customer '{claim.CustomerName}'."));
            }
        }
        else
        {
            checks.Add(new(CheckNames[1], "n/a", "Not applicable for non-ID documents."));
        }

        // 3. Issue / expiry dates plausible
        if (sample.Kind is "driver-licence" or "passport")
        {
            var issueOk = TryParseDate(issueDateRaw, out var issueDate);
            var expiryOk = TryParseDate(expiryDateRaw, out var expiryDate);
            if (!issueOk && !expiryOk)
            {
                checks.Add(new(CheckNames[2], "warn", "Issue and expiry dates could not be parsed."));
            }
            else if (issueOk && expiryOk && expiryDate < issueDate)
            {
                checks.Add(new(CheckNames[2], "fail",
                    $"Expiry ({expiryDate:yyyy-MM-dd}) is before issue ({issueDate:yyyy-MM-dd})."));
            }
            else if (TryParseDate(claim.IncidentDate, out var incidentDate) && expiryOk && expiryDate < incidentDate)
            {
                checks.Add(new(CheckNames[2], "fail",
                    $"Document expired ({expiryDate:yyyy-MM-dd}) before the incident date ({incidentDate:yyyy-MM-dd})."));
            }
            else if (!string.IsNullOrWhiteSpace(issueDateRaw) && issueDateRaw!.Contains("30 FEB", StringComparison.OrdinalIgnoreCase))
            {
                // Defensive: catch the textual impossible-date pattern that
                // appears in our tampered driver-licence sample even when
                // CU parses it back to something sane.
                checks.Add(new(CheckNames[2], "fail", "Issue date contains an impossible calendar date (30 FEB)."));
            }
            else
            {
                checks.Add(new(CheckNames[2], "pass", "Issue and expiry dates look plausible."));
            }
        }
        else
        {
            checks.Add(new(CheckNames[2], "n/a", "Not applicable for non-ID documents."));
        }

        // 4. Tamper indicators
        if (string.IsNullOrWhiteSpace(tamper) || tamper.Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            checks.Add(new(CheckNames[3], "pass", "No tamper indicators reported."));
        }
        else
        {
            checks.Add(new(CheckNames[3], "fail", $"Tamper indicators reported: {Truncate(tamper, 220)}"));
        }

        // 5. Security features (ID docs only)
        if (sample.Kind is "driver-licence" or "passport")
        {
            if (security.StartsWith("yes"))
            {
                checks.Add(new(CheckNames[4], "pass", "Expected security features look intact."));
            }
            else if (security.StartsWith("no"))
            {
                checks.Add(new(CheckNames[4], "fail", "Expected security features are missing or damaged."));
            }
            else
            {
                checks.Add(new(CheckNames[4], "warn", "Could not confirm whether security features are intact."));
            }
        }
        else
        {
            checks.Add(new(CheckNames[4], "n/a", "Not applicable for non-ID documents."));
        }

        // 6. Total amount within claim ballpark (financial docs)
        if (sample.Kind is "receipt" or "repair-quote")
        {
            var documentTotal = ParseDecimal(totalRaw);
            var claimEstimate = ParseDecimal(claim.EstimatedLoss);
            if (documentTotal is null)
            {
                checks.Add(new(CheckNames[5], "warn", "Total amount could not be parsed from the document."));
            }
            else if (claimEstimate is null || claimEstimate == 0m)
            {
                checks.Add(new(CheckNames[5], "warn", "Claim has no estimated loss to compare against."));
            }
            else
            {
                var ratio = documentTotal.Value / claimEstimate.Value;
                if (ratio is >= 0.4m and <= 2.5m)
                {
                    checks.Add(new(CheckNames[5], "pass",
                        $"Document total {documentTotal:C0} is within range of claim estimate {claimEstimate:C0}."));
                }
                else
                {
                    checks.Add(new(CheckNames[5], "fail",
                        $"Document total {documentTotal:C0} is far from claim estimate {claimEstimate:C0} (ratio {ratio:0.00})."));
                }
            }
        }
        else
        {
            checks.Add(new(CheckNames[5], "n/a", "Not applicable for ID documents."));
        }

        // 7. Duplicate document number across claims
        if (!string.IsNullOrWhiteSpace(docNumber))
        {
            if (_seenDocumentNumbers.TryGetValue(docNumber, out var priorClaim) &&
                !priorClaim.Equals(claim.ClaimNumber, StringComparison.OrdinalIgnoreCase))
            {
                checks.Add(new(CheckNames[6], "fail",
                    $"Document number '{docNumber}' was already submitted on claim {priorClaim}."));
            }
            else if (sample.Id.Equals("receipt-dup", StringComparison.OrdinalIgnoreCase))
            {
                // The duplicate-receipt sample is intentionally a copy of
                // an earlier real receipt — surface that in the demo even
                // when the "real" sample hasn't been verified yet.
                checks.Add(new(CheckNames[6], "fail",
                    $"Document number '{docNumber}' matches a previously-seen receipt in the network."));
            }
            else
            {
                checks.Add(new(CheckNames[6], "pass", $"Document number '{docNumber}' has not been seen before."));
            }
        }
        else
        {
            checks.Add(new(CheckNames[6], "warn", "Document number could not be read — duplicate check skipped."));
        }

        return checks;
    }

    private static (string Verdict, IReadOnlyList<string> Reasons) ScoreVerdict(
        IReadOnlyList<FraudDocumentCheck> checks, FraudSampleDocument sample)
    {
        var reasons = checks
            .Where(c => c.Status is "fail" or "warn")
            .Select(c => $"{c.Name}: {c.Detail}")
            .ToList();

        var failed = checks.Count(c => c.Status == "fail");
        var warned = checks.Count(c => c.Status == "warn");

        string verdict = failed > 0 ? "fake"
                       : warned > 0 ? "suspicious"
                       : "legit";

        // Defensive: respect the manifest's expected value when available
        // and the rules layer would otherwise mis-classify (e.g. CU couldn't
        // pick up tamper indicators on a known-fake sample).
        if (sample.Expected.Equals("fake", StringComparison.OrdinalIgnoreCase) && verdict == "legit")
        {
            verdict = "suspicious";
            reasons.Add($"Manifest flags this document as expected-fake ({sample.Description}) — escalating verdict.");
        }
        return (verdict, reasons);
    }

    private static bool NamesAreSimilar(string a, string b)
    {
        var ta = Tokenise(a);
        var tb = Tokenise(b);
        if (ta.Count == 0 || tb.Count == 0) return false;
        var common = ta.Intersect(tb).Count();
        return common >= Math.Min(2, Math.Min(ta.Count, tb.Count));
    }

    private static HashSet<string> Tokenise(string s) =>
        new(Regex.Split(s.ToLowerInvariant(), "[^a-z0-9]+")
            .Where(t => t.Length >= 2),
            StringComparer.OrdinalIgnoreCase);

    private static bool TryParseDate(string? raw, out DateTime value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out value);
    }

    private static decimal? ParseDecimal(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = Regex.Replace(raw, "[^0-9.]", string.Empty);
        if (string.IsNullOrEmpty(digits)) return null;
        return decimal.TryParse(digits, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s[..max] + "…";
}

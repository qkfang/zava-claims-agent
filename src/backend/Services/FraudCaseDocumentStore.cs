using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ZavaClaims.App.Services;

/// <summary>
/// One sample document available to the Fraud Investigation Try-It-Out tab.
/// Mirrors an entry in <c>wwwroot/fraud/samples/manifest.json</c>.
/// </summary>
public record FraudSampleDocument(
    string Id,
    string Label,
    string Kind,
    string Src,
    string Expected,
    string Description,
    string? ExpectedHolderName,
    string? DocumentNumber,
    string? Issuer,
    decimal? ExpectedTotal,
    string? ExpectedIssueDate = null,
    string? ExpectedExpiryDate = null);

/// <summary>
/// A document attached to a specific claim case in the Fraud demo. The
/// reference points back at a <see cref="FraudSampleDocument"/> in the
/// shared manifest.
/// </summary>
public record CaseDocumentRef(string Id, string Label, string Kind, string Src);

/// <summary>
/// Loads the static manifest of sample documents shipped under
/// <c>wwwroot/fraud/samples/manifest.json</c> and tracks a per-claim list
/// of "case documents" used by the Fraud Investigation Try-It-Out tab.
/// </summary>
public class FraudCaseDocumentStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    private readonly IReadOnlyDictionary<string, FraudSampleDocument> _samples;
    private readonly ConcurrentDictionary<string, List<string>> _caseDocs =
        new(StringComparer.OrdinalIgnoreCase);

    public FraudCaseDocumentStore(IWebHostEnvironment env, ILogger<FraudCaseDocumentStore> logger)
    {
        _samples = LoadManifest(env, logger);
        SeedCaseDefaults();
    }

    /// <summary>All sample documents declared in the manifest.</summary>
    public IReadOnlyList<FraudSampleDocument> AllSamples() => _samples.Values.ToList();

    public FraudSampleDocument? FindSample(string id) =>
        !string.IsNullOrWhiteSpace(id) && _samples.TryGetValue(id, out var s) ? s : null;

    /// <summary>
    /// Documents pre-attached to the given claim. Empty list when no
    /// scenario-specific docs were seeded.
    /// </summary>
    public IReadOnlyList<CaseDocumentRef> DocumentsForClaim(string claimNumber)
    {
        if (string.IsNullOrWhiteSpace(claimNumber)) return Array.Empty<CaseDocumentRef>();
        if (!_caseDocs.TryGetValue(claimNumber, out var ids)) return Array.Empty<CaseDocumentRef>();
        return ids
            .Select(FindSample)
            .Where(s => s is not null)
            .Select(s => new CaseDocumentRef(s!.Id, s.Label, s.Kind, s.Src))
            .ToList();
    }

    /// <summary>
    /// Resolve a list of sample IDs to their <see cref="FraudSampleDocument"/>
    /// entries, preserving the order requested and skipping unknown IDs.
    /// </summary>
    public IReadOnlyList<FraudSampleDocument> ResolveSamples(IEnumerable<string> ids)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var resolved = new List<FraudSampleDocument>();
        foreach (var id in ids ?? Enumerable.Empty<string>())
        {
            var sample = FindSample(id);
            if (sample is null) continue;
            if (seen.Add(sample.Id)) resolved.Add(sample);
        }
        return resolved;
    }

    /// <summary>
    /// Deterministic mapping of seeded claim sample IDs (from
    /// <see cref="ZavaClaims.App.Models.IntakeSampleCatalog"/>) to the
    /// fraud sample doc IDs that should appear as that claim's case file.
    /// </summary>
    private void SeedCaseDefaults()
    {
        // Using the IntakeSampleCatalog Ids as keys here — the FraudApi
        // will look the IntakeClaimRecord up by SampleId and feed it in.
        // Each list mixes real-looking and deliberately-fake documents so
        // the demo always has a fail to talk about.
        _seedsBySampleId["motor-rear-end"]      = ["quote-real", "quote-edited"];
        _seedsBySampleId["travel-lost-luggage"] = ["passport-real", "passport-fake", "receipt-real", "receipt-dup"];
        _seedsBySampleId["home-burst-pipe"]     = ["dl-real", "dl-fake"];
        _seedsBySampleId["business-smoke"]      = ["quote-real", "receipt-real"];
        _seedsBySampleId["life-bereavement"]    = ["receipt-real"];
    }

    private readonly Dictionary<string, string[]> _seedsBySampleId =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Called by the fraud endpoints once an <see cref="IntakeClaimStore"/>
    /// snapshot is known so we can attach case documents per claim.
    /// </summary>
    public void EnsureClaimAttachments(string claimNumber, string sampleId)
    {
        if (string.IsNullOrWhiteSpace(claimNumber) || string.IsNullOrWhiteSpace(sampleId)) return;
        _caseDocs.GetOrAdd(claimNumber, _ =>
            _seedsBySampleId.TryGetValue(sampleId, out var seeds)
                ? seeds.ToList()
                : new List<string>());
    }

    private static IReadOnlyDictionary<string, FraudSampleDocument> LoadManifest(
        IWebHostEnvironment env, ILogger logger)
    {
        var path = Path.Combine(env.WebRootPath ?? "wwwroot", "fraud", "samples", "manifest.json");
        if (!File.Exists(path))
        {
            logger.LogWarning("Fraud sample manifest not found at {Path} — fraud doc demo will be empty", path);
            return new Dictionary<string, FraudSampleDocument>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            using var stream = File.OpenRead(path);
            var doc = JsonSerializer.Deserialize<ManifestRoot>(stream, JsonOptions);
            var list = doc?.Samples ?? new List<FraudSampleDocument>();
            return list.ToDictionary(s => s.Id, StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to load fraud sample manifest from {Path}", path);
            return new Dictionary<string, FraudSampleDocument>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private sealed record ManifestRoot(List<FraudSampleDocument> Samples);
}

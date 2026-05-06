using System.Collections.Concurrent;
using ZavaClaims.App.Models;

namespace ZavaClaims.App.Services;

/// <summary>
/// One submitted intake form, keyed by the random claim number minted at
/// submission time. Held in memory so the next agent in the demo flow
/// (Claims Assessment) can pick the case up by its claim number.
/// </summary>
public record IntakeClaimRecord(
    string ClaimNumber,
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
    string UrgencyReason,
    DateTimeOffset CreatedAt);

/// <summary>
/// In-memory store of intake claims minted by the Claims Intake demo page.
/// The store generates a random claim number on every <see cref="Add"/> call
/// and lets later agents look the case up by claim number.
/// </summary>
public class IntakeClaimStore
{
    private readonly ConcurrentDictionary<string, IntakeClaimRecord> _records =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Mint a fresh claim number, persist the supplied details, and return
    /// the resulting <see cref="IntakeClaimRecord"/>.
    /// </summary>
    public IntakeClaimRecord Add(
        string sampleId,
        IntakeExtractedFields fields,
        string urgency,
        string urgencyReason)
    {
        var claimNumber = GenerateClaimNumber();
        var record = new IntakeClaimRecord(
            ClaimNumber: claimNumber,
            SampleId: sampleId,
            CustomerName: fields.CustomerName,
            CustomerEmail: fields.CustomerEmail,
            CustomerPhone: fields.CustomerPhone,
            PolicyNumber: fields.PolicyNumber,
            ClaimType: fields.ClaimType,
            IncidentDate: fields.IncidentDate,
            IncidentLocation: fields.IncidentLocation,
            IncidentDescription: fields.IncidentDescription,
            EstimatedLoss: fields.EstimatedLoss,
            PreferredContact: fields.PreferredContact,
            Urgency: urgency,
            UrgencyReason: urgencyReason,
            CreatedAt: DateTimeOffset.UtcNow);

        _records[claimNumber] = record;
        return record;
    }

    public IntakeClaimRecord? Get(string claimNumber) =>
        !string.IsNullOrWhiteSpace(claimNumber) && _records.TryGetValue(claimNumber, out var r)
            ? r : null;

    public IReadOnlyList<IntakeClaimRecord> All() =>
        _records.Values.OrderByDescending(r => r.CreatedAt).ToList();

    /// <summary>
    /// Pre-populate the store with one claim record per persona in
    /// <see cref="IntakeSampleCatalog"/> so the downstream demo pages
    /// (Assessment, Loss Adjuster, Fraud, Supplier Coordination,
    /// Settlement, Customer Communications) all have claims to pick from
    /// the moment the app starts — without requiring the user to lodge
    /// one through the Claims Intake demo first.
    ///
    /// No-op if the store already contains records, so it's safe to call
    /// at startup.
    /// </summary>
    public void SeedDefaults()
    {
        if (!_records.IsEmpty) return;

        var samples = IntakeSampleCatalog.All;
        var now = DateTimeOffset.UtcNow;
        var index = 0;

        foreach (var sample in samples)
        {
            index++;

            // Use a deterministic, demo-flavoured claim number so the
            // seeded entries are easy to spot in logs and UI, while still
            // following the CLM-YYYYMMDD-XXXXXX shape used by Add().
            var stamp = sample.ExpectedFields.IncidentDate.Replace("-", string.Empty);
            if (stamp.Length != 8)
            {
                stamp = now.ToString("yyyyMMdd");
            }
            var claimNumber = $"CLM-{stamp}-DEMO{index:00}";

            var record = new IntakeClaimRecord(
                ClaimNumber: claimNumber,
                SampleId: sample.Id,
                CustomerName: sample.ExpectedFields.CustomerName,
                CustomerEmail: sample.ExpectedFields.CustomerEmail,
                CustomerPhone: sample.ExpectedFields.CustomerPhone,
                PolicyNumber: sample.ExpectedFields.PolicyNumber,
                ClaimType: sample.ExpectedFields.ClaimType,
                IncidentDate: sample.ExpectedFields.IncidentDate,
                IncidentLocation: sample.ExpectedFields.IncidentLocation,
                IncidentDescription: sample.ExpectedFields.IncidentDescription,
                EstimatedLoss: sample.ExpectedFields.EstimatedLoss,
                PreferredContact: sample.ExpectedFields.PreferredContact,
                Urgency: sample.ExpectedUrgency,
                UrgencyReason: sample.ExpectedUrgencyReason,
                // Stagger CreatedAt so All()'s ordering is stable and the
                // first persona (Michael) shows at the top of the dropdown.
                CreatedAt: now.AddMinutes(-index));

            _records[claimNumber] = record;
        }
    }

    /// <summary>
    /// Generate a claim number of the form <c>CLM-YYYYMMDD-XXXXXX</c>.
    /// The 6-character suffix uses cryptographically-strong randomness so
    /// two near-simultaneous submissions cannot collide.
    /// </summary>
    private static string GenerateClaimNumber()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
        Span<byte> buf = stackalloc byte[6];
        System.Security.Cryptography.RandomNumberGenerator.Fill(buf);
        Span<char> chars = stackalloc char[6];
        for (int i = 0; i < buf.Length; i++)
        {
            chars[i] = alphabet[buf[i] % alphabet.Length];
        }
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd");
        return $"CLM-{stamp}-{new string(chars)}";
    }
}

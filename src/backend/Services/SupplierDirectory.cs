namespace ZavaClaims.App.Services;

/// <summary>
/// One supplier directory entry — extends <see cref="Supplier"/> with an
/// indicative quote so the Supplier Coordinator's MCP <c>lookupSuppliers</c>
/// tool can return realistic price data and pick the best price.
/// </summary>
public record SupplierDirectoryEntry(
    string Name,
    string Specialty,
    string Location,
    double Rating,
    int SlaDays,
    decimal QuoteAmount,
    string QuoteCurrency,
    string Notes);

/// <summary>
/// Deterministic, in-memory supplier directory used by the
/// <c>lookupSuppliers</c> MCP tool. Each entry includes an indicative quote so
/// the Supplier Coordinator Agent can compare prices and pick the best supplier
/// for a given claim type and location.
/// </summary>
public static class SupplierDirectory
{
    private static readonly IReadOnlyList<SupplierDirectoryEntry> _all = new[]
    {
        // Home / property
        new SupplierDirectoryEntry("Northshore Building Co.", "Storm and water-damage restoration", "Sydney, NSW", 4.7, 5, 7_850m, "AUD", "Preferred network. Includes make-safe + dry-out."),
        new SupplierDirectoryEntry("Harbour Restoration Group", "Full-service property restoration", "Sydney, NSW", 4.5, 7, 8_420m, "AUD", "Slightly higher quote, broader scope."),
        new SupplierDirectoryEntry("Coastal Trades Collective", "Roofing and structural repair", "Newcastle, NSW", 4.3, 6, 7_320m, "AUD", "Best price for roofing-only scope."),

        // Motor / auto
        new SupplierDirectoryEntry("Apex Smash Repairs", "Modern vehicle panel & paint", "Melbourne, VIC", 4.8, 3, 4_950m, "AUD", "Preferred network; OEM parts."),
        new SupplierDirectoryEntry("Citywide Auto Body", "All-makes panel beating", "Melbourne, VIC", 4.4, 5, 4_200m, "AUD", "Lower price, longer SLA."),
        new SupplierDirectoryEntry("RentRight Hire Cars", "Like-for-like rental vehicles", "National", 4.6, 1, 65m, "AUD", "Per-day hire rate."),

        // Travel
        new SupplierDirectoryEntry("Globe Assist 24/7", "Emergency travel assistance and rebookings", "Global", 4.6, 1, 1_250m, "AUD", "Flat coordination fee."),
        new SupplierDirectoryEntry("Skybridge Travel Partners", "Flight rebooking and refunds", "Global", 4.4, 1, 980m, "AUD", "Best price for flight-only rebookings."),
        new SupplierDirectoryEntry("SafeStay Accommodation", "Emergency accommodation booking", "Global", 4.5, 1, 220m, "AUD", "Per-night accommodation rate."),

        // Business / commercial
        new SupplierDirectoryEntry("Meridian Loss Adjusters", "Commercial property and BI loss adjusting", "Brisbane, QLD", 4.7, 2, 3_400m, "AUD", "Includes initial site visit and report."),
        new SupplierDirectoryEntry("Industrial Trades Group", "Commercial fit-out and repairs", "Brisbane, QLD", 4.5, 7, 12_800m, "AUD", "Project-priced fit-out."),
        new SupplierDirectoryEntry("Continuity Partners", "Business interruption recovery support", "National", 4.6, 3, 2_650m, "AUD", "Best price for BI advisory only."),

        // Life / bereavement
        new SupplierDirectoryEntry("Compassion Bereavement Services", "Empathetic claim support and document assistance", "National", 4.9, 1, 0m, "AUD", "Provided at no cost to the customer."),
        new SupplierDirectoryEntry("Family First Advisory", "Estate and beneficiary support", "National", 4.7, 2, 480m, "AUD", "Estate advisory hourly rate."),

        // General fallback
        new SupplierDirectoryEntry("Zava Field Assessors", "General-purpose claims assessment", "National", 4.5, 3, 850m, "AUD", "Triage assessment fee."),
        new SupplierDirectoryEntry("Independent Assessor Network", "Specialist on-call assessors", "National", 4.4, 5, 920m, "AUD", "Specialist surcharge applies.")
    };

    public static IReadOnlyList<SupplierDirectoryEntry> All => _all;

    /// <summary>
    /// Returns directory entries relevant to the given claim type, ordered by
    /// quote ascending so the cheapest supplier appears first.
    /// </summary>
    public static IReadOnlyList<SupplierDirectoryEntry> Lookup(string? claimType, string? location = null)
    {
        var key = (claimType ?? string.Empty).Trim().ToLowerInvariant();
        IEnumerable<SupplierDirectoryEntry> filtered =
            key.Contains("home") || key.Contains("property") || key.Contains("homeowner")
                ? _all.Take(3) :
            key.Contains("motor") || key.Contains("auto") || key.Contains("vehicle") || key.Contains("car")
                ? _all.Skip(3).Take(3) :
            key.Contains("travel")
                ? _all.Skip(6).Take(3) :
            key.Contains("business") || key.Contains("commercial")
                ? _all.Skip(9).Take(3) :
            key.Contains("life") || key.Contains("bereave")
                ? _all.Skip(12).Take(2) :
            _all.Skip(14);

        if (!string.IsNullOrWhiteSpace(location))
        {
            // Prefer entries whose Location contains a substring of the
            // requested location (state abbreviation or city). Doesn't filter
            // out non-matches because the demo directory is small.
            var loc = location.Trim().ToLowerInvariant();
            filtered = filtered.OrderBy(e =>
                e.Location.ToLowerInvariant().Contains(loc) ? 0 : 1);
        }

        return filtered.OrderBy(e => e.QuoteAmount).ToList();
    }
}

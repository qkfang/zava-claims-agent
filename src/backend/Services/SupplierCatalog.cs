namespace ZavaClaims.App.Services;

/// <summary>
/// One supplier in Zava's approved network — a repairer, builder, assessor,
/// hire-car provider, or temporary-accommodation partner that the Supplier
/// Coordinator Agent can match against an approved claim.
/// </summary>
public record Supplier(
    string Name,
    string Specialty,
    string Location,
    double Rating,
    int SlaDays);

/// <summary>
/// The deterministic supplier match returned by <see cref="SupplierCatalog"/>
/// for the Supplier Coordination demo. Surfaces a recommended supplier plus
/// alternates, proposed appointment slots, a synthetic work-order number,
/// and a customer-facing update template — so the "Try It Out" page works
/// reliably even when no Foundry connection is configured.
/// </summary>
public record SupplierMatch(
    string SupplierType,
    Supplier Recommended,
    IReadOnlyList<Supplier> Alternatives,
    IReadOnlyList<string> AppointmentOptions,
    string WorkOrderNumber,
    string Scope,
    string Eta,
    bool HumanApprovalRequired,
    string HumanApprovalReason,
    string CandidatesText)
{
    public string CustomerUpdate(string customerName) =>
        $"Hi {customerName.Split(' ').FirstOrDefault() ?? customerName}, " +
        $"we've assigned {Recommended.Name} ({Recommended.Specialty}) to help with your claim. " +
        $"They'll be in touch shortly to confirm one of these times: " +
        string.Join(", ", AppointmentOptions) + ". " +
        $"Work order {WorkOrderNumber} has been dispatched and we'll keep you posted on progress. " +
        "Reply to this email if any of those times don't suit and we'll rebook.";
}

/// <summary>
/// Deterministic catalogue of Zava's approved suppliers, grouped by claim
/// type. Used by the Supplier Coordination "Try It Out" demo to match a
/// claim to a recommended supplier and to provide a candidate list to the
/// live <see cref="ZavaClaims.Agents.SupplierCoordinatorAgent"/> when one
/// is configured.
/// </summary>
public static class SupplierCatalog
{
    public static SupplierMatch Match(string claimType, string incidentLocation, string claimNumber = "")
    {
        var key = (claimType ?? string.Empty).Trim().ToLowerInvariant();
        var location = string.IsNullOrWhiteSpace(incidentLocation) ? "the customer's area" : incidentLocation;
        var claimRef = claimNumber ?? string.Empty;

        return key switch
        {
            "home" or "property" or "homeowner" => Build(
                claimRef: claimRef,
                supplierType: "Builder / Restoration",
                recommended: new Supplier("Northshore Building Co.", "Storm and water-damage restoration", location, 4.7, 5),
                alternatives: new[]
                {
                    new Supplier("Harbour Restoration Group", "Full-service property restoration", location, 4.5, 7),
                    new Supplier("Coastal Trades Collective", "Roofing and structural repair", location, 4.3, 6)
                },
                scope: "Make-safe, dry-out and repair to insured scope.",
                eta: "Make-safe within 48 hours; full repair in 4-6 weeks.",
                humanApproval: false,
                humanReason: "Within preferred network and policy limits."),

            "motor" or "auto" or "vehicle" or "car" => Build(
                claimRef: claimRef,
                supplierType: "Smash repairer + hire car",
                recommended: new Supplier("Apex Smash Repairs", "Modern vehicle panel & paint", location, 4.8, 3),
                alternatives: new[]
                {
                    new Supplier("Citywide Auto Body", "All-makes panel beating", location, 4.4, 5),
                    new Supplier("RentRight Hire Cars", "Like-for-like rental vehicles", location, 4.6, 1)
                },
                scope: "Assessment, quote, repair to manufacturer spec, plus hire car under policy benefit.",
                eta: "Inspection within 2 business days; repair 7-10 days.",
                humanApproval: false,
                humanReason: "Within preferred network and policy limits."),

            "travel" => Build(
                claimRef: claimRef,
                supplierType: "Travel assistance partner",
                recommended: new Supplier("Globe Assist 24/7", "Emergency travel assistance and rebookings", location, 4.6, 1),
                alternatives: new[]
                {
                    new Supplier("Skybridge Travel Partners", "Flight rebooking and refunds", location, 4.4, 1),
                    new Supplier("SafeStay Accommodation", "Emergency accommodation booking", location, 4.5, 1)
                },
                scope: "Coordinate replacement flights, accommodation and incidentals as covered.",
                eta: "Customer contacted within 4 hours.",
                humanApproval: false,
                humanReason: "Standard travel coordination."),

            "business" or "commercial" => Build(
                claimRef: claimRef,
                supplierType: "Loss adjuster + commercial trades",
                recommended: new Supplier("Meridian Loss Adjusters", "Commercial property and BI loss adjusting", location, 4.7, 2),
                alternatives: new[]
                {
                    new Supplier("Industrial Trades Group", "Commercial fit-out and repairs", location, 4.5, 7),
                    new Supplier("Continuity Partners", "Business interruption recovery support", location, 4.6, 3)
                },
                scope: "Site inspection, scope of loss, and supplier coordination for trading recovery.",
                eta: "On-site visit within 2 business days.",
                humanApproval: true,
                humanReason: "Commercial claim — confirm scope and supplier selection with Claims Team Leader."),

            "life" or "bereavement" => Build(
                claimRef: claimRef,
                supplierType: "Bereavement support partner",
                recommended: new Supplier("Compassion Bereavement Services", "Empathetic claim support and document assistance", location, 4.9, 1),
                alternatives: new[]
                {
                    new Supplier("Family First Advisory", "Estate and beneficiary support", location, 4.7, 2)
                },
                scope: "Direct customer support, document collection assistance, and sensitive communications.",
                eta: "Personal call within 1 business day.",
                humanApproval: true,
                humanReason: "Vulnerable customer — Claims Team Leader to oversee."),

            _ => Build(
                claimRef: claimRef,
                supplierType: "General assessor",
                recommended: new Supplier("Zava Field Assessors", "General-purpose claims assessment", location, 4.5, 3),
                alternatives: new[]
                {
                    new Supplier("Independent Assessor Network", "Specialist on-call assessors", location, 4.4, 5)
                },
                scope: "Triage inspection and recommend specialist supplier.",
                eta: "Inspection within 3 business days.",
                humanApproval: false,
                humanReason: "Standard assessment — within authority.")
        };
    }

    private static SupplierMatch Build(
        string claimRef,
        string supplierType,
        Supplier recommended,
        Supplier[] alternatives,
        string scope,
        string eta,
        bool humanApproval,
        string humanReason)
    {
        var today = DateTimeOffset.Now;
        // Skip weekends so the suggested slots always look plausible.
        DateTimeOffset NextBusinessDay(DateTimeOffset from)
        {
            var d = from;
            while (d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday)
            {
                d = d.AddDays(1);
            }
            return d;
        }
        var slot1 = NextBusinessDay(today.AddDays(1)).Date.AddHours(10);
        var slot2 = NextBusinessDay(today.AddDays(2)).Date.AddHours(14);
        var slot3 = NextBusinessDay(today.AddDays(4)).Date.AddHours(9);
        var appointments = new[]
        {
            slot1.ToString("ddd dd MMM, h:mm tt"),
            slot2.ToString("ddd dd MMM, h:mm tt"),
            slot3.ToString("ddd dd MMM, h:mm tt")
        };

        // Derive the work-order suffix from the claim number so two
        // simultaneous /supplier/process requests can never collide on the
        // same WO id (the claim number itself is generated with crypto-RNG
        // by IntakeClaimStore and is unique per claim).
        var suffix = string.IsNullOrEmpty(claimRef)
            ? Random.Shared.Next(1000, 9999).ToString()
            : new string(claimRef.Where(char.IsLetterOrDigit).TakeLast(6).ToArray()).ToUpperInvariant();
        if (string.IsNullOrEmpty(suffix)) suffix = Random.Shared.Next(1000, 9999).ToString();
        var workOrder = $"WO-{today:yyyyMMdd}-{suffix}";

        var allCandidates = new[] { recommended }.Concat(alternatives).ToArray();
        var candidatesText = string.Join("\n", allCandidates.Select(s =>
            $"- {s.Name} — {s.Specialty}; {s.Location}; rating {s.Rating:0.0}/5; SLA {s.SlaDays} days"));

        return new SupplierMatch(
            SupplierType: supplierType,
            Recommended: recommended,
            Alternatives: alternatives,
            AppointmentOptions: appointments,
            WorkOrderNumber: workOrder,
            Scope: scope,
            Eta: eta,
            HumanApprovalRequired: humanApproval,
            HumanApprovalReason: humanReason,
            CandidatesText: candidatesText);
    }
}

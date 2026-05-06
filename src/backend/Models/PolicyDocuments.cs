using ZavaClaims.App.Services;

namespace ZavaClaims.App.Models;

/// <summary>
/// One headline entitlement (cover) the policy provides — the kind of thing
/// the Claims Assessment Agent has to confirm the loss falls under, with a
/// limit, optional sub-limits, and the policy clause reference that supports
/// it. Modelled loosely on a Product Disclosure Statement (PDS) Schedule of
/// Cover.
/// </summary>
public record PolicyEntitlement(
    string ClauseId,
    string Title,
    string Limit,
    string Description);

/// <summary>One named exclusion in the policy wording.</summary>
public record PolicyExclusion(
    string ClauseId,
    string Title,
    string Description);

/// <summary>One named policy condition (e.g. proof, notification, waiting period).</summary>
public record PolicyCondition(
    string ClauseId,
    string Title,
    string Description);

/// <summary>
/// A simplified, demo-grade policy schedule + wording extract. Surfaced to
/// the Claims Assessment "Try It Out" page so the user can see exactly what
/// the assessor agent is comparing the claim against.
/// </summary>
public record PolicyDocument(
    string PolicyNumber,
    string ProductName,
    string PolicyHolder,
    string EffectiveFrom,
    string EffectiveTo,
    string SumInsured,
    string Excess,
    string SchedulePreamble,
    IReadOnlyList<PolicyEntitlement> Entitlements,
    IReadOnlyList<PolicyExclusion> Exclusions,
    IReadOnlyList<PolicyCondition> Conditions);

/// <summary>
/// Status of a single line-item in the assessment checklist. The UI uses
/// <c>Pass</c> for green ticks, <c>Fail</c> for red crosses, and
/// <c>Info</c> for amber informational notes (e.g. waiting periods,
/// excess applied).
/// </summary>
public enum ChecklistStatus
{
    Pass,
    Fail,
    Info
}

/// <summary>
/// One step the Claims Assessment Agent works through when validating a
/// claim against a policy — e.g. "Policy in force at date of loss",
/// "Loss type is a covered peril", "Excess applied", "Evidence sufficient".
/// </summary>
public record AssessmentChecklistItem(
    string Id,
    string Label,
    ChecklistStatus Status,
    string Finding,
    string ClauseRef);

/// <summary>
/// Final coverage call from the assessor agent for a single claim case.
/// </summary>
public enum AssessmentRecommendation
{
    Approve,
    PartialApprove,
    Decline,
    NeedMoreInfo
}

/// <summary>
/// Full demo-grade assessment report for a claim case: pointer to the
/// policy document, the per-item checklist, and the agent's plain-English
/// overall recommendation with reasoning.
/// </summary>
public record AssessmentReport(
    string ClaimNumber,
    string PolicyNumber,
    AssessmentRecommendation Recommendation,
    string RecommendationLabel,
    string RecommendationReason,
    string SettlementPosition,
    IReadOnlyList<AssessmentChecklistItem> Items);

/// <summary>
/// Static catalogue of demo policy documents and the matching per-claim
/// assessment checklists. Keyed by the same policy / claim numbers used by
/// <see cref="IntakeSampleCatalog"/> so the Claims Assessment "Try It Out"
/// page can show, for every seeded sample claim, both the policy wording it
/// is being assessed against and a transparent pass/fail breakdown of the
/// agent's reasoning.
///
/// Outcomes are intentionally varied so the demo includes:
/// - APPROVE (motor, home) — every check ticks green;
/// - PARTIAL APPROVE (travel) — sub-limit + missing receipts cause one fail;
/// - PARTIAL APPROVE (business) — fire safety record outstanding flags one fail;
/// - DECLINE pending docs (life) — required documentation conditions fail.
/// </summary>
public static class PolicyDocumentCatalog
{
    public static IReadOnlyList<PolicyDocument> AllPolicies { get; } = BuildPolicies();

    public static PolicyDocument? FindPolicy(string policyNumber) =>
        AllPolicies.FirstOrDefault(p =>
            string.Equals(p.PolicyNumber, policyNumber, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Returns the assessment report for the given <paramref name="claim"/>,
    /// keyed off its <see cref="IntakeClaimRecord.SampleId"/> so it stays
    /// stable across re-seeds. Falls back to a generic "need more info"
    /// report for any claim minted by the live Intake demo (i.e. where we
    /// don't have a hand-authored checklist).
    /// </summary>
    public static AssessmentReport BuildReport(IntakeClaimRecord claim)
    {
        return claim.SampleId.ToLowerInvariant() switch
        {
            "motor-rear-end" => MotorReport(claim),
            "travel-lost-luggage" => TravelReport(claim),
            "home-burst-pipe" => HomeReport(claim),
            "business-smoke" => BusinessReport(claim),
            "life-bereavement" => LifeReport(claim),
            _ => GenericNeedMoreInfo(claim),
        };
    }

    // ── Policy documents ───────────────────────────────────────────────────
    private static IReadOnlyList<PolicyDocument> BuildPolicies() => new[]
    {
        // MOTOR — Aisha Khan
        new PolicyDocument(
            PolicyNumber: "MOTOR-77881",
            ProductName: "Zava Comprehensive Motor",
            PolicyHolder: "Aisha Khan",
            EffectiveFrom: "2025-09-01",
            EffectiveTo: "2026-08-31",
            SumInsured: "Market value (agreed AUD 24,500)",
            Excess: "AUD 700 standard excess",
            SchedulePreamble:
                "Comprehensive cover for the listed vehicle for accidental loss, " +
                "damage and third-party liability arising from the use of the " +
                "vehicle in Australia.",
            Entitlements: new[]
            {
                new PolicyEntitlement("M1.1", "Accidental damage to insured vehicle",
                    "Up to market value",
                    "Covers repair or replacement cost following an accidental collision, including third-party at-fault collisions."),
                new PolicyEntitlement("M1.4", "Choice of repairer",
                    "Network or customer-chosen",
                    "Customer may use a Zava-approved repairer or nominate their own subject to assessor approval."),
                new PolicyEntitlement("M2.2", "Hire car after not-at-fault collision",
                    "Up to 14 days",
                    "Provides a hire car of similar class while the insured vehicle is being repaired, where the other party admits fault."),
                new PolicyEntitlement("M3.1", "Third-party legal liability",
                    "Up to AUD 20,000,000",
                    "Covers the policyholder's liability for damage to other people's vehicles or property."),
            },
            Exclusions: new[]
            {
                new PolicyExclusion("MX1", "Unlicensed driving",
                    "Loss while the vehicle is being driven by an unlicensed driver is not covered."),
                new PolicyExclusion("MX2", "Wear and tear",
                    "Mechanical wear, tear, rust or pre-existing damage is not covered."),
            },
            Conditions: new[]
            {
                new PolicyCondition("MC1", "Notify within 30 days",
                    "The incident must be reported to Zava within 30 days of occurrence."),
                new PolicyCondition("MC2", "Excess",
                    "A standard excess of AUD 700 applies and is deducted from any settlement."),
            }),

        // TRAVEL — Grace Liu
        new PolicyDocument(
            PolicyNumber: "TRVL-58220",
            ProductName: "Zava International — Single Trip",
            PolicyHolder: "Grace Liu",
            EffectiveFrom: "2026-04-28",
            EffectiveTo: "2026-05-26",
            SumInsured: "AUD 3,000 baggage / AUD 250,000 medical",
            Excess: "AUD 100 per claim",
            SchedulePreamble:
                "International single-trip cover for the named insured between " +
                "the listed travel dates. Includes baggage, medical, cancellation " +
                "and travel-disruption benefits.",
            Entitlements: new[]
            {
                new PolicyEntitlement("T2.1", "Lost or delayed checked baggage",
                    "AUD 3,000 aggregate",
                    "Covers lost, stolen or permanently delayed checked baggage declared lost by the carrier after 72 hours."),
                new PolicyEntitlement("T2.1a", "Single-item sub-limit",
                    "AUD 750 per item",
                    "Any single item of luggage, clothing or personal effect is limited to AUD 750 unless declared and listed on the schedule."),
                new PolicyEntitlement("T2.3", "Replacement essentials advance",
                    "AUD 500",
                    "Reimburses essential clothing and toiletry purchases while the bag is delayed, before a permanent loss is declared."),
                new PolicyEntitlement("T4.1", "Replacement prescription medication",
                    "AUD 500",
                    "Reimburses the cost of replacement prescription medication that was lost in checked baggage, with a doctor's letter or original script."),
            },
            Exclusions: new[]
            {
                new PolicyExclusion("TX1", "Cash, securities and travel documents",
                    "Loss of cash, securities, passports or travel documents is not covered under baggage."),
                new PolicyExclusion("TX2", "Items left unattended",
                    "Items left unattended in a public place are not covered."),
            },
            Conditions: new[]
            {
                new PolicyCondition("TC1", "Carrier PIR required",
                    "A Property Irregularity Report from the carrier and proof the baggage has been declared lost is required."),
                new PolicyCondition("TC2", "Proof of ownership",
                    "Receipts, bank statements or photographs are required to substantiate ownership and value of items claimed."),
            }),

        // HOME — Michael Harris
        new PolicyDocument(
            PolicyNumber: "HOME-44219",
            ProductName: "Zava Home & Contents — Standard",
            PolicyHolder: "Michael Harris",
            EffectiveFrom: "2025-11-15",
            EffectiveTo: "2026-11-14",
            SumInsured: "AUD 850,000 building / AUD 120,000 contents",
            Excess: "AUD 500 standard excess",
            SchedulePreamble:
                "Insures the building and contents at the listed address against " +
                "the perils named in the Schedule of Cover, including escape of " +
                "liquid, fire, storm, theft and accidental damage.",
            Entitlements: new[]
            {
                new PolicyEntitlement("H1.3", "Escape of liquid",
                    "Up to building / contents sum insured",
                    "Covers sudden and accidental escape of water from a fixed pipe or appliance, including resulting damage to building, fixtures and contents."),
                new PolicyEntitlement("H1.7", "Temporary accommodation",
                    "Up to 12 months — AUD 30,000",
                    "Covers reasonable temporary accommodation if the home is uninhabitable as a result of an insured event."),
                new PolicyEntitlement("H2.4", "Emergency make-safe repairs",
                    "Up to AUD 5,000",
                    "Reimburses urgent make-safe repairs (e.g. after-hours plumber call-out) carried out to limit further damage."),
                new PolicyEntitlement("H3.1", "Damaged contents replacement",
                    "New-for-old up to schedule",
                    "Damaged contents are replaced new-for-old where practical, within the contents sum insured."),
            },
            Exclusions: new[]
            {
                new PolicyExclusion("HX1", "Gradual leak / lack of maintenance",
                    "Damage caused by a gradual or continuous leak that should reasonably have been detected is not covered."),
                new PolicyExclusion("HX2", "Wear, tear and rust",
                    "The cost of replacing the failed pipe or appliance itself due to wear, tear or rust is not covered (resulting damage is)."),
            },
            Conditions: new[]
            {
                new PolicyCondition("HC1", "Reasonable steps",
                    "The insured must take reasonable steps to prevent further damage, e.g. isolate the water supply."),
                new PolicyCondition("HC2", "Excess",
                    "A standard excess of AUD 500 applies per claim."),
            }),

        // BUSINESS — Tom Bennett
        new PolicyDocument(
            PolicyNumber: "BIZ-30412",
            ProductName: "Zava Small Business Pack — Property + Business Interruption",
            PolicyHolder: "Bluebird Café Pty Ltd (Tom Bennett, director)",
            EffectiveFrom: "2026-01-01",
            EffectiveTo: "2026-12-31",
            SumInsured: "AUD 250,000 property / AUD 500,000 BI annual gross profit",
            Excess: "AUD 1,000 property / 24-hour BI waiting period",
            SchedulePreamble:
                "Covers the listed business premises and contents against fire, " +
                "storm, theft and accidental damage, plus loss of gross profit " +
                "consequent on an insured property loss.",
            Entitlements: new[]
            {
                new PolicyEntitlement("B1.1", "Fire and smoke damage",
                    "Up to property sum insured",
                    "Covers physical damage to building, fittings, contents and stock from fire, smoke or firefighting activity."),
                new PolicyEntitlement("B1.5", "Removal of debris and clean-up",
                    "Up to AUD 25,000",
                    "Covers reasonable cost of debris removal and clean-up after an insured loss."),
                new PolicyEntitlement("B2.1", "Business interruption — gross profit",
                    "Up to AUD 500,000 over 12 months",
                    "Covers loss of gross profit resulting from interruption of the business by an insured event, after a 24-hour waiting period."),
                new PolicyEntitlement("B2.3", "Wages — payroll cover",
                    "Up to 13 weeks at 100% of insured wages",
                    "Continues payroll for retained staff during the interruption period."),
            },
            Exclusions: new[]
            {
                new PolicyExclusion("BX1", "Deliberate or unlawful acts",
                    "Loss caused by a deliberate act of the insured is not covered."),
                new PolicyExclusion("BX2", "Cyber events",
                    "Damage to data or losses arising solely from cyber events are not covered under this property pack."),
            },
            Conditions: new[]
            {
                new PolicyCondition("BC1", "Fire-safety compliance",
                    "Commercial kitchens must hold a current annual exhaust-hood and ducting clean-down certificate. Failure to maintain may reduce the claim."),
                new PolicyCondition("BC2", "BI waiting period",
                    "Business interruption benefits begin 24 hours after the property loss event."),
                new PolicyCondition("BC3", "Notify the insurer",
                    "Notify Zava of any incident as soon as reasonably practicable."),
            }),

        // LIFE — Mei-Ling Chen / Robert Chen (beneficiary)
        new PolicyDocument(
            PolicyNumber: "LIFE-19042",
            ProductName: "Zava Term Life — Level Cover",
            PolicyHolder: "Mei-Ling Chen (insured) — Robert Chen (named beneficiary)",
            EffectiveFrom: "2009-03-01",
            EffectiveTo: "2034-02-28",
            SumInsured: "AUD 250,000 lump-sum death benefit",
            Excess: "Not applicable",
            SchedulePreamble:
                "Pays the sum insured to the named beneficiary on the death of " +
                "the insured during the term of the policy, subject to the " +
                "conditions and exclusions of the wording.",
            Entitlements: new[]
            {
                new PolicyEntitlement("L1.1", "Death benefit",
                    "AUD 250,000 lump sum",
                    "Single lump-sum payment to the named beneficiary upon the death of the insured."),
                new PolicyEntitlement("L1.4", "Worldwide cover",
                    "24/7 worldwide",
                    "Cover applies anywhere in the world, with no geographical restriction."),
            },
            Exclusions: new[]
            {
                new PolicyExclusion("LX1", "Suicide within 13 months",
                    "No benefit is payable where death is by suicide within 13 months of the policy commencement or last reinstatement."),
                new PolicyExclusion("LX2", "Material non-disclosure",
                    "The insurer may decline or reduce the benefit where there has been material non-disclosure at underwriting."),
            },
            Conditions: new[]
            {
                new PolicyCondition("LC1", "Final death certificate",
                    "An original death certificate issued by the relevant Births, Deaths and Marriages registry is required to release the benefit. An interim hospital certificate is acceptable for opening the claim only."),
                new PolicyCondition("LC2", "Beneficiary identity",
                    "The claimant must provide certified photo identification matching the named beneficiary on the policy."),
                new PolicyCondition("LC3", "Bank account details",
                    "Verified bank account details for the beneficiary are required before settlement can be released."),
            }),
    };

    // ── Per-claim assessment reports ───────────────────────────────────────

    private static AssessmentReport MotorReport(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.Approve,
        RecommendationLabel: "Approve",
        RecommendationReason:
            "Comprehensive policy is in force, the loss is a covered peril (accidental damage in a third-party-at-fault collision), " +
            "no exclusions apply and the evidence on file is sufficient. Settle repair costs less the AUD 700 standard excess and " +
            "book a hire car under M2.2 while the vehicle is being repaired.",
        SettlementPosition:
            "Approve repair of bumper, tailgate and any boot-floor deformation identified by the assessor. Apply AUD 700 excess. " +
            "Authorise hire car for up to 14 days under entitlement M2.2.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Pass,
                "MOTOR-77881 is active from 2025-09-01 to 2026-08-31; date of loss 2026-05-05 is within term.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered peril",
                ChecklistStatus.Pass,
                "Rear-end collision is accidental damage to the insured vehicle, expressly covered under entitlement M1.1.",
                "M1.1"),
            new AssessmentChecklistItem("third-party", "Third-party fault confirmed",
                ChecklistStatus.Pass,
                "Other driver (NRMA insured) admitted fault at the scene; details exchanged. Hire-car benefit M2.2 is therefore engaged.",
                "M2.2"),
            new AssessmentChecklistItem("no-exclusion", "No policy exclusion engaged",
                ChecklistStatus.Pass,
                "Policyholder is licensed, vehicle was being driven legally, damage is sudden — exclusions MX1/MX2 do not apply.",
                "MX1, MX2"),
            new AssessmentChecklistItem("notification", "Notified within required period",
                ChecklistStatus.Pass,
                "Reported the day after the incident, well inside the 30-day notification window.",
                "MC1"),
            new AssessmentChecklistItem("evidence", "Evidence sufficient",
                ChecklistStatus.Pass,
                "Six photos of damage and the other driver's licence + insurer details are on file. Drivable; assessor can confirm boot-floor on inspection.",
                "Evidence"),
            new AssessmentChecklistItem("excess", "Standard excess applied",
                ChecklistStatus.Info,
                "AUD 700 excess deducted from settlement. Customer is informed and acknowledged in intake form.",
                "MC2"),
        });

    private static AssessmentReport TravelReport(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.PartialApprove,
        RecommendationLabel: "Partial Approve",
        RecommendationReason:
            "Travel policy is in force, baggage cover is engaged and the carrier PIR confirms the bag is permanently lost. " +
            "However, condition TC2 requires proof of ownership/value for items claimed and most original contents have no " +
            "receipts. Approve the documented items (replacement clothing, prescription medication and suitcase) and request " +
            "supporting evidence (photos, bank statements) for the remainder before extending settlement.",
        SettlementPosition:
            "Approve replacement clothing receipts, prescription medication (T4.1, AUD 180) and suitcase (~AUD 350). " +
            "Hold remaining ~AUD 1,200 of undocumented contents pending TC2 proof of ownership. Apply AUD 100 excess.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Pass,
                "TRVL-58220 covers travel from 2026-04-28 to 2026-05-26; date of loss 2026-05-05 is within term.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered peril",
                ChecklistStatus.Pass,
                "Permanently delayed checked baggage declared lost after 72 hours falls under entitlement T2.1.",
                "T2.1"),
            new AssessmentChecklistItem("pir", "Carrier PIR provided",
                ChecklistStatus.Pass,
                "Singapore Airlines PIR SQ-FCO-2605-1184 attached and bag declared lost — TC1 satisfied.",
                "TC1"),
            new AssessmentChecklistItem("medication", "Replacement medication covered",
                ChecklistStatus.Pass,
                "AUD 180 replacement prescription cost is documented and within the AUD 500 sub-limit under T4.1.",
                "T4.1"),
            new AssessmentChecklistItem("ownership", "Proof of ownership for all items",
                ChecklistStatus.Fail,
                "Receipts only available for replacement clothing and medication. Original contents (~AUD 1,200) have no receipts, " +
                "bank statements or photographs to satisfy TC2.",
                "TC2"),
            new AssessmentChecklistItem("sub-limit", "Single-item sub-limit checked",
                ChecklistStatus.Pass,
                "No declared item exceeds the AUD 750 single-item limit. Aggregate claim AUD 2,800 is within the AUD 3,000 baggage limit.",
                "T2.1a"),
            new AssessmentChecklistItem("excluded-items", "No excluded items in claim",
                ChecklistStatus.Pass,
                "No cash, passports or unattended-item losses claimed — exclusions TX1/TX2 do not apply.",
                "TX1, TX2"),
            new AssessmentChecklistItem("excess", "Excess applied",
                ChecklistStatus.Info,
                "AUD 100 per-claim excess will be deducted from the approved portion.",
                "Schedule"),
        });

    private static AssessmentReport HomeReport(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.Approve,
        RecommendationLabel: "Approve",
        RecommendationReason:
            "Home & Contents policy is in force, sudden escape of liquid is a covered peril under H1.3, and the customer took " +
            "reasonable steps by isolating the supply with an after-hours plumber. Approve building/contents repairs and the " +
            "make-safe call-out, less the AUD 500 excess. Flag temporary-accommodation cover (H1.7) is available if the family " +
            "needs to relocate while repairs are scheduled.",
        SettlementPosition:
            "Approve cabinet, flooring and dishwasher reinstatement under H1.3 and after-hours plumber call-out under H2.4. " +
            "Apply AUD 500 excess. Offer temporary accommodation under H1.7 if cooking/habitability becomes unworkable.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Pass,
                "HOME-44219 covers 2025-11-15 to 2026-11-14; date of loss 2026-05-05 is within term.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered peril",
                ChecklistStatus.Pass,
                "Sudden burst of a fixed cold-water supply pipe is escape of liquid under H1.3.",
                "H1.3"),
            new AssessmentChecklistItem("sudden-not-gradual", "Sudden, not gradual leak",
                ChecklistStatus.Pass,
                "Compression joint failed overnight and was discovered immediately — not a slow weep over time, so HX1 does not apply.",
                "HX1"),
            new AssessmentChecklistItem("reasonable-steps", "Reasonable steps taken",
                ChecklistStatus.Pass,
                "After-hours plumber attended at ~05:00 and isolated the supply, satisfying condition HC1.",
                "HC1"),
            new AssessmentChecklistItem("make-safe", "Make-safe repair within limit",
                ChecklistStatus.Pass,
                "Plumber call-out invoice attached; well below the AUD 5,000 H2.4 sub-limit.",
                "H2.4"),
            new AssessmentChecklistItem("evidence", "Evidence sufficient",
                ChecklistStatus.Pass,
                "Four photos of the leak source and floor damage plus the plumber's invoice support the loss.",
                "Evidence"),
            new AssessmentChecklistItem("temp-accom", "Temporary accommodation considered",
                ChecklistStatus.Info,
                "Family currently cooking on a camping stove with two young children. Habitability OK for now; offer H1.7 if conditions deteriorate.",
                "H1.7"),
            new AssessmentChecklistItem("excess", "Standard excess applied",
                ChecklistStatus.Info,
                "AUD 500 excess deducted from settlement under HC2.",
                "HC2"),
        });

    private static AssessmentReport BusinessReport(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.PartialApprove,
        RecommendationLabel: "Partial Approve — pending compliance",
        RecommendationReason:
            "Property and business-interruption cover are both in force and the loss is a covered fire/smoke event under B1.1 / B2.1. " +
            "However condition BC1 requires a current annual exhaust-hood clean-down certificate for commercial kitchens, and that " +
            "documentation has not yet been produced. Approve emergency make-safe and BI cover from the 24-hour waiting period, but " +
            "hold final property settlement until the maintenance certificate is provided — the insurer may reduce the claim if BC1 " +
            "is not satisfied.",
        SettlementPosition:
            "Approve clean-up under B1.5 and BI from hour 24 onward (B2.1 / B2.3, payroll for 4 casuals + 1 chef). " +
            "Hold full property reinstatement under B1.1 until annual exhaust-hood clean-down certificate is supplied. AUD 1,000 property excess applies.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Pass,
                "BIZ-30412 (Property + BI) covers 2026-01-01 to 2026-12-31; date of loss 2026-05-06 is within term.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered peril",
                ChecklistStatus.Pass,
                "Fire and smoke damage from the kitchen exhaust hood is covered under entitlement B1.1.",
                "B1.1"),
            new AssessmentChecklistItem("bi-engaged", "Business interruption engaged",
                ChecklistStatus.Pass,
                "Café closed 2-3 weeks following an insured property loss — B2.1 BI cover is engaged from the 24-hour waiting period.",
                "B2.1"),
            new AssessmentChecklistItem("debris", "Clean-up sub-limit available",
                ChecklistStatus.Pass,
                "Smoke clean-up across front-of-house falls within the AUD 25,000 B1.5 sub-limit.",
                "B1.5"),
            new AssessmentChecklistItem("fire-safety", "Annual exhaust-hood clean-down certificate",
                ChecklistStatus.Fail,
                "BC1 requires a current annual clean-down certificate for commercial kitchens. None on file. " +
                "Insurer may reduce the claim if maintenance was deficient — hold final settlement pending evidence.",
                "BC1"),
            new AssessmentChecklistItem("no-exclusion", "No exclusion engaged",
                ChecklistStatus.Pass,
                "MFB confirmed an electrical fault — not a deliberate or cyber event, so BX1/BX2 do not apply.",
                "BX1, BX2"),
            new AssessmentChecklistItem("notification", "Notified promptly",
                ChecklistStatus.Pass,
                "Lodged within hours of the event, satisfying BC3.",
                "BC3"),
            new AssessmentChecklistItem("waiting-period", "BI waiting period",
                ChecklistStatus.Info,
                "First 24 hours of business interruption are excluded by BC2; BI benefits accrue from hour 25 onward.",
                "BC2"),
            new AssessmentChecklistItem("excess", "Property excess applied",
                ChecklistStatus.Info,
                "AUD 1,000 property excess deducted from settlement.",
                "Schedule"),
        });

    private static AssessmentReport LifeReport(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.Decline,
        RecommendationLabel: "Decline — pending required documents",
        RecommendationReason:
            "The policy is in force, the claimant is the named beneficiary and the loss is the death of the insured — all of which " +
            "would normally support payment of the AUD 250,000 death benefit. However, conditions LC1 (final BDM death certificate) " +
            "and LC3 (verified beneficiary bank details) have not been satisfied. The interim hospital certificate is acceptable for " +
            "opening the claim only. Decline the current submission with empathy and a clear list of outstanding documents; the " +
            "claim can be re-lodged and approved as soon as those documents are received.",
        SettlementPosition:
            "Hold settlement of AUD 250,000 sum insured. Re-open and approve once the final BDM death certificate and verified " +
            "bank details are provided. Cara to send a sensitive plain-English letter explaining the next step.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Pass,
                "LIFE-19042 has been in force since 2009-03-01 and remains active to 2034-02-28; date of death 2026-05-02 is within term.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered event",
                ChecklistStatus.Pass,
                "Death of the insured during the policy term triggers the L1.1 lump-sum death benefit.",
                "L1.1"),
            new AssessmentChecklistItem("beneficiary", "Claimant is the named beneficiary",
                ChecklistStatus.Pass,
                "Robert Chen is the sole named beneficiary on the policy and provided certified driver-licence ID — LC2 satisfied.",
                "LC2"),
            new AssessmentChecklistItem("interim-cert", "Interim certificate received",
                ChecklistStatus.Info,
                "Hospital interim death certificate accepted for opening the claim only. Does not satisfy LC1.",
                "LC1"),
            new AssessmentChecklistItem("final-cert", "Final BDM death certificate provided",
                ChecklistStatus.Fail,
                "Final certificate from Births, Deaths and Marriages is required by LC1 to release the benefit. " +
                "Customer indicates BDM certificate is 4-6 weeks away.",
                "LC1"),
            new AssessmentChecklistItem("bank-details", "Verified beneficiary bank details",
                ChecklistStatus.Fail,
                "LC3 requires verified bank account details for the beneficiary before settlement. None on file yet.",
                "LC3"),
            new AssessmentChecklistItem("no-exclusion", "No policy exclusion engaged",
                ChecklistStatus.Pass,
                "Cause of death is natural causes well outside the 13-month suicide window, with no indication of material non-disclosure.",
                "LX1, LX2"),
            new AssessmentChecklistItem("excess", "No excess applies",
                ChecklistStatus.Info,
                "Term Life policies do not carry an excess; the full sum insured is payable subject to LC1/LC3.",
                "Schedule"),
        });

    private static AssessmentReport GenericNeedMoreInfo(IntakeClaimRecord c) => new(
        ClaimNumber: c.ClaimNumber,
        PolicyNumber: c.PolicyNumber,
        Recommendation: AssessmentRecommendation.NeedMoreInfo,
        RecommendationLabel: "Need More Info",
        RecommendationReason:
            "This claim was lodged via the live Claims Intake demo and does not yet have a curated checklist. " +
            "The agent would normally pull the matching policy wording and run the standard pass/fail checks here.",
        SettlementPosition:
            "Hold pending policy lookup, evidence review and excess confirmation.",
        Items: new[]
        {
            new AssessmentChecklistItem("policy-active", "Policy in force on date of loss",
                ChecklistStatus.Info,
                "Pending policy lookup against the live policy administration system.",
                "Schedule"),
            new AssessmentChecklistItem("peril-covered", "Loss is a covered peril",
                ChecklistStatus.Info,
                "Pending coverage analysis against the relevant Schedule of Cover.",
                "Schedule"),
            new AssessmentChecklistItem("evidence", "Evidence sufficient",
                ChecklistStatus.Info,
                "Pending evidence review by the assessor agent.",
                "Evidence"),
        });
}

namespace ZavaClaims.App.Models;

/// <summary>
/// One sample inbound claim email and attached Word claims-form for the
/// Claims Intake demo (the "Try It Out" tab on
/// <c>/agents/claims-intake</c>, rendered by
/// <see cref="ZavaClaims.App.Components.Pages.Agents.ClaimsIntakeDemo"/>).
///
/// Each sample mirrors a customer persona from <c>docs/characters.md</c> so
/// the demo follows the same cast as the rest of the Zava office:
/// Michael (home), Aisha (motor), Tom (business), and Grace (travel).
/// </summary>
public record IntakeSample(
    string Id,
    string Label,
    string ClaimType,
    string CustomerName,
    string CustomerEmail,
    string PolicyNumber,
    string EmailSubject,
    string EmailFrom,
    string EmailDate,
    string EmailBody,
    string FormFileName,
    string FormDocumentText,
    IntakeExtractedFields ExpectedFields,
    string ExpectedUrgency,
    string ExpectedUrgencyReason);

/// <summary>
/// Canonical fields the Claims Intake Agent maps from the email + claim form
/// onto the mock intake web form. Mirrors the "Captured Fields" list in the
/// <see cref="ZavaClaims.Agents.ClaimsIntakeAgent"/> instructions.
/// </summary>
public record IntakeExtractedFields(
    string CustomerName,
    string CustomerEmail,
    string CustomerPhone,
    string PolicyNumber,
    string ClaimType,
    string IncidentDate,
    string IncidentLocation,
    string IncidentDescription,
    string EstimatedLoss,
    string PreferredContact);

/// <summary>
/// Static catalogue of the four sample emails used by the intake demo.
/// Kept server-side so a single C# definition drives both the listing API
/// and the deterministic "fallback" extraction returned to the page.
/// </summary>
public static class IntakeSampleCatalog
{
    public static IReadOnlyList<IntakeSample> All { get; } = Build();

    public static IntakeSample? FindById(string id) =>
        All.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<IntakeSample> Build() => new[]
    {
        // ── 1. Michael Harris — Home / burst pipe ───────────────────────────
        new IntakeSample(
            Id: "home-burst-pipe",
            Label: "Home — Burst pipe (Michael Harris)",
            ClaimType: "Home — Escape of liquid",
            CustomerName: "Michael Harris",
            CustomerEmail: "michael.harris@example.com",
            PolicyNumber: "HOME-44219",
            EmailSubject: "Burst pipe — kitchen flooded overnight",
            EmailFrom: "Michael Harris <michael.harris@example.com>",
            EmailDate: "Mon, 5 May 2026 07:42",
            EmailBody:
                "Hi Zava team,\n\n" +
                "We had a burst pipe under the kitchen sink overnight and the " +
                "kitchen is flooded. The cabinets and timber floor are soaked, " +
                "and we can't really use the kitchen — we're cooking on a camping " +
                "stove. A plumber came at 5am and capped the line.\n\n" +
                "I've attached the completed claim form. Please let me know what " +
                "else you need and how soon repairs can start. We have two young " +
                "kids so a quick answer would mean a lot.\n\n" +
                "Thanks,\nMichael Harris\nPolicy HOME-44219\nMobile 0412 555 014\n" +
                "Attachment: Zava-Claim-Form-HOME-44219.docx",
            FormFileName: "Zava-Claim-Form-HOME-44219.docx",
            FormDocumentText:
                "ZAVA INSURANCE — HOME CLAIM FORM\n" +
                "================================\n\n" +
                "Policy holder: Michael Harris\n" +
                "Policy number: HOME-44219\n" +
                "Email: michael.harris@example.com\n" +
                "Mobile: 0412 555 014\n" +
                "Preferred contact: Email\n\n" +
                "Incident date: 2026-05-05\n" +
                "Incident time: ~02:00 (discovered 05:30)\n" +
                "Incident location: 18 Banksia Street, Hawthorn VIC 3122\n\n" +
                "Type of loss: Escape of liquid (burst water supply pipe)\n\n" +
                "Description of incident:\n" +
                "Cold-water supply pipe under the kitchen sink failed at the " +
                "compression joint overnight. Water pooled across the kitchen " +
                "floor and into the adjoining dining area. Plumber attended at " +
                "approx. 05:00 and isolated the supply.\n\n" +
                "Damaged property:\n" +
                "- Lower kitchen cabinets (water-logged carcass and kickboards)\n" +
                "- Engineered timber flooring across kitchen and dining (~22 m^2)\n" +
                "- Dishwasher (was on at time of discovery)\n\n" +
                "Estimated loss: AUD 18,500\n\n" +
                "Habitability: Kitchen unusable. Cooking on camping stove.\n" +
                "Temporary accommodation requested: No (yet)\n\n" +
                "Documents attached: 4 photos of the leak source and floor damage; " +
                "after-hours plumber call-out invoice.\n\n" +
                "Signed: Michael Harris    Date: 2026-05-05",
            ExpectedFields: new IntakeExtractedFields(
                CustomerName: "Michael Harris",
                CustomerEmail: "michael.harris@example.com",
                CustomerPhone: "0412 555 014",
                PolicyNumber: "HOME-44219",
                ClaimType: "Home — Escape of liquid",
                IncidentDate: "2026-05-05",
                IncidentLocation: "18 Banksia Street, Hawthorn VIC 3122",
                IncidentDescription:
                    "Burst cold-water pipe under the kitchen sink overnight; cabinets, timber floor and dishwasher water-damaged. Plumber capped the supply.",
                EstimatedLoss: "AUD 18,500",
                PreferredContact: "Email"),
            ExpectedUrgency: "High",
            ExpectedUrgencyReason:
                "Kitchen unusable with two young children at home. Habitability concern — flag for emergency repair / temporary accommodation review."),

        // ── 2. Aisha Khan — Motor / rear-end collision ──────────────────────
        new IntakeSample(
            Id: "motor-rear-end",
            Label: "Motor — Rear-end collision (Aisha Khan)",
            ClaimType: "Motor — Third-party rear-end",
            CustomerName: "Aisha Khan",
            CustomerEmail: "aisha.khan@example.com",
            PolicyNumber: "MOTOR-77881",
            EmailSubject: "Rear-end accident — claim form attached",
            EmailFrom: "Aisha Khan <aisha.khan@example.com>",
            EmailDate: "Tue, 6 May 2026 09:14",
            EmailBody:
                "Hello,\n\n" +
                "I was rear-ended at a traffic light yesterday afternoon. The " +
                "other driver admitted fault and we exchanged details. My rear " +
                "bumper and tailgate are damaged but the car is drivable.\n\n" +
                "I use the car every day for work (community nurse) so I'd " +
                "really like a repairer assigned and a rental sorted as soon " +
                "as possible. Form and bumper photos attached.\n\n" +
                "Regards,\nAisha Khan\nPolicy MOTOR-77881\nMobile 0433 220 901\n" +
                "Attachment: Zava-Claim-Form-MOTOR-77881.docx",
            FormFileName: "Zava-Claim-Form-MOTOR-77881.docx",
            FormDocumentText:
                "ZAVA INSURANCE — MOTOR CLAIM FORM\n" +
                "=================================\n\n" +
                "Policy holder: Aisha Khan\n" +
                "Policy number: MOTOR-77881 (Comprehensive)\n" +
                "Email: aisha.khan@example.com\n" +
                "Mobile: 0433 220 901\n" +
                "Preferred contact: SMS\n\n" +
                "Incident date: 2026-05-05\n" +
                "Incident time: 16:35\n" +
                "Incident location: Cnr Glenferrie Rd & Burwood Rd, Hawthorn VIC\n\n" +
                "Type of loss: Motor vehicle — rear-end collision (third party at fault)\n\n" +
                "Description of incident:\n" +
                "Stationary at red light when struck from behind by a Toyota " +
                "Corolla. Other driver (Daniel Wu, NRMA insured) admitted fault " +
                "at the scene. No injuries. Police not attending; event number " +
                "not issued.\n\n" +
                "Damaged property:\n" +
                "- Rear bumper (cracked, paint transfer)\n" +
                "- Tailgate (mis-aligned, dent)\n" +
                "- Possible boot floor deformation (to be inspected)\n\n" +
                "Estimated loss: AUD 6,200\n" +
                "Vehicle drivable: Yes\n" +
                "Daily-driver: Yes — required for work as a community nurse\n\n" +
                "Documents attached: 6 photos of damage; other driver's licence " +
                "and insurer details.\n\n" +
                "Signed: Aisha Khan    Date: 2026-05-06",
            ExpectedFields: new IntakeExtractedFields(
                CustomerName: "Aisha Khan",
                CustomerEmail: "aisha.khan@example.com",
                CustomerPhone: "0433 220 901",
                PolicyNumber: "MOTOR-77881",
                ClaimType: "Motor — Third-party rear-end",
                IncidentDate: "2026-05-05",
                IncidentLocation: "Cnr Glenferrie Rd & Burwood Rd, Hawthorn VIC",
                IncidentDescription:
                    "Stationary at a red light when rear-ended by a third-party Toyota Corolla; other driver admitted fault. Bumper and tailgate damage; vehicle drivable.",
                EstimatedLoss: "AUD 6,200",
                PreferredContact: "SMS"),
            ExpectedUrgency: "Medium",
            ExpectedUrgencyReason:
                "Customer relies on the vehicle daily for work (community nurse). Prioritise a rental car booking with the Supplier Coordinator. No vulnerability flags."),

        // ── 3. Tom — Small business / café smoke damage ─────────────────────
        new IntakeSample(
            Id: "business-smoke",
            Label: "Business — Café smoke damage (Tom Bennett)",
            ClaimType: "Business — Fire / smoke damage with business interruption",
            CustomerName: "Tom Bennett",
            CustomerEmail: "tom@bluebirdcafe.example.com",
            PolicyNumber: "BIZ-30412",
            EmailSubject: "Urgent — café fire, claim form attached",
            EmailFrom: "Tom Bennett <tom@bluebirdcafe.example.com>",
            EmailDate: "Wed, 7 May 2026 06:58",
            EmailBody:
                "Hi Zava,\n\n" +
                "There was an electrical fire in our café kitchen last night. " +
                "Fire brigade attended and put it out quickly but we have " +
                "significant smoke damage throughout the front of house and " +
                "the kitchen ceiling. We're closed today and likely the rest " +
                "of the week.\n\n" +
                "I need to lodge a claim for the property damage AND for " +
                "business interruption — every day closed is lost revenue " +
                "and I have four staff on the roster. Claim form attached.\n\n" +
                "Please call me as soon as you can.\n\n" +
                "Tom Bennett\nOwner, Bluebird Café\nPolicy BIZ-30412\n" +
                "Mobile 0408 712 305\n" +
                "Attachment: Zava-Claim-Form-BIZ-30412.docx",
            FormFileName: "Zava-Claim-Form-BIZ-30412.docx",
            FormDocumentText:
                "ZAVA INSURANCE — BUSINESS CLAIM FORM\n" +
                "====================================\n\n" +
                "Business name: Bluebird Café Pty Ltd\n" +
                "Trading address: 42 Lygon Street, Carlton VIC 3053\n" +
                "Policy holder: Tom Bennett (director)\n" +
                "Policy number: BIZ-30412 (Property + Business Interruption)\n" +
                "Email: tom@bluebirdcafe.example.com\n" +
                "Mobile: 0408 712 305\n" +
                "Preferred contact: Phone\n\n" +
                "Incident date: 2026-05-06\n" +
                "Incident time: ~22:40 (after close)\n" +
                "Incident location: 42 Lygon Street, Carlton VIC 3053\n\n" +
                "Type of loss: Fire / smoke damage; consequential business " +
                "interruption.\n\n" +
                "Description of incident:\n" +
                "Electrical fault in the kitchen exhaust hood ignited grease " +
                "deposits after close. Metropolitan Fire Brigade attended " +
                "(MFB event 26-118432) and extinguished within 15 minutes.\n\n" +
                "Damaged property:\n" +
                "- Exhaust hood and ducting (destroyed)\n" +
                "- Kitchen ceiling and tiling (smoke + water damage)\n" +
                "- Front-of-house: walls, soft furnishings, stock (smoke odour)\n" +
                "- Point-of-sale system possibly affected\n\n" +
                "Estimated property loss: AUD 95,000\n" +
                "Estimated weekly revenue: AUD 22,000\n" +
                "Expected closure: 2-3 weeks\n" +
                "Staff impacted: 4 casual + 1 chef\n\n" +
                "Documents attached: 12 photos; MFB event number; trading " +
                "P&L for the last 6 months.\n\n" +
                "Signed: Tom Bennett    Date: 2026-05-07",
            ExpectedFields: new IntakeExtractedFields(
                CustomerName: "Tom Bennett",
                CustomerEmail: "tom@bluebirdcafe.example.com",
                CustomerPhone: "0408 712 305",
                PolicyNumber: "BIZ-30412",
                ClaimType: "Business — Fire / smoke damage with business interruption",
                IncidentDate: "2026-05-06",
                IncidentLocation: "42 Lygon Street, Carlton VIC 3053",
                IncidentDescription:
                    "Electrical fire in kitchen exhaust hood after close; smoke and water damage front-of-house and kitchen. Café closed; 4 casuals + 1 chef impacted.",
                EstimatedLoss: "AUD 95,000",
                PreferredContact: "Phone"),
            ExpectedUrgency: "High",
            ExpectedUrgencyReason:
                "Active business interruption — every closed day is lost revenue and staff income. Fast-track to Loss Adjuster and Supplier Coordinator; offer interim BI advance."),

        // ── 4. Grace — Travel / lost luggage abroad ─────────────────────────
        new IntakeSample(
            Id: "travel-lost-luggage",
            Label: "Travel — Lost luggage overseas (Grace Liu)",
            ClaimType: "Travel — Lost / delayed baggage",
            CustomerName: "Grace Liu",
            CustomerEmail: "grace.liu@example.com",
            PolicyNumber: "TRVL-58220",
            EmailSubject: "Lost luggage in Rome — claim form attached",
            EmailFrom: "Grace Liu <grace.liu@example.com>",
            EmailDate: "Thu, 8 May 2026 03:21",
            EmailBody:
                "Hello,\n\n" +
                "I'm writing from Rome — my checked bag never arrived after my " +
                "Singapore Airlines flight from Singapore. The airline issued " +
                "a Property Irregularity Report and after 72 hours have now " +
                "officially declared the bag lost.\n\n" +
                "I had to buy clothes, toiletries and replacement medication " +
                "(I take a daily prescription). I don't have receipts for " +
                "everything that was inside the original bag — most of it I " +
                "bought years ago. Hoping you can guide me on what's " +
                "acceptable.\n\n" +
                "I've filled in your travel claim form and attached it along " +
                "with the airline PIR and the receipts I do have.\n\n" +
                "Thanks,\nGrace Liu\nPolicy TRVL-58220\n" +
                "WhatsApp +61 421 880 117\n" +
                "Attachment: Zava-Claim-Form-TRVL-58220.docx",
            FormFileName: "Zava-Claim-Form-TRVL-58220.docx",
            FormDocumentText:
                "ZAVA INSURANCE — TRAVEL CLAIM FORM\n" +
                "==================================\n\n" +
                "Policy holder: Grace Liu\n" +
                "Policy number: TRVL-58220 (International, single-trip)\n" +
                "Email: grace.liu@example.com\n" +
                "Phone / WhatsApp: +61 421 880 117\n" +
                "Preferred contact: Email (currently in Italy, GMT+2)\n\n" +
                "Incident date: 2026-05-05 (bag missing on arrival; declared " +
                "lost 2026-05-08)\n" +
                "Incident location: Aeroporto di Roma–Fiumicino (FCO)\n\n" +
                "Type of loss: Lost / delayed checked baggage\n\n" +
                "Description of incident:\n" +
                "Checked bag tagged through on Singapore Airlines flight " +
                "SQ-358 (SIN-FCO) on 5 May. Bag never arrived on the carousel. " +
                "Airline PIR reference SQ-FCO-2605-1184 raised at the airport. " +
                "After 72 hours the airline confirmed the bag is unrecoverable.\n\n" +
                "Lost contents (estimated):\n" +
                "- Clothing and shoes (~AUD 1,800)\n" +
                "- Toiletries and cosmetics (~AUD 250)\n" +
                "- Prescription medication (replacement AUD 180)\n" +
                "- Travel adapter, hairdryer, small items (~AUD 220)\n" +
                "- Suitcase itself (~AUD 350)\n" +
                "Receipts available for: replacement clothing, medication.\n" +
                "Receipts NOT available for: most original contents.\n\n" +
                "Estimated loss: AUD 2,800\n" +
                "Medical impact: Yes — needed to source replacement " +
                "prescription medication.\n\n" +
                "Documents attached: airline PIR, replacement-purchase receipts, " +
                "boarding pass.\n\n" +
                "Signed: Grace Liu    Date: 2026-05-08",
            ExpectedFields: new IntakeExtractedFields(
                CustomerName: "Grace Liu",
                CustomerEmail: "grace.liu@example.com",
                CustomerPhone: "+61 421 880 117",
                PolicyNumber: "TRVL-58220",
                ClaimType: "Travel — Lost / delayed baggage",
                IncidentDate: "2026-05-05",
                IncidentLocation: "Aeroporto di Roma–Fiumicino (FCO)",
                IncidentDescription:
                    "Checked bag on SQ-358 (SIN-FCO) never arrived; airline PIR raised and bag declared lost after 72 hours. Customer purchasing replacement essentials including prescription medication.",
                EstimatedLoss: "AUD 2,800",
                PreferredContact: "Email"),
            ExpectedUrgency: "Medium",
            ExpectedUrgencyReason:
                "Customer is overseas and has had to source replacement prescription medication. Provide a same-day acknowledgement and a clear receipts checklist; consider an interim essentials advance.")
    };
}

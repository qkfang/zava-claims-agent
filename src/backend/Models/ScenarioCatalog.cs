namespace ZavaClaims.App.Models;

/// <summary>
/// One step in a scripted claim-journey scenario. Each step is owned by a
/// specific AI agent in the office and lists the actions that agent carries
/// out at that stage of the journey.
/// </summary>
public record ScenarioStep(
    int Number,
    string Title,
    string AgentName,
    string AgentIcon,
    string Summary,
    IReadOnlyList<string> Actions);

/// <summary>
/// Lightweight metadata for one of the five scripted Zava Insurance demo
/// scenarios. The detailed page content is hand-written in
/// <c>Components/Pages/Scenarios/&lt;Scenario&gt;.razor</c>; this catalog
/// powers navigation (NavMenu) and any landing surfaces that need to list
/// the scenarios.
/// </summary>
public record ScenarioDefinition(
    string Id,
    string Number,
    string Title,
    string ShortTitle,
    string Customer,
    string Persona,
    string Tagline,
    string Flavor,
    string Incident,
    IReadOnlyList<string> AgentsFeatured,
    string DemoHighlight,
    IReadOnlyList<ScenarioStep> Steps,
    string Icon,
    string Accent);

/// <summary>
/// Static catalog of the five Zava Insurance demo scenarios. Mirrors the
/// scripts in <c>docs/scenario-1..5</c>. Per-scenario demo pages are static
/// — see <c>Components/Pages/Scenarios/</c>.
/// </summary>
public static class ScenarioCatalog
{
    public static IReadOnlyList<ScenarioDefinition> All { get; } = new[]
    {
        new ScenarioDefinition(
            Id: "motor-collision",
            Number: "1",
            Title: "Motor Collision — Rear-End Accident",
            ShortTitle: "Motor collision",
            Customer: "Aisha Khan",
            Persona: "Aisha Khan — Motor Insurance Customer",
            Tagline: "A fast, supplier-driven motor claim from photo triage to repair and rental.",
            Flavor: "Motor insurance claim where the customer's car has been hit and needs repair. Showcases photo-based damage assessment, supplier (garage) coordination, rental car arrangement, and supplier payment.",
            Incident: "Aisha was stopped at a red light when another driver rear-ended her sedan. The other driver admitted fault at the scene. Her rear bumper is crushed, the boot does not close, and a rear tail light is broken. The car is drivable but unsafe at night.",
            AgentsFeatured: new[]
            {
                "Claims Intake AI Agent",
                "Claims Assessment AI Agent",
                "Loss Adjusting AI Agent (photo triage)",
                "Supplier Coordination AI Agent (garage + rental)",
                "Settlement AI Agent",
                "Customer Communications AI Agent",
            },
            DemoHighlight: "Shows how AI agents collaborate on a fast, supplier-driven motor claim, with photo analysis, repairer assignment, rental coordination, and recovery of excess all visible in a single timeline.",
            Steps: new[]
            {
                new ScenarioStep(
                    Number: 1,
                    Title: "First Notice of Loss",
                    AgentName: "Claims Intake AI Agent",
                    AgentIcon: "📥",
                    Summary: "Aisha lodges through the customer portal on her phone, still standing near the roadside.",
                    Actions: new[]
                    {
                        "Capture policy number, incident date, time, and location.",
                        "Guide a dynamic questionnaire on the other driver, registration, insurer, and police attendance.",
                        "Request photos of the damage, the other vehicle, and the scene.",
                        "Detect that Aisha relies on the car for work and flag the claim as urgent for rental priority.",
                        "Generate a document checklist (licence, other-party details, photos, police event number).",
                        "Open claim CLM-2026-00184 and route it to assessment.",
                    }),
                new ScenarioStep(
                    Number: 2,
                    Title: "Coverage Check",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "📋",
                    Summary: "Confirm the policy responds and recommend the call to the human assessor.",
                    Actions: new[]
                    {
                        "Confirm Comprehensive Motor cover with a $750 excess.",
                        "Check exclusions (unlicensed driver, undisclosed modifications) — none found.",
                        "Match the photos to the described rear-end impact.",
                        "Recommend third-party recovery from the at-fault driver's insurer.",
                        "Produce a structured assessment note: cover confirmed, damage consistent, approve repair, pursue recovery.",
                    }),
                new ScenarioStep(
                    Number: 3,
                    Title: "Photo Damage Triage",
                    AgentName: "Loss Adjusting AI Agent",
                    AgentIcon: "🔍",
                    Summary: "Read the uploaded photos and draft a repair scope.",
                    Actions: new[]
                    {
                        "Tag visible damage: rear bumper (replace), boot panel (repair/replace), right tail light (replace), rear chassis alignment (inspect).",
                        "Produce a draft damage scope and an estimated repair band of $3,800–$5,200.",
                        "Flag that a physical inspection at the repairer is needed to confirm chassis alignment.",
                        "Forward the draft scope to the chosen repairer via Lara.",
                    }),
                new ScenarioStep(
                    Number: 4,
                    Title: "Garage Assignment",
                    AgentName: "Supplier Coordination AI Agent",
                    AgentIcon: "🛠️",
                    Summary: "Assign the right repairer and book a rental car.",
                    Actions: new[]
                    {
                        "Search the preferred repairer network in Aisha's postcode.",
                        "Rank suppliers by availability, cycle time, and quality score.",
                        "Assign Northside Smash Repairs — available next morning, 6-day average cycle.",
                        "Book a rental car through the partnered hire provider for the duration of the repair.",
                        "Send Aisha the repairer address, drop-off time, and rental pickup details by SMS and email.",
                        "Set SLA reminders: quote due in 48 hours, repair completion within 7 days.",
                    }),
                new ScenarioStep(
                    Number: 5,
                    Title: "Repair Quote and Approval",
                    AgentName: "Supplier Coordination + Claims Assessment AI Agents",
                    AgentIcon: "🧾",
                    Summary: "Validate the quote against benchmarks and the approved scope.",
                    Actions: new[]
                    {
                        "Receive the repairer's $4,800 quote.",
                        "Run a cost reasonableness check against benchmarks for the same vehicle and damage pattern.",
                        "Confirm the quote matches the approved scope and authorise the work.",
                    }),
                new ScenarioStep(
                    Number: 6,
                    Title: "Settlement and Payment",
                    AgentName: "Settlement AI Agent",
                    AgentIcon: "💳",
                    Summary: "Pay the repairer transparently against scope and authority.",
                    Actions: new[]
                    {
                        "Match the final invoice to the approved scope and quote.",
                        "Calculate Approved $4,800 − $750 excess = $4,050 payable to the repairer.",
                        "Confirm the payment is within Adam's authority and validate the repairer's bank details.",
                        "Release payment and record a complete audit trail of the calculation.",
                    }),
                new ScenarioStep(
                    Number: 7,
                    Title: "Excess Recovery",
                    AgentName: "Claims Assessment + Settlement AI Agents",
                    AgentIcon: "↩️",
                    Summary: "Pursue the at-fault insurer and refund Aisha's excess once recovered.",
                    Actions: new[]
                    {
                        "Open a third-party recovery sub-task against the at-fault driver's insurer.",
                        "Refund Aisha's $750 excess automatically once recovery completes.",
                    }),
                new ScenarioStep(
                    Number: 8,
                    Title: "Customer Communications",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Keep Aisha informed in plain English at every step.",
                    Actions: new[]
                    {
                        "Send a confirmation SMS at lodgement with the claim number.",
                        "Send a daily status update during repair.",
                        "Draft a plain-English explanation when third-party recovery begins.",
                        "Send a final closure email with the repairer invoice, settlement summary, and feedback link.",
                    }),
            },
            Icon: "🚗",
            Accent: "#0ea5e9"),

        new ScenarioDefinition(
            Id: "fraud-staged-theft",
            Number: "2",
            Title: "Suspected Fraud — Staged Theft with Fabricated Receipts",
            ShortTitle: "Suspected fraud",
            Customer: "Jordan Pierce",
            Persona: "Jordan Pierce — Contents Insurance Customer (under investigation)",
            Tagline: "An evidence-driven fraud workflow that detects anomalies and produces a defensible decision.",
            Flavor: "A claim that initially looks routine but reveals fabricated documents and inconsistent statements. Showcases the Fraud Investigation AI Agent, anomaly detection, timeline reconstruction, and the careful, evidence-driven path to declining a claim while staying compliant.",
            Incident: "Jordan reports that his apartment was burgled while he was away for the weekend. He says the front door was forced and that a laptop, professional camera, and luxury watch — totalling $11,400 — were taken. He provides receipts and a police event number.",
            AgentsFeatured: new[]
            {
                "Claims Intake AI Agent (duplicate detection, fraud tag)",
                "Claims Assessment AI Agent (escalation, partial-cover analysis)",
                "Fraud Investigation AI Agent (anomaly detection, timeline, risk score, plan)",
                "Claims Team Leader AI Agent (escalation review, approval support)",
                "Customer Communications AI Agent (compliant decline letter)",
            },
            DemoHighlight: "Shows how AI agents support a careful, evidence-driven fraud workflow — detecting anomalies early, reconstructing the timeline, recommending investigation steps, and producing a defensible decision without replacing human judgement.",
            Steps: new[]
            {
                new ScenarioStep(
                    Number: 1,
                    Title: "First Notice of Loss",
                    AgentName: "Claims Intake AI Agent",
                    AgentIcon: "📥",
                    Summary: "Capture the report and surface early fraud indicators.",
                    Actions: new[]
                    {
                        "Capture incident details, police event number, and the list of stolen items.",
                        "Request proof of ownership: receipts, photographs, and serial numbers.",
                        "Run duplicate detection and note a similar prior contents claim at another insurer.",
                        "Flag the claim as 'review for fraud indicators' based on policy age (6 weeks) and high claim value.",
                        "Open claim CLM-2026-00219 and route to assessment with a fraud-review tag.",
                    }),
                new ScenarioStep(
                    Number: 2,
                    Title: "Coverage Check",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "📋",
                    Summary: "Confirm cover is technically in place but escalate inconsistencies.",
                    Actions: new[]
                    {
                        "Confirm contents cover, theft included, and a sufficient limit.",
                        "Note that the watch ($6,200) exceeds the unspecified valuables sub-limit and was not itemised.",
                        "Note that one receipt has a date after the reported incident date.",
                        "Recommend at most partial cover for the watch and escalate to fraud review.",
                    }),
                new ScenarioStep(
                    Number: 3,
                    Title: "Anomaly Detection",
                    AgentName: "Fraud Investigation AI Agent",
                    AgentIcon: "🛡️",
                    Summary: "Run a structured, explainable fraud review.",
                    Actions: new[]
                    {
                        "Flag policy timing — high-value items endorsed days before the alleged loss.",
                        "Flag document forensics — receipt PDF created 3 days after the burglary.",
                        "Flag image reuse — camera 'proof of ownership' photo matches a public product listing.",
                        "Flag receipt mismatch — watch retailer does not stock that model.",
                        "Flag claim history — two prior contents claims at another insurer in 18 months.",
                        "Flag statement drift between police report and customer's later account.",
                        "Assign a risk score of High, with explainable reasons (no black box).",
                    }),
                new ScenarioStep(
                    Number: 4,
                    Title: "Timeline Reconstruction",
                    AgentName: "Fraud Investigation AI Agent",
                    AgentIcon: "🕒",
                    Summary: "Build a single timeline of the loss, the documents, and the policy.",
                    Actions: new[]
                    {
                        "Assemble a timeline from online lodgement, phone notes, police log, receipt PDF metadata, and policy history.",
                        "Show visually that the receipt was created after the incident.",
                        "Show that valuables were endorsed onto the policy days before the alleged loss.",
                    }),
                new ScenarioStep(
                    Number: 5,
                    Title: "Investigation Plan",
                    AgentName: "Fraud Investigation AI Agent",
                    AgentIcon: "🧪",
                    Summary: "Recommend the next investigation steps for Felix to approve.",
                    Actions: new[]
                    {
                        "Request original receipts and bank or card statements showing purchase.",
                        "Request the watch's serial number and warranty card.",
                        "Contact the named retailer to verify receipt authenticity.",
                        "Arrange a recorded interview with the customer to clarify door vs. window discrepancy.",
                        "Pause settlement until verification completes.",
                    }),
                new ScenarioStep(
                    Number: 6,
                    Title: "Evidence Outcome",
                    AgentName: "Fraud Investigation AI Agent",
                    AgentIcon: "📑",
                    Summary: "Reconcile the verification results with the claim.",
                    Actions: new[]
                    {
                        "Record retailer confirmation that the receipt is not genuine.",
                        "Record that the customer cannot produce supporting bank statements.",
                        "Record the third change to the customer's account of entry during the recorded interview.",
                    }),
                new ScenarioStep(
                    Number: 7,
                    Title: "Decision and Customer Communications",
                    AgentName: "Claims Assessment + Team Leader + Customer Communications AI Agents",
                    AgentIcon: "✉️",
                    Summary: "Produce a defensible decline with compliant, neutral wording.",
                    Actions: new[]
                    {
                        "Prepare a decline recommendation citing fraudulent documents and misrepresentation against the policy fraud clause.",
                        "Approve the decision with full audit trail (Theo, team leader).",
                        "Draft a compliant, neutral decline letter citing specific clauses and verifiable evidence.",
                        "Avoid accusatory language and include the customer's right to complain or seek external review.",
                        "Refer the case to special investigations and log it in the industry fraud register.",
                    }),
            },
            Icon: "🛡️",
            Accent: "#ef4444"),

        new ScenarioDefinition(
            Id: "home-burst-pipe",
            Number: "3",
            Title: "Home Burst Pipe — Urgent Make-Safe and Kitchen Repair",
            ShortTitle: "Home burst pipe",
            Customer: "Michael Harris",
            Persona: "Michael Harris — Home Insurance Customer",
            Tagline: "An urgent home claim with emergency make-safe and proactive customer care.",
            Flavor: "A home insurance claim that needs urgent triage, emergency make-safe, and supplier coordination across a plumber and a builder. Showcases vulnerability awareness, temporary accommodation logic, and proactive customer communication during a stressful event.",
            Incident: "A flexible hose under Michael's kitchen sink burst overnight. By morning the kitchen floor, kickboards, and lower cabinetry are saturated. Water has tracked into the laundry, and the kitchen is unusable. The family cannot prepare meals at home.",
            AgentsFeatured: new[]
            {
                "Claims Intake AI Agent (urgency triage, vulnerability)",
                "Supplier Coordination AI Agent (emergency plumber, drying, builder)",
                "Claims Assessment AI Agent (cover analysis, allowance)",
                "Loss Adjusting AI Agent (inspection brief, scope drafting)",
                "Customer Communications AI Agent (proactive empathetic updates)",
                "Settlement AI Agent (multi-party payments)",
            },
            DemoHighlight: "Shows how AI agents support an urgent home claim end-to-end — dispatching emergency suppliers within minutes, coordinating builders, keeping a stressed family informed, and handling multi-payee settlement cleanly.",
            Steps: new[]
            {
                new ScenarioStep(
                    Number: 1,
                    Title: "First Notice of Loss",
                    AgentName: "Claims Intake AI Agent",
                    AgentIcon: "📥",
                    Summary: "Triage urgency in real time during the hotline call.",
                    Actions: new[]
                    {
                        "Capture incident time, cause (burst flexi hose), affected rooms, and confirm the water has been shut off at the mains.",
                        "Detect keywords like 'two children' and 'water still pooling' — flag urgent and potentially vulnerable household.",
                        "Generate a tailored checklist: photos, plumber's report on the failed hose, list of damaged items.",
                        "Open claim CLM-2026-00307 and create an emergency make-safe task.",
                    }),
                new ScenarioStep(
                    Number: 2,
                    Title: "Emergency Make-Safe",
                    AgentName: "Supplier Coordination AI Agent",
                    AgentIcon: "🛠️",
                    Summary: "Dispatch emergency suppliers within minutes of lodgement.",
                    Actions: new[]
                    {
                        "Assign an after-hours emergency plumber within 30 minutes of lodgement.",
                        "Book a water extraction and drying company for the same day.",
                        "Notify Michael by SMS with plumber name, ETA, and job reference.",
                        "Pre-authorise the make-safe scope up to the policy's emergency limit.",
                    }),
                new ScenarioStep(
                    Number: 3,
                    Title: "Coverage Check",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "📋",
                    Summary: "Confirm the policy responds and the right allowances apply.",
                    Actions: new[]
                    {
                        "Confirm 'sudden and accidental escape of liquid' is covered (gradual leakage is not).",
                        "Read the plumber's report — flexi hose ruptured at the crimp, failure was sudden — supports cover.",
                        "Authorise meal allowance and laundromat costs for up to 14 days instead of temporary accommodation.",
                        "Produce a structured assessment with recommended reserves of $18,000.",
                    }),
                new ScenarioStep(
                    Number: 4,
                    Title: "Damage Scope",
                    AgentName: "Loss Adjusting AI Agent",
                    AgentIcon: "🔍",
                    Summary: "Prepare Lara for the inspection and draft the scope.",
                    Actions: new[]
                    {
                        "Prepare an inspection brief covering background, age of cabinetry, pre-existing rot, and moisture readings.",
                        "Draft a damage scope: lower cabinetry, kickboards, vinyl flooring, repaint, and subfloor check.",
                        "Estimate cost band $14,000–$19,000 based on the photos and notes.",
                    }),
                new ScenarioStep(
                    Number: 5,
                    Title: "Builder Quote and Approval",
                    AgentName: "Supplier Coordination + Claims Assessment AI Agents",
                    AgentIcon: "🧾",
                    Summary: "Validate the builder quote against scope and benchmarks.",
                    Actions: new[]
                    {
                        "Assign an approved builder.",
                        "Receive a $17,200 quote and run a cost reasonableness check against benchmarks.",
                        "Confirm the quote matches scope and authorise the work for an 8 working day schedule.",
                    }),
                new ScenarioStep(
                    Number: 6,
                    Title: "Customer Communications",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Drive proactive, empathetic updates because Michael is stressed.",
                    Actions: new[]
                    {
                        "Send a Day 0 confirmation, plumber dispatched, and meal allowance approved.",
                        "Send Day 1 drying installation, Day 3 builder appointed, Day 5 repair start date confirmed.",
                        "Send daily progress notes from the builder and a Day 14 final inspection booking.",
                        "Adjust tone to be warm and reassuring and avoid jargon.",
                        "Detect a 2-day silence during quoting and prompt a status update before Michael chases.",
                    }),
                new ScenarioStep(
                    Number: 7,
                    Title: "Settlement",
                    AgentName: "Settlement AI Agent",
                    AgentIcon: "💳",
                    Summary: "Settle multiple payees cleanly with one excess applied.",
                    Actions: new[]
                    {
                        "Pay the builder directly: $17,200 − $500 excess = $16,700.",
                        "Pay plumber and drying suppliers directly: $1,650.",
                        "Pay meal allowance to Michael: $420.",
                        "Validate payee details, confirm approval authority, and release payments.",
                    }),
            },
            Icon: "🏠",
            Accent: "#10b981"),

        new ScenarioDefinition(
            Id: "business-fire",
            Number: "4",
            Title: "Small Business Fire — Property Damage and Business Interruption",
            ShortTitle: "Small business fire",
            Customer: "Tom Bradley",
            Persona: "Tom Bradley — Small Business Owner",
            Tagline: "A complex commercial claim with property damage, business interruption, and many suppliers.",
            Flavor: "A complex commercial claim involving property damage, business interruption, and multiple suppliers. Showcases loss adjusting on a complex loss, business income calculation, escalation to a team leader for a high-value settlement, and coordination across electricians, builders, and forensic accountants.",
            Incident: "An overnight electrical fault in the cafe's coffee machine power circuit caused a smoke and small fire incident. The fire brigade attended. The kitchen, espresso bar, and ceiling are smoke-damaged. No one was injured. The cafe must close while the cause is investigated and repairs are made.",
            AgentsFeatured: new[]
            {
                "Claims Intake AI Agent (complex-claim flagging)",
                "Claims Assessment AI Agent (multi-section cover, conditions check)",
                "Loss Adjusting AI Agent (forensic preparation, scope drafting, BI indicative model)",
                "Supplier Coordination AI Agent (multi-trade orchestration)",
                "Claims Team Leader AI Agent (escalation and reserves approval)",
                "Customer Communications AI Agent (weekly updates, plain-English explanations)",
                "Settlement AI Agent (staged payments, audit trail)",
            },
            DemoHighlight: "Shows how AI agents handle a complex commercial claim with property damage, business interruption, and multiple suppliers, while keeping the small business owner informed and supporting the team leader's high-value approvals.",
            Steps: new[]
            {
                new ScenarioStep(
                    Number: 1,
                    Title: "First Notice of Loss",
                    AgentName: "Claims Intake AI Agent",
                    AgentIcon: "📥",
                    Summary: "Capture a complex commercial claim and route to a senior loss adjuster.",
                    Actions: new[]
                    {
                        "Capture incident type (fire/smoke), site address, fire brigade report number, and that the building is not safe to operate.",
                        "Identify two coverage sections: Property Damage and Business Interruption.",
                        "Generate a checklist: fire brigade report, photos, 12 months of P&L, payroll register, stock-loss list.",
                        "Flag the claim as complex / large loss and route to a senior loss adjuster.",
                        "Open claim CLM-2026-00412.",
                    }),
                new ScenarioStep(
                    Number: 2,
                    Title: "Coverage Check",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "📋",
                    Summary: "Read both cover sections and identify policy conditions.",
                    Actions: new[]
                    {
                        "Confirm Property Damage covered for fire and smoke damage.",
                        "Confirm Business Interruption covered with a 30-day waiting period waived for fire.",
                        "Confirm Stock — perishables — covered up to sub-limit.",
                        "Identify an electrical maintenance condition and flag the latest electrical safety certificate must be verified.",
                        "Produce a structured cover note for the loss adjuster.",
                    }),
                new ScenarioStep(
                    Number: 3,
                    Title: "Cause Investigation and Site Visit",
                    AgentName: "Loss Adjusting AI Agent",
                    AgentIcon: "🔍",
                    Summary: "Prepare Lara for forensic work and draft the damage scope.",
                    Actions: new[]
                    {
                        "Prepare a background brief covering cover sections, sub-limits, and policy conditions.",
                        "List key questions: espresso machine service, circuit installer, electrical certificate currency.",
                        "Recommend an independent forensic electrician.",
                        "Categorise damage: smoke staining (clean), ceiling tiles (replace), espresso bar joinery (replace), fridges (test), HVAC ducting (clean and test).",
                        "Draft a damage scope and an estimated band of $95,000–$130,000.",
                        "Flag complex-claim indicators including possible third-party recovery against the espresso machine manufacturer.",
                    }),
                new ScenarioStep(
                    Number: 4,
                    Title: "Supplier Coordination",
                    AgentName: "Supplier Coordination AI Agent",
                    AgentIcon: "🛠️",
                    Summary: "Orchestrate multiple suppliers and track SLAs.",
                    Actions: new[]
                    {
                        "Book a forensic electrician next day to confirm cause.",
                        "Schedule a specialist smoke-cleaning crew for Day 3.",
                        "Engage a commercial builder for ceiling, joinery, and repaint.",
                        "Book a refrigeration technician for Day 2 inspections.",
                        "Engage a forensic accountant to validate the BI loss for Day 5.",
                        "Track SLAs, follow up overdue quotes, and surface a single status board for Lara and Tom.",
                    }),
                new ScenarioStep(
                    Number: 5,
                    Title: "Business Interruption Calculation",
                    AgentName: "Loss Adjusting AI Agent",
                    AgentIcon: "📊",
                    Summary: "Brief the forensic accountant and draft an indicative BI loss.",
                    Actions: new[]
                    {
                        "Pre-prepare a brief for the forensic accountant: 12 months of P&L, payroll, and seasonality notes.",
                        "Draft an indicative BI estimate: $9,200 average weekly gross profit, 6 weeks closure, 4 weeks at 60% capacity reopening.",
                        "Estimate indicative BI loss of ~$70,000 and stock loss of ~$3,800.",
                    }),
                new ScenarioStep(
                    Number: 6,
                    Title: "Reserves and Escalation",
                    AgentName: "Claims Team Leader AI Agent",
                    AgentIcon: "🧭",
                    Summary: "Surface the high-value escalation and approve reserves.",
                    Actions: new[]
                    {
                        "Surface combined estimate: property $120,000 + BI $70,000 + stock $3,800 = ~$193,800.",
                        "Alert Theo: high value above Adam's authority, multiple suppliers, complex BI calculation.",
                        "Recommend reserves and key approval points.",
                        "Capture Theo's approval of reserves and BI methodology in a single review.",
                    }),
                new ScenarioStep(
                    Number: 7,
                    Title: "Customer Communications",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Keep an anxious business owner informed.",
                    Actions: new[]
                    {
                        "Set up weekly written updates and an on-demand portal summary for Tom.",
                        "Translate technical findings into plain English (cause was the espresso circuit, not your responsibility).",
                        "Draft a sensitive note when the reopening date slips by a week due to ceiling material lead time.",
                        "Detect signs of frustration in call notes and prompt a proactive check-in from Theo.",
                    }),
                new ScenarioStep(
                    Number: 8,
                    Title: "Interim Payment and Final Settlement",
                    AgentName: "Settlement AI Agent",
                    AgentIcon: "💳",
                    Summary: "Stage payments transparently with a clean audit trail.",
                    Actions: new[]
                    {
                        "Release Interim payment 1 of $25,000 — emergency clean and stock loss, paid in week 1.",
                        "Release Interim payment 2 of $40,000 — BI advance to cover wages while closed.",
                        "Settle the balance after final invoices and reconciled BI calculation.",
                        "Validate each invoice against the approved scope, apply the policy excess once, and check for duplicate invoices across suppliers.",
                    }),
                new ScenarioStep(
                    Number: 9,
                    Title: "Recovery",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "↩️",
                    Summary: "Pursue third-party recovery from the espresso machine manufacturer.",
                    Actions: new[]
                    {
                        "Open a third-party recovery thread against the espresso machine manufacturer based on the forensic electrician's findings.",
                    }),
            },
            Icon: "🏪",
            Accent: "#f59e0b"),

        new ScenarioDefinition(
            Id: "life-bereavement",
            Number: "5",
            Title: "Life Insurance Bereavement — Compassionate Claim for a Beneficiary",
            ShortTitle: "Life bereavement",
            Customer: "Robert Chen",
            Persona: "Robert Chen — Life Insurance Beneficiary",
            Tagline: "A quiet, kind, and simple claim that protects the customer's dignity.",
            Flavor: "A life insurance claim made by a grieving beneficiary. Showcases empathetic communication, document guidance, sensitive identity verification, and a streamlined, low-friction settlement. The agents stay in the background and make the experience as gentle as possible.",
            Incident: "Robert's mother held a life insurance policy for many years. Robert is the named beneficiary. He is now responsible for lodging the claim, providing documents, and coordinating with the insurer while also managing funeral arrangements and family matters.",
            AgentsFeatured: new[]
            {
                "Customer Communications AI Agent (empathy-first, document guidance, closing letter)",
                "Claims Intake AI Agent (minimal, gentle data capture; sensitive-case flag)",
                "Claims Assessment AI Agent (cover and exclusion check)",
                "Fraud Investigation AI Agent (silent, low-touch verification)",
                "Claims Team Leader AI Agent (one-page approval)",
                "Settlement AI Agent (clean payment with payee verification)",
            },
            DemoHighlight: "Shows how AI agents can make a bereavement claim quiet, kind, and simple. The same agents that drive efficiency in other scenarios here step back, reduce friction, and protect the customer's dignity — proof that AI in claims is not just about speed, but about appropriate care.",
            Steps: new[]
            {
                new ScenarioStep(
                    Number: 1,
                    Title: "First Contact",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Detect a sensitive bereavement call and adjust the experience accordingly.",
                    Actions: new[]
                    {
                        "Detect within the first 30 seconds that the call is a bereavement claim.",
                        "Suggest an empathetic call script and suppress upsell prompts and routine satisfaction surveys.",
                        "Recommend a single point of contact so Robert never has to re-explain his loss.",
                        "Pre-fill a private case note: 'Bereavement claim. Sensitive. Single point of contact.'",
                    }),
                new ScenarioStep(
                    Number: 2,
                    Title: "First Notice of Loss",
                    AgentName: "Claims Intake AI Agent",
                    AgentIcon: "📥",
                    Summary: "Capture only what is essential and tag the claim as sensitive.",
                    Actions: new[]
                    {
                        "Capture policyholder full name, date of birth, date of passing, Robert's relationship, and a safe contact method and time.",
                        "Avoid asking for documents on the call.",
                        "Generate a gentle, one-page checklist (death certificate, photo ID, bank account, short pre-filled form) sent by email and post.",
                        "Flag the claim with a 'sensitive case' tag for all later interactions.",
                        "Open claim CLM-2026-00518.",
                    }),
                new ScenarioStep(
                    Number: 3,
                    Title: "Coverage Check",
                    AgentName: "Claims Assessment AI Agent",
                    AgentIcon: "📋",
                    Summary: "Confirm the policy responds with no exclusions in play.",
                    Actions: new[]
                    {
                        "Confirm the policy was active and premiums paid.",
                        "Confirm the policy was held over the 2-year non-disclosure period — disclosure exclusions do not apply.",
                        "Confirm the cause of death is not within any specific exclusion.",
                        "Identify a straightforward policy with a $250,000 sum insured.",
                        "Pre-prepare an approval recommendation subject to identity and document verification.",
                    }),
                new ScenarioStep(
                    Number: 4,
                    Title: "Document Guidance",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Guide Robert through documents with warmth and patience.",
                    Actions: new[]
                    {
                        "Acknowledge each document upload with a warm, plain-English message.",
                        "Identify an interim death certificate and gently explain that the final certificate will be needed.",
                        "Detect a missing page in the photo ID upload and ask for it gently.",
                        "Draft a short, kind email when there is any silence longer than 3 days.",
                    }),
                new ScenarioStep(
                    Number: 5,
                    Title: "Identity and Probate Check",
                    AgentName: "Fraud Investigation AI Agent",
                    AgentIcon: "🛡️",
                    Summary: "Run silent, low-friction verification.",
                    Actions: new[]
                    {
                        "Verify the death certificate against public registry data.",
                        "Confirm Robert's identity through standard ID verification.",
                        "Confirm Robert is the named beneficiary on the policy (no probate required).",
                        "Assign a Low risk score with explanation — no interview needed.",
                        "Surface a green tick on Felix's queue: 'No further investigation recommended.'",
                    }),
                new ScenarioStep(
                    Number: 6,
                    Title: "Approval",
                    AgentName: "Claims Team Leader AI Agent",
                    AgentIcon: "🧭",
                    Summary: "Bundle the file into a one-page approval brief.",
                    Actions: new[]
                    {
                        "Surface that $250,000 is above Adam's authority.",
                        "Prepare Theo a one-page approval brief: cover, beneficiary, identity check, fraud review outcome, recommended payment.",
                        "Capture Theo's single-signature approval.",
                    }),
                new ScenarioStep(
                    Number: 7,
                    Title: "Settlement",
                    AgentName: "Settlement AI Agent",
                    AgentIcon: "💳",
                    Summary: "Pay the verified beneficiary with a clean audit trail.",
                    Actions: new[]
                    {
                        "Calculate the payable amount: $250,000 (no excess applies for life cover).",
                        "Validate the payee name matches the verified beneficiary.",
                        "Validate that bank account details have passed account verification.",
                        "Release payment and record a complete audit trail.",
                    }),
                new ScenarioStep(
                    Number: 8,
                    Title: "Closing Communication",
                    AgentName: "Customer Communications AI Agent",
                    AgentIcon: "✉️",
                    Summary: "Close with a sincere, non-templated final letter.",
                    Actions: new[]
                    {
                        "Confirm payment in plain language.",
                        "Acknowledge Robert's loss in a sincere, non-templated tone.",
                        "Provide a single contact point for any further questions.",
                        "Suppress the standard cross-sell and feedback survey for a defined period.",
                    }),
            },
            Icon: "🕊️",
            Accent: "#a855f7"),
    };

    public static ScenarioDefinition? FindById(string id) =>
        All.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.OrdinalIgnoreCase));
}

namespace ZavaClaims.App.Models;

/// <summary>
/// One step the agent performs while working a specific customer scenario.
/// Each step is shown on the agent's page so a viewer can follow along.
/// </summary>
public record AgentAction(string Title, string Detail);

/// <summary>
/// A demo of how a given agent assists with one customer scenario.
/// </summary>
public record ScenarioDemo(
    string ScenarioId,
    string CustomerName,
    string ClaimType,
    string Situation,
    string CustomerQuote,
    string Trigger,
    IReadOnlyList<AgentAction> Actions,
    string Handoff);

/// <summary>
/// An agent definition — role, persona, instruction summary, and per-scenario demos.
/// Mirrors the agents in <c>src/agent/Agents</c>.
/// </summary>
public record AgentDefinition(
    string Id,
    string Name,
    string Department,
    string Persona,
    string Tagline,
    string Purpose,
    IReadOnlyList<string> Responsibilities,
    IReadOnlyList<string> Tools,
    string HumanApproval,
    IReadOnlyList<ScenarioDemo> Scenarios,
    string Icon,
    string Accent);

/// <summary>
/// Static catalog of all eight Zava Insurance agents and their scenario demos.
/// The two scenarios covered are scenario 1 (Michael Harris — home / burst pipe)
/// and scenario 2 (Aisha Khan — motor / rear-end collision), per docs/characters.md.
/// </summary>
public static class AgentCatalog
{
    public static IReadOnlyList<AgentDefinition> All { get; } = Build();

    public static AgentDefinition? FindById(string id) =>
        All.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<AgentDefinition> Build() => new[]
    {
        Intake(),
        Assessment(),
        LossAdjuster(),
        Fraud(),
        Supplier(),
        Settlement(),
        Communications(),
        TeamLeader(),
    };

    // ----- 1. Claims Intake -----
    private static AgentDefinition Intake() => new(
        Id: "claims-intake",
        Name: "Claims Intake Agent",
        Department: "Claims Intake",
        Persona: "Sarah Mitchell — Claims Intake Officer",
        Tagline: "First notice of loss, captured calmly and completely.",
        Purpose: "Watches the customer's email inbox and online claim form, receives the first notice of loss, and creates a structured Claim Case so the rest of the office can pick it up.",
        Responsibilities: new[]
        {
            "Monitor the claims inbox and online form for new customer reports.",
            "Extract incident details, policy number, contact, and uploaded evidence.",
            "Classify the claim type (home, motor, travel, business, life).",
            "Confirm the policy is active and the customer is covered to lodge.",
            "Generate a missing-information checklist and acknowledge the customer.",
        },
        Tools: new[] { "Email & web-form watcher", "Policy lookup", "Customer profile lookup", "Claim creation API", "Duplicate-claim search", "Email/SMS confirmation" },
        HumanApproval: "Not normally required. Escalates if the customer is vulnerable, the policy cannot be found, details are inconsistent, or emergency accommodation is needed.",
        Icon: "📥",
        Accent: "#0ea5e9",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Michael's kitchen was flooded by a burst pipe overnight. His family cannot use the kitchen and he is unsure whether water damage is covered.",
                CustomerQuote: "I just need to know if this is covered and how soon repairs can start.",
                Trigger: "An email lands in claims@zava.example with the subject \"Burst pipe — kitchen flooded\" and three phone photos attached.",
                Actions: new[]
                {
                    new AgentAction("Watch inbox & form", "The agent is subscribed to the claims inbox and online claim form. It detects Michael's new email, parses subject + body, and downloads the attached photos."),
                    new AgentAction("Identify the customer", "Looks up Michael Harris by sender address, finds policy HOME-44219 (active), and pulls his contact preferences."),
                    new AgentAction("Classify & open the claim", "Classifies the claim as \"Home — escape of liquid\", creates Claim Case CLM-10234, and stamps the incident date from the email."),
                    new AgentAction("Build evidence checklist", "Generates the required-document checklist: plumber report, dated photos of the leak source, emergency repair invoice, and proof of ownership for damaged contents."),
                    new AgentAction("Detect urgency", "Flags \"kitchen unusable\" as a habitability concern and asks whether temporary accommodation is needed — sets `human_approval_required=true` for emergency support."),
                    new AgentAction("Acknowledge the customer", "Replies to Michael in plain English with claim number, what happens next, and the checklist — keeping the tone reassuring."),
                },
                Handoff: "Hands the Claim Case CLM-10234 to the Claims Assessment Agent once the plumber report is uploaded."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Aisha's car was hit from behind at a traffic light. She depends on the car for work and wants a repairer assigned and a rental arranged.",
                CustomerQuote: "I use the car every day, so I need to understand the timeline.",
                Trigger: "Aisha submits the online motor claim form and uploads a photo of the rear bumper plus the other driver's details.",
                Actions: new[]
                {
                    new AgentAction("Receive the form", "The agent picks up the new submission from the online form, validates required fields, and stores attachments in the claim folder."),
                    new AgentAction("Identify the customer", "Matches policy MOTOR-77881 (active, comprehensive) to Aisha's email and confirms her preferred contact channel is SMS."),
                    new AgentAction("Classify & open the claim", "Classifies \"Motor — third-party rear-end\", creates Claim Case CLM-10235, captures both drivers' details and the location."),
                    new AgentAction("Build evidence checklist", "Generates the checklist: police event number (if any), photos of all damaged panels, the other driver's insurer, and a repair quote."),
                    new AgentAction("Detect urgency", "Flags \"car needed daily for work\" so the Supplier Coordinator can prioritise a rental. No vulnerability flags raised."),
                    new AgentAction("Acknowledge the customer", "Sends Aisha an SMS + email with the claim number, link to upload further photos, and an indicative timeline."),
                },
                Handoff: "Hands the Claim Case CLM-10235 to the Claims Assessment Agent and pre-notifies the Supplier Coordinator about the rental need."),
        });

    // ----- 2. Claims Assessment -----
    private static AgentDefinition Assessment() => new(
        Id: "claims-assessment",
        Name: "Claims Assessment Agent",
        Department: "Claims Assessment",
        Persona: "Daniel Cho — Claims Assessor",
        Tagline: "Reads the policy, checks the evidence, recommends the call.",
        Purpose: "Reviews the open Claim Case against the policy wording and submitted evidence, identifies coverage and exclusions, and recommends approve / partial / decline for a human to confirm.",
        Responsibilities: new[]
        {
            "Pull the policy wording, limits, and exclusions for the customer.",
            "Compare the incident description and evidence against coverage.",
            "List missing information needed to make a decision.",
            "Draft a plain-English assessment summary citing policy clauses.",
            "Recommend approve, partial approve, or decline.",
        },
        Tools: new[] { "Policy search", "Coverage rules engine", "Document summariser", "Evidence checklist", "Decision-letter draft" },
        HumanApproval: "Required for declines, partial settlements, ambiguous policy wording, high-value claims, or escalations.",
        Icon: "📋",
        Accent: "#6366f1",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Intake has opened CLM-10234. The plumber report and photos are now attached. The agent must decide whether escape-of-liquid cover applies.",
                CustomerQuote: "Please tell me whether you'll cover this — we're cooking on a camping stove.",
                Trigger: "Intake hands off CLM-10234 with all checklist items received.",
                Actions: new[]
                {
                    new AgentAction("Load policy wording", "Pulls Michael's HOME-44219 PDS and locates the \"escape of liquid\" clause and the gradual-damage exclusion."),
                    new AgentAction("Read the evidence", "Summarises the plumber report (\"sudden joint failure on cold-water feed\") and tags photos showing fresh water damage to cabinets and flooring."),
                    new AgentAction("Apply coverage rules", "Confirms cause is sudden, not gradual; cabinets and flooring are insured contents/buildings; contents-cap of $30k applies."),
                    new AgentAction("List missing info", "Flags one gap: dated emergency-repair invoice from the plumber to support the immediate call-out cost."),
                    new AgentAction("Draft assessment summary", "Writes a plain-English recommendation: cover the repair under escape-of-liquid (clause 4.2), excess $750, subject to invoice and final scope from Loss Adjusting."),
                    new AgentAction("Request human approval", "Marks the recommendation `approve-pending-loss-report` and routes it to the Claims Team Leader for sign-off."),
                },
                Handoff: "Routes CLM-10234 to the Loss Adjuster Agent for site inspection; communications drafted by the Customer Communications Agent."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "CLM-10235 is open with photos of bumper damage and the other driver's details.",
                CustomerQuote: "It wasn't my fault — when can repairs start?",
                Trigger: "Intake hands off CLM-10235 with checklist items received.",
                Actions: new[]
                {
                    new AgentAction("Load policy wording", "Pulls Aisha's MOTOR-77881 comprehensive policy, confirms third-party recovery rights, and notes the $500 excess (waived for not-at-fault)."),
                    new AgentAction("Read the evidence", "Summarises the photos as rear-quarter and bumper damage consistent with a low-speed rear-end; checks the other driver's insurer is on file."),
                    new AgentAction("Apply coverage rules", "Confirms not-at-fault rear-end → excess waivable, rental car included for up to 14 days."),
                    new AgentAction("List missing info", "Flags one gap: a workshop quote, which the Supplier Coordinator will obtain."),
                    new AgentAction("Draft assessment summary", "Recommends approve for repair via preferred network, excess waived on receipt of the other insurer's confirmation."),
                    new AgentAction("Request human approval", "Marks the recommendation `approve-standard` and routes to Team Leader; no escalation required."),
                },
                Handoff: "Routes CLM-10235 to the Supplier Coordinator Agent to assign a repairer and rental."),
        });

    // ----- 3. Loss Adjuster -----
    private static AgentDefinition LossAdjuster() => new(
        Id: "loss-adjuster",
        Name: "Loss Adjuster Agent",
        Department: "Loss Adjusting",
        Persona: "Priya Nair — Loss Adjuster",
        Tagline: "On-the-ground investigator for complex or high-value losses.",
        Purpose: "Prepares inspection briefs, reviews damage evidence, and drafts a scope of loss for human loss adjusters to confirm in the field.",
        Responsibilities: new[]
        {
            "Analyse damage photos, plumber/contractor reports, and quotes.",
            "Build an inspection checklist for the human adjuster.",
            "Draft the scope of loss and likely cause.",
            "Compare contractor quotes against cost benchmarks.",
            "Highlight pre-existing damage or underinsurance risks.",
        },
        Tools: new[] { "Image/document analysis", "Inspection checklist generator", "Quote comparison", "Cost benchmark lookup", "Report drafting" },
        HumanApproval: "Required for the final loss report, large-loss findings, disputed cause, underinsurance issues, or safety concerns.",
        Icon: "🔍",
        Accent: "#f59e0b",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Assessment recommended approval pending a loss report. The agent prepares the field visit and draft scope.",
                CustomerQuote: "When will someone actually come and look at the kitchen?",
                Trigger: "Assessment routes CLM-10234 with `loss-review-required=true`.",
                Actions: new[]
                {
                    new AgentAction("Analyse photos", "Tags water staining height, swollen cabinet kicks, and lifted vinyl flooring; flags possible pre-existing swelling on the under-sink cabinet for the human adjuster to verify."),
                    new AgentAction("Build inspection brief", "Generates a checklist: confirm leak point, moisture-meter readings, photograph behind kickboards, check sub-floor, list affected appliances."),
                    new AgentAction("Draft scope of loss", "Drafts a scope: replace 4 base cabinets, 12 m² vinyl flooring, repaint two walls, dry-out 5 days; estimated $4,800 ex-GST."),
                    new AgentAction("Benchmark the quote", "Compares the customer's plumber quote against regional benchmarks; flags it as within the expected band."),
                    new AgentAction("Hand to human adjuster", "Sends Priya the brief and draft scope so she can confirm on site tomorrow at 10:00 AM."),
                },
                Handoff: "Once the human adjuster signs the report, hands back to Assessment / Settlement and to the Supplier Coordinator for repair booking."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Aisha's claim is a standard low-complexity motor loss. The agent typically does NOT run, but provides a quick triage.",
                CustomerQuote: "Just tell me where to take the car.",
                Trigger: "Assessment marks CLM-10235 as standard repair — Loss Adjuster only triages.",
                Actions: new[]
                {
                    new AgentAction("Triage complexity", "Reviews photos and damage value range; classifies the loss as standard (under $10k, single panel area)."),
                    new AgentAction("Skip full inspection", "Recommends bypassing field loss adjusting and going straight to the preferred-repairer assessment."),
                    new AgentAction("Note watch-points", "Notes one watch-point for the repairer: check for hidden boot-floor damage typical of rear-end impacts."),
                },
                Handoff: "Returns CLM-10235 to the Supplier Coordinator with `loss-review=not-required` and the watch-point attached."),
        });

    // ----- 4. Fraud -----
    private static AgentDefinition Fraud() => new(
        Id: "fraud-investigation",
        Name: "Fraud Investigation Agent",
        Department: "Fraud Investigation",
        Persona: "Elena Garcia — Fraud Investigator",
        Tagline: "Quietly checks every claim for inconsistencies — fairly and explainably.",
        Purpose: "Scores the claim for fraud risk, explains every flag in plain English, and recommends investigation steps for a human investigator.",
        Responsibilities: new[]
        {
            "Build a timeline from emails, form data, and documents.",
            "Compare the claim against prior claim history.",
            "Run duplicate-receipt and document-tamper checks.",
            "Produce an explainable risk score with cited indicators.",
            "Recommend next investigation steps — never accuse the customer.",
        },
        Tools: new[] { "Timeline builder", "Document comparison", "Duplicate receipt checker", "Prior claims search", "Risk scoring model" },
        HumanApproval: "Always required before fraud referral, claim delay due to investigation, customer interview, or fraud-based decline.",
        Icon: "🛡️",
        Accent: "#ef4444",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Routine fraud scan on a new home water-damage claim.",
                CustomerQuote: "(no customer interaction at this step)",
                Trigger: "Intake creates CLM-10234 — Fraud Agent runs automatically in the background.",
                Actions: new[]
                {
                    new AgentAction("Build claim timeline", "Aligns the email timestamp, plumber call-out, and photo metadata. All within a 24-hour window — consistent."),
                    new AgentAction("Check prior claims", "Finds one prior claim (storm damage, 2022) for the same policy — closed normally. No pattern."),
                    new AgentAction("Document checks", "Runs duplicate-receipt checks across the network on the plumber's invoice — no duplicates. EXIF data on photos matches the incident date."),
                    new AgentAction("Score risk", "Outputs `fraud_risk_score=0.08` (low) with a one-line explanation and zero indicators."),
                    new AgentAction("Close out silently", "Logs the green result on CLM-10234 — no human action requested."),
                },
                Handoff: "No handoff. Claim continues on the standard path."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Routine fraud scan on a third-party motor claim.",
                CustomerQuote: "(no customer interaction at this step)",
                Trigger: "Intake creates CLM-10235 — Fraud Agent runs automatically in the background.",
                Actions: new[]
                {
                    new AgentAction("Build claim timeline", "Aligns the form submission, photo timestamps, and stated incident time — all consistent."),
                    new AgentAction("Check prior claims", "Finds no prior motor claims on this policy. The other driver's plate is not on the watchlist."),
                    new AgentAction("Document checks", "Verifies the other driver's insurer exists and the policy reference format is valid."),
                    new AgentAction("Score risk", "Outputs `fraud_risk_score=0.05` (low) with no indicators raised."),
                    new AgentAction("Close out silently", "Logs the green result on CLM-10235 — no human action requested."),
                },
                Handoff: "No handoff. Claim continues on the standard path."),
        });

    // ----- 5. Supplier -----
    private static AgentDefinition Supplier() => new(
        Id: "supplier-coordinator",
        Name: "Supplier Coordinator Agent",
        Department: "Supplier Coordination",
        Persona: "James O'Connor — Supplier Coordinator",
        Tagline: "Books the right repairer at the right time and chases overdue jobs.",
        Purpose: "Recommends approved suppliers, schedules inspections and repairs, tracks SLAs, and keeps the claim file updated with supplier status.",
        Responsibilities: new[]
        {
            "Match the loss to a suitable supplier in the customer's area.",
            "Request quotes and book inspection or repair appointments.",
            "Track SLA breaches and chase overdue suppliers.",
            "Compare quotes against the approved scope of loss.",
            "Draft customer-facing booking confirmations.",
        },
        Tools: new[] { "Supplier directory", "Appointment scheduler", "Quote request", "SLA tracker", "Invoice matcher" },
        HumanApproval: "Required for non-preferred supplier, high-cost quotes, supplier disputes, scope variations, or customer complaints about a supplier.",
        Icon: "🛠️",
        Accent: "#10b981",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Loss Adjusting has produced an approved scope. The agent must arrange dry-out and a kitchen builder.",
                CustomerQuote: "How long until I can use my kitchen again?",
                Trigger: "Loss Adjuster signs off the scope on CLM-10234.",
                Actions: new[]
                {
                    new AgentAction("Pick suppliers", "Selects Approved Builder A (kitchens, 12 km away, 4.7 SLA score) and DryFast Restoration for the dry-out, both on Michael's network."),
                    new AgentAction("Request quotes", "Emails both suppliers the scope from Loss Adjusting and asks for quotes within 2 business days."),
                    new AgentAction("Book appointments", "Books the dry-out for tomorrow afternoon and a builder site measure for Tuesday at 10:00 AM."),
                    new AgentAction("Track SLA", "Sets reminders to chase if a quote is not back in 48 hours."),
                    new AgentAction("Update the customer", "Drafts a confirmation email for the Customer Communications Agent: appointment times, supplier names, and what to expect."),
                },
                Handoff: "Once the builder's invoice arrives, hands back to the Settlement Agent."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Assessment approved repair via the preferred motor network and Aisha needs a rental car urgently.",
                CustomerQuote: "I really need a car for work tomorrow.",
                Trigger: "Assessment routes CLM-10235 with `repair-required=true` and `rental-required=true`.",
                Actions: new[]
                {
                    new AgentAction("Pick a repairer", "Selects Smash Repairs Co. (preferred network, 6 km from Aisha's home, 4.8 SLA score, current capacity)."),
                    new AgentAction("Pick a rental", "Books a hatchback from the rental partner for same-day pickup, capped at 14 days per policy."),
                    new AgentAction("Request quote", "Asks Smash Repairs for a written quote and target completion date by tomorrow noon."),
                    new AgentAction("Track SLA", "Sets a reminder to chase the quote in 24 hours; subscribes to status updates from the repairer's portal."),
                    new AgentAction("Update the customer", "Drafts an SMS for the Customer Communications Agent with the rental pickup address, the repairer's phone, and an estimated repair window."),
                },
                Handoff: "Once Smash Repairs uploads the final invoice, hands back to the Settlement Agent."),
        });

    // ----- 6. Settlement -----
    private static AgentDefinition Settlement() => new(
        Id: "settlement",
        Name: "Settlement Agent",
        Department: "Settlement",
        Persona: "Hannah Lee — Settlement Officer",
        Tagline: "Does the maths transparently and prepares the payment.",
        Purpose: "Calculates the payable amount using approved scope, policy limits, excess, depreciation, and prior payments, then prepares the payment and settlement letter for human approval.",
        Responsibilities: new[]
        {
            "Pull approved scope, supplier invoice, and policy limits.",
            "Apply excess, depreciation, sub-limits, and prior payments.",
            "Show the calculation step by step.",
            "Validate payee details and authority limits.",
            "Draft the settlement letter and payment instruction.",
        },
        Tools: new[] { "Settlement calculator", "Authority limit checker", "Invoice matcher", "Settlement letter generator", "Payment API" },
        HumanApproval: "Required for payment release, payee mismatch, high-value settlement, ex-gratia, manual override, or customer dispute.",
        Icon: "💳",
        Accent: "#a855f7",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "The builder has invoiced for the agreed scope. Time to settle.",
                CustomerQuote: "What will I actually be paid, and when?",
                Trigger: "Supplier Coordinator uploads the final invoice to CLM-10234.",
                Actions: new[]
                {
                    new AgentAction("Match invoice to scope", "Matches the builder invoice ($4,800) line-for-line against the Loss Adjuster scope. No variations."),
                    new AgentAction("Apply policy terms", "Applies the $750 escape-of-liquid excess. No depreciation as cabinets are within new-for-old limits. No prior payments."),
                    new AgentAction("Calculate", "Shows: scope $4,800 − excess $750 = payable $4,050."),
                    new AgentAction("Validate payee", "Confirms the builder is the payee per Michael's election; bank account on the supplier directory."),
                    new AgentAction("Authority check", "Settlement amount is below the assessor's authority limit; routes to Team Leader for digital approval rather than full review."),
                    new AgentAction("Draft letter & payment", "Generates the settlement letter and a pending payment instruction; awaits human release."),
                },
                Handoff: "Hands the draft letter to the Customer Communications Agent for sending after approval."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Smash Repairs has completed the work. Time to settle and recover from the third party.",
                CustomerQuote: "Will I be charged anything?",
                Trigger: "Repairer uploads final invoice to CLM-10235.",
                Actions: new[]
                {
                    new AgentAction("Match invoice to scope", "Matches Smash Repairs invoice ($3,200) against the approved repair scope; one minor consumable variation accepted within tolerance."),
                    new AgentAction("Apply policy terms", "Excess waived (not-at-fault confirmed by other insurer). Rental capped at 7 days actual usage at $55/day = $385."),
                    new AgentAction("Calculate", "Shows: repair $3,200 + rental $385 = payable $3,585; customer pays $0."),
                    new AgentAction("Validate payee", "Repairer paid direct; rental partner paid direct. Aisha's bank on file is unused."),
                    new AgentAction("Authority check", "Within standard authority. Routes to Team Leader for digital approval."),
                    new AgentAction("Recovery setup", "Opens a recovery sub-task to chase the at-fault driver's insurer for $3,585."),
                },
                Handoff: "Hands the closure note to the Customer Communications Agent."),
        });

    // ----- 7. Communications -----
    private static AgentDefinition Communications() => new(
        Id: "customer-communications",
        Name: "Customer Communications Agent",
        Department: "Customer Communications",
        Persona: "Olivia Martin — Customer Communications Specialist",
        Tagline: "Plain-English, empathetic updates at every step of the claim.",
        Purpose: "Drafts customer-facing emails, SMS, and call scripts that explain claim status and decisions clearly and empathetically — never inventing facts or making promises.",
        Responsibilities: new[]
        {
            "Generate status updates whenever the claim moves stage.",
            "Translate technical assessment notes into plain English.",
            "Match tone to customer sentiment and situation.",
            "Run a compliance check on every outgoing message.",
            "Provide a call script when a phone follow-up is recommended.",
        },
        Tools: new[] { "Email/SMS drafting", "Tone adjustment", "Plain-English rewriter", "Template library", "Compliance checker" },
        HumanApproval: "Required for declines, complaint responses, sensitive claims, bereavement, and any legal or regulatory wording.",
        Icon: "✉️",
        Accent: "#ec4899",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "Multiple touchpoints across the claim — acknowledgement, inspection booking, settlement.",
                CustomerQuote: "Just keep me informed — I don't want to chase you.",
                Trigger: "Each agent in the workflow asks Communications to send the next update.",
                Actions: new[]
                {
                    new AgentAction("Acknowledgement", "After Intake opens CLM-10234, drafts: \"Hi Michael, we've received your claim and we're sorry to hear about the kitchen flood. Your claim number is CLM-10234. Here's what we'll need from you…\""),
                    new AgentAction("Inspection update", "After Supplier Coordinator books the dry-out and builder, drafts a clear summary of the two appointments and what to expect."),
                    new AgentAction("Approval explanation", "After Assessment recommends approval, drafts a plain-English message: covered under escape-of-liquid, $750 excess, repairs scheduled."),
                    new AgentAction("Settlement letter", "After Settlement calculates $4,050, drafts the settlement letter showing the calculation step by step and the expected payment date."),
                    new AgentAction("Compliance check", "Runs every draft through the compliance checker (no promises of timeline beyond policy, no invented facts) before sending to a human reviewer."),
                },
                Handoff: "All drafts go to the Team Leader Agent for sensitive cases, otherwise to the assessor for a one-click send."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "Aisha is busy and prefers SMS. She wants short, factual updates.",
                CustomerQuote: "Just SMS me when something changes.",
                Trigger: "Each agent in the workflow asks Communications to send the next update.",
                Actions: new[]
                {
                    new AgentAction("Acknowledgement (SMS)", "After Intake opens CLM-10235, drafts: \"Hi Aisha — claim CLM-10235 received. Excess waived (not-at-fault). Repairer + rental being arranged. We'll text again within 4 hours.\""),
                    new AgentAction("Repairer & rental update", "After the Supplier Coordinator books Smash Repairs and the rental, drafts an SMS with rental pickup address and repairer phone."),
                    new AgentAction("Repair-complete update", "When the repair is signed off, drafts a short SMS confirming the car is ready and the rental drop-off."),
                    new AgentAction("Closure note", "After Settlement, drafts: \"All sorted — $0 out of pocket. We'll keep you posted on recovery from the other driver's insurer.\""),
                    new AgentAction("Compliance check", "Runs each SMS through the compliance checker (length, no PII overshare, factual)."),
                },
                Handoff: "Drafts go to the assessor for a one-click send; nothing flagged for Team Leader."),
        });

    // ----- 8. Team Leader -----
    private static AgentDefinition TeamLeader() => new(
        Id: "team-leader",
        Name: "Team Leader Agent",
        Department: "Team Leader Office",
        Persona: "Mark Reynolds — Claims Team Leader",
        Tagline: "Watches the whole floor — escalations, approvals, and SLA.",
        Purpose: "Oversees the workload, approves higher-value items, surfaces escalations and SLA breaches, and keeps quality and consistency across the office.",
        Responsibilities: new[]
        {
            "Maintain a live dashboard of every claim and its current stage.",
            "Surface SLA breaches, vulnerable customers, and complaints.",
            "Receive and digitally approve recommendations from other agents.",
            "Run quality assurance checks on outgoing decisions and messages.",
            "Reassign work when a queue is overloaded.",
        },
        Tools: new[] { "Claims dashboard", "Work queue manager", "Escalation router", "QA checker", "Approval workflow", "Reporting" },
        HumanApproval: "Required for high-value approvals, declines, complaints, policy exceptions, work reassignment rules, or regulatory risk.",
        Icon: "🧭",
        Accent: "#0f172a",
        Scenarios: new[]
        {
            new ScenarioDemo(
                ScenarioId: "1",
                CustomerName: "Michael Harris",
                ClaimType: "Home — burst pipe / kitchen water damage",
                Situation: "CLM-10234 has flagged emergency-accommodation interest and an approval-pending settlement.",
                CustomerQuote: "(no direct customer contact — internal escalation)",
                Trigger: "Intake raises a vulnerability/urgency flag and Settlement asks for approval.",
                Actions: new[]
                {
                    new AgentAction("Surface the case", "Pins CLM-10234 to the dashboard with the urgency flag and a one-line summary."),
                    new AgentAction("Review intake escalation", "Reviews the agent's note about kitchen unusable; recommends Mark approve emergency-accommodation cover under the policy benefit."),
                    new AgentAction("Approve settlement", "Surfaces the Settlement recommendation ($4,050) and the supporting Loss Adjuster scope; recommends Mark click-approve."),
                    new AgentAction("QA the comms drafts", "Runs the Communications drafts through QA — confirms tone is empathetic and decisions are not pre-announced."),
                    new AgentAction("Watch the SLA", "Tracks the 5-day acknowledgement and 30-day decision SLAs; sets an alert at day 3 if no movement."),
                },
                Handoff: "After Mark approves, the Settlement Agent releases payment and the Customer Communications Agent sends the letter."),
            new ScenarioDemo(
                ScenarioId: "2",
                CustomerName: "Aisha Khan",
                ClaimType: "Motor — rear-end collision",
                Situation: "CLM-10235 is a clean, low-complexity claim — Team Leader is in light-touch mode.",
                CustomerQuote: "(no direct customer contact — internal oversight)",
                Trigger: "Settlement asks for digital approval; no flags from Fraud or Loss Adjusting.",
                Actions: new[]
                {
                    new AgentAction("Surface the case", "Pins CLM-10235 to the dashboard as `straight-through-eligible` with no flags."),
                    new AgentAction("Approve settlement", "Surfaces the Settlement recommendation ($3,585 paid to suppliers, $0 customer) for Mark's one-click approval."),
                    new AgentAction("QA the comms drafts", "Confirms the SMS drafts are short, factual, and within the SMS template library."),
                    new AgentAction("Watch the SLA", "Tracks the repair-completion ETA and rental window; sets a reminder near day 13 of the rental."),
                    new AgentAction("Open the recovery", "Confirms the recovery sub-task against the at-fault driver's insurer is in the chase queue."),
                },
                Handoff: "After Mark approves, payments are released and Communications sends the closure SMS."),
        });
}

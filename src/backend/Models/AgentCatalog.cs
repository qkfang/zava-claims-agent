namespace ZavaClaims.App.Models;

/// <summary>
/// Lightweight metadata for one of the eight Zava Insurance agents.
/// The detailed page content is hand-written in
/// <c>Components/Pages/Agents/&lt;Agent&gt;.razor</c>; this catalog only
/// powers navigation (Home, NavMenu) and the chat "references" surface.
/// </summary>
public record AgentDefinition(
    string Id,
    string Name,
    string Department,
    string Persona,
    string Tagline,
    string Purpose,
    IReadOnlyList<string> Responsibilities,
    string Icon,
    string Accent);

/// <summary>
/// Static catalog of all eight Zava Insurance agents. Mirrors the agents in
/// <c>src/agent/Agents</c>. Per-agent demo pages are static — see
/// <c>Components/Pages/Agents/</c>.
/// </summary>
public static class AgentCatalog
{
    public static IReadOnlyList<AgentDefinition> All { get; } = new[]
    {
        new AgentDefinition(
            Id: "claims-intake",
            Name: "Claims Intake Agent",
            Department: "Claims Intake",
            Persona: "Iris — Claims Intake Officer",
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
            Icon: "📥",
            Accent: "#3a5fb0"),

        new AgentDefinition(
            Id: "claims-assessment",
            Name: "Claims Assessment Agent",
            Department: "Claims Assessment",
            Persona: "Adam — Claims Assessor",
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
            Icon: "📋",
            Accent: "#6ec1ff"),

        new AgentDefinition(
            Id: "loss-adjuster",
            Name: "Loss Adjuster Agent",
            Department: "Loss Adjusting",
            Persona: "Lara — Loss Adjuster",
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
            Icon: "🔍",
            Accent: "#ffb347"),

        new AgentDefinition(
            Id: "fraud-investigation",
            Name: "Fraud Investigation Agent",
            Department: "Fraud Investigation",
            Persona: "Felix — Fraud Investigator",
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
            Icon: "🛡️",
            Accent: "#e8504c"),

        new AgentDefinition(
            Id: "supplier-coordinator",
            Name: "Supplier Coordinator Agent",
            Department: "Supplier Coordination",
            Persona: "Sam — Supplier Coordinator",
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
            Icon: "🛠️",
            Accent: "#2e8a6e"),

        new AgentDefinition(
            Id: "settlement",
            Name: "Settlement Agent",
            Department: "Settlement",
            Persona: "Seth — Settlement Officer",
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
            Icon: "💳",
            Accent: "#a06a4c"),

        new AgentDefinition(
            Id: "customer-communications",
            Name: "Customer Communications Agent",
            Department: "Customer Communications",
            Persona: "Cara — Customer Communications Specialist",
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
            Icon: "✉️",
            Accent: "#b56fbf"),

        new AgentDefinition(
            Id: "team-leader",
            Name: "Team Leader Agent",
            Department: "Team Leader Office",
            Persona: "Theo — Claims Team Leader",
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
            Icon: "🧭",
            Accent: "#3a2a20"),
    };

    public static AgentDefinition? FindById(string id) =>
        All.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
}

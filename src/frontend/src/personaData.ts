/**
 * Single source of truth for staff and customer persona data.
 *
 * All persona-level facts (name, role/situation, personality, typical line,
 * scenario palette, claim type & range) live here so that the simulation,
 * the profile-card UI, and the scenario picker never disagree.
 *
 * Mirrors `docs/characters.md` and matches the palette keys defined in
 * `characterPalettes.ts`.
 */
import type { PALETTES } from "./characterPalettes";

export type PaletteKey = keyof typeof PALETTES;

export type StaffRole =
  | "Claims Intake Officer"
  | "Claims Assessor"
  | "Loss Adjuster"
  | "Fraud Investigator"
  | "Supplier Coordinator"
  | "Settlement Officer"
  | "Customer Communications Specialist"
  | "Claims Team Leader";

export interface StaffPersona {
  /** Stable id used for click hitboxes and HUD agent cards. */
  id: string;
  name: string;
  role: StaffRole;
  /** Human-readable role/duties summary (one line). */
  role_short: string;
  palette: PaletteKey;
  /** Swatch color used in the agents panel. */
  color: string;
  personality: string;
  /** Bullet list of "what they do". */
  responsibilities: string[];
  /** Verbatim line from docs/characters.md. */
  typical_line: string;
  /** Default ambient (non-pipeline) status messages — used by ambient staff. */
  ambient: string[];
  /** True for staff that participate in the active claim pipeline. */
  active_in_pipeline: boolean;
  /**
   * Id of the matching agent walkthrough page in the companion `src/backend`
   * Blazor site. Mirrors an Id in `src/backend/Models/AgentCatalog.cs` and is
   * used to deep-link the profile card to `/agents/{app_agent_id}`.
   */
  app_agent_id: string;
}

// Order matches docs/scenario-N-*.md and scenarioNumbers.ts:
//   1 motor, 2 travel, 3 home, 4 business, 5 life.
export type ScenarioId = "motor" | "travel" | "home" | "business" | "life";

export interface CustomerPersona {
  id: ScenarioId;
  name: string;
  /** Short summary used in scenario-picker cards. */
  situation: string;
  /** Long-form narrative — used in profile card. */
  situation_long: string;
  need: string[];
  concern: string;
  personality: string;
  typical_line: string;
  palette: PaletteKey;
  /** Headline claim type (matches existing CUSTOMER_SCENARIOS). */
  claim_type: string;
  /** Random claim amount range. */
  amount_min: number;
  amount_max: number;
  /** Scenario "color" used to tint the now-playing banner / log entries. */
  color: string;
}

/* ------------------------------------------------------------------------ */
/* Staff cast — Claims Office personas, mirroring docs/characters.md         */
/* ------------------------------------------------------------------------ */

export const STAFF_PERSONAS: StaffPersona[] = [
  {
    id: "intake-1",
    name: "Iris",
    role: "Claims Intake Officer",
    role_short: "First point of contact when a customer lodges a claim.",
    palette: "intakeOfficer",
    color: "#f4c463",
    personality: "Calm, organised, patient, and reassuring.",
    responsibilities: [
      "Records claim details",
      "Checks basic policy information",
      "Confirms the type of loss or incident",
      "Requests required documents",
      "Explains the next steps in the claims process",
    ],
    typical_line:
      "I’ll lodge this now and send you a checklist of what we need to assess it.",
    ambient: ["Awaiting next claim"],
    active_in_pipeline: true,
    app_agent_id: "claims-intake",
  },
  {
    id: "assessor-1",
    name: "Adam",
    role: "Claims Assessor",
    role_short:
      "Reviews the claim and determines whether it is covered under the policy.",
    palette: "claimsAssessor",
    color: "#5fb8a8",
    personality: "Analytical, detail-focused, fair, and careful.",
    responsibilities: [
      "Reviews policy wording",
      "Checks coverage, limits, and exclusions",
      "Assesses submitted evidence",
      "Requests missing information",
      "Recommends approval, partial approval, or denial",
    ],
    typical_line:
      "Based on the policy, the damage appears covered, but we still need the repair report.",
    ambient: ["Awaiting next claim"],
    active_in_pipeline: true,
    app_agent_id: "claims-assessment",
  },
  {
    id: "loss-1",
    name: "Lara",
    role: "Loss Adjuster",
    role_short:
      "Investigates damage or complex losses and estimates repair costs.",
    palette: "lossAdjuster",
    color: "#7a9c5a",
    personality: "Methodical, evidence-driven, fair, and field-savvy.",
    responsibilities: [
      "Inspects damaged property",
      "Reviews inspection photos and reports",
      "Estimates repair / replacement costs",
      "Drafts the loss assessment report",
      "Coordinates with contractors",
    ],
    typical_line:
      "I’ll review the inspection photos and confirm the repair scope today.",
    ambient: [
      "Reviewing inspection photos",
      "Estimating repair costs",
      "Drafting assessment report",
      "Calling contractor",
    ],
    active_in_pipeline: false,
    app_agent_id: "loss-adjuster",
  },
  {
    id: "fraud-1",
    name: "Felix",
    role: "Fraud Investigator",
    role_short:
      "Reviews suspicious or inconsistent claims to protect the business.",
    palette: "fraudInvestigator",
    color: "#7a4f9c",
    personality: "Sharp, sceptical, evidence-led, and discreet.",
    responsibilities: [
      "Cross-checks claim history",
      "Verifies timeline and statements",
      "Reviews supporting documents",
      "Flags anomalies for further review",
      "Compiles investigation notes",
    ],
    typical_line:
      "I’m running a quick fraud check on this claim — usually clears within the hour.",
    ambient: [
      "Cross-checking claim history",
      "Verifying timeline",
      "Compiling investigation notes",
      "Reviewing documents",
    ],
    active_in_pipeline: false,
    app_agent_id: "fraud-investigation",
  },
  {
    id: "supplier-1",
    name: "Sam",
    role: "Supplier Coordinator",
    role_short:
      "Arranges repairers, builders, assessors, and other third parties.",
    palette: "supplierCoord",
    color: "#e07a3a",
    personality: "Practical, well-connected, and customer-aware.",
    responsibilities: [
      "Books approved repairers and contractors",
      "Tracks supplier quotes and timelines",
      "Schedules inspections",
      "Coordinates rental cars and temporary services",
      "Updates supplier status",
    ],
    typical_line:
      "I’ll line up an approved repairer today and book a rental car so you’re not stuck.",
    ambient: [
      "Booking approved repairer",
      "Tracking supplier quotes",
      "Scheduling inspection",
      "Updating supplier status",
    ],
    active_in_pipeline: false,
    app_agent_id: "supplier-coordinator",
  },
  {
    id: "settlement-1",
    name: "Seth",
    role: "Settlement Officer",
    role_short: "Calculates the payout and prepares settlement.",
    palette: "settlementOfficer",
    color: "#3a5fb0",
    personality: "Numbers-focused, precise, transparent, and customer-fair.",
    responsibilities: [
      "Calculates the final settlement amount",
      "Applies excess and policy limits",
      "Prepares payment instructions",
      "Confirms settlement details with the customer",
    ],
    typical_line:
      "Once we deduct the excess, your settlement comes to $4,820 — paid into your nominated account.",
    ambient: ["Awaiting next claim"],
    active_in_pipeline: true,
    app_agent_id: "settlement",
  },
  {
    id: "comms-1",
    name: "Cara",
    role: "Customer Communications Specialist",
    role_short:
      "Keeps the customer informed and supported throughout the claim.",
    palette: "commsSpecialist",
    color: "#c14a7a",
    personality: "Warm, articulate, empathetic, and clear.",
    responsibilities: [
      "Sends status updates and outcome letters",
      "Explains decisions in plain English",
      "Handles customer questions and concerns",
      "Coordinates timely responses across departments",
      "Ensures empathetic, on-brand messaging",
    ],
    typical_line:
      "I’ll send you an update today and walk you through what happens next.",
    ambient: ["Awaiting next claim"],
    active_in_pipeline: true,
    app_agent_id: "customer-communications",
  },
  {
    id: "lead-1",
    name: "Theo",
    role: "Claims Team Leader",
    role_short:
      "Monitors escalations, workload, and quality across the team.",
    palette: "teamLeader",
    color: "#cdb497",
    personality: "Calm, decisive, supportive, and quality-focused.",
    responsibilities: [
      "Reviews escalations and high-value claims",
      "Monitors team workload and SLAs",
      "Coaches staff",
      "Approves complex or sensitive claims",
    ],
    typical_line:
      "Let me have a look — we’ll make sure this is handled right.",
    ambient: [
      "Reviewing escalations",
      "Monitoring team workload",
      "Coaching staff",
      "Approving high-value claim",
    ],
    active_in_pipeline: false,
    app_agent_id: "team-leader",
  },
];

/* ------------------------------------------------------------------------ */
/* Customer cast — five claim scenarios from docs/characters.md             */
/* ------------------------------------------------------------------------ */

export const CUSTOMER_PERSONAS: CustomerPersona[] = [
  // Order matches docs/scenario-N-*.md and scenarioNumbers.ts:
  //   1. motor   2. travel   3. home   4. business   5. life
  {
    id: "motor",
    name: "Aisha",
    situation: "Rear-ended at an intersection.",
    situation_long:
      "Her car was damaged in a rear-end accident. She depends on her car for work and cannot afford long delays.",
    need: [
      "Wants a repairer assigned",
      "Needs help arranging a rental car",
      "Wants updates on repair timing",
    ],
    concern:
      "She depends on her car for work and cannot afford long delays.",
    personality: "Busy, direct, and time-sensitive.",
    typical_line:
      "I use the car every day, so I need to understand the timeline.",
    palette: "customerMotor",
    claim_type: "Motor — rear-end collision",
    amount_min: 800,
    amount_max: 9500,
    color: "#d36b5b",
  },
  {
    id: "travel",
    name: "Grace",
    situation: "Luggage lost during an overseas trip.",
    situation_long:
      "Her luggage was lost during an overseas trip. She does not have receipts for every lost item.",
    need: [
      "Wants reimbursement for clothing, medication, and essential items",
      "Needs guidance on what documents are acceptable",
      "Wants a simple process while travelling",
    ],
    concern:
      "She does not have receipts for every lost item.",
    personality: "Frustrated, overwhelmed, and looking for practical help.",
    typical_line:
      "I bought these things years ago. I don’t know how I’m supposed to prove every purchase.",
    palette: "customerTravel",
    claim_type: "Travel — lost luggage",
    amount_min: 200,
    amount_max: 4000,
    color: "#c188d4",
  },
  {
    id: "home",
    name: "Michael",
    situation: "Burst pipe damaged the kitchen.",
    situation_long:
      "His kitchen was damaged after a burst pipe. The family cannot properly use the kitchen, and he is unsure whether water damage is covered.",
    need: [
      "Wants repairs approved quickly",
      "Needs clear instructions on what evidence to provide",
      "Wants to know whether temporary accommodation or urgent repairs are covered",
    ],
    concern:
      "His family cannot properly use the kitchen, and he is unsure whether water damage is covered.",
    personality: "Stressed, practical, and eager for a fast answer.",
    typical_line:
      "I just need to know if this is covered and how soon repairs can start.",
    palette: "customerHome",
    claim_type: "Home — burst pipe damage",
    amount_min: 1500,
    amount_max: 18000,
    color: "#3a8fd6",
  },
  {
    id: "business",
    name: "Tom",
    situation: "Café smoke-damaged after an electrical fire.",
    situation_long:
      "His café suffered smoke damage after an electrical fire. Every day the café is closed means lost revenue and staff uncertainty.",
    need: [
      "Wants property damage assessed",
      "Needs business interruption support",
      "Wants clarity on lost income coverage",
    ],
    concern:
      "Every day the café is closed means lost revenue and staff uncertainty.",
    personality: "Anxious, business-minded, and focused on reopening quickly.",
    typical_line:
      "The repairs are one thing, but I’m also losing revenue while we’re closed.",
    palette: "customerBusiness",
    claim_type: "Business — café smoke damage",
    amount_min: 4000,
    amount_max: 35000,
    color: "#e07a3a",
  },
  {
    id: "life",
    name: "Robert",
    situation: "Beneficiary claim after bereavement.",
    situation_long:
      "He is making a claim after a family member passed away. The paperwork feels overwhelming during a period of grief.",
    need: [
      "Wants a compassionate and clear process",
      "Needs help understanding required documents",
      "Wants reassurance about timelines and next steps",
    ],
    concern:
      "The paperwork feels overwhelming during a period of grief.",
    personality: "Quiet, emotional, and sensitive to tone.",
    typical_line:
      "I’m trying to get this sorted, but it’s a difficult time for the family.",
    palette: "customerLife",
    claim_type: "Life — beneficiary claim",
    amount_min: 5000,
    amount_max: 50000,
    color: "#6e7a8a",
  },
];

// Scripted scenario beats now live in src/ui/src/scenarios/<id>.json
// (see src/ui/src/scenarios/index.ts for the typed loader).

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

export function findCustomerPersona(id: ScenarioId): CustomerPersona {
  const p = CUSTOMER_PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown scenario id: ${id}`);
  return p;
}

export function findStaffByRole(role: StaffRole): StaffPersona {
  const p = STAFF_PERSONAS.find((x) => x.role === role);
  if (!p) throw new Error(`No staff persona for role: ${role}`);
  return p;
}

export function findStaffById(id: string): StaffPersona | undefined {
  return STAFF_PERSONAS.find((x) => x.id === id);
}

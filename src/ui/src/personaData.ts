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
}

export type ScenarioId = "home" | "motor" | "business" | "travel" | "life";

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
  },
];

/* ------------------------------------------------------------------------ */
/* Customer cast — five claim scenarios from docs/characters.md             */
/* ------------------------------------------------------------------------ */

export const CUSTOMER_PERSONAS: CustomerPersona[] = [
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

/* ------------------------------------------------------------------------ */
/* Scripted scenario beats                                                  */
/* ------------------------------------------------------------------------ */

/**
 * `at` — focus character for the camera director. Either a staff role or
 * "customer" (the scripted customer in flight).
 */
export type BeatFocus = StaffRole | "customer" | "office" | "neighbourhood";

export type BeatAction =
  | "arrive-at-zone"
  | "walk-to-office"
  | "enter-office"
  | "lodge-at-reception"
  | "intake-pickup"
  | "intake-route"
  | "assessor-pickup"
  | "assessor-process"
  | "loss-adjuster-review"
  | "fraud-review"
  | "supplier-coordinate"
  | "team-leader-review"
  | "assessor-handoff"
  | "settle"
  | "comms-notify"
  | "customer-leave";

export interface ScenarioBeat {
  at: BeatFocus;
  action: BeatAction;
  /** Activity-log line and now-playing banner text. */
  narration: string;
  /** Extra dwell time (seconds) for paused beats. Movement beats finish on arrival. */
  duration?: number;
  /** Optional outcome hint for `settle` beat (defaults to approved). */
  outcome?: "approved" | "rejected" | "partial";
}

/**
 * Per-scenario beat sequence. The narration is intentionally written in
 * plain, customer-friendly language matching the demo tone.
 */
export const SCENARIO_BEATS: Record<ScenarioId, ScenarioBeat[]> = {
  home: [
    {
      at: "customer",
      action: "arrive-at-zone",
      narration:
        "Michael discovers a burst pipe has flooded the kitchen and calls Zava Insurance.",
      duration: 2.0,
    },
    {
      at: "customer",
      action: "walk-to-office",
      narration: "Michael heads to the Zava Insurance Claims Office to lodge his claim.",
    },
    {
      at: "customer",
      action: "enter-office",
      narration: "Michael arrives at the office and joins reception.",
    },
    {
      at: "customer",
      action: "lodge-at-reception",
      narration: "Michael lodges his Home — burst pipe damage claim.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-pickup",
      narration: "Iris picks up the claim and confirms next steps.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-route",
      narration: "Iris routes the claim to the Claims Assessor.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-pickup",
      narration: "Adam begins the policy-coverage review.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-process",
      narration: "Adam checks coverage for water damage — covered.",
      duration: 2.5,
    },
    {
      at: "Loss Adjuster",
      action: "loss-adjuster-review",
      narration:
        "Lara reviews the inspection photos and estimates the repair scope.",
      duration: 3.0,
    },
    {
      at: "Supplier Coordinator",
      action: "supplier-coordinate",
      narration: "Sam books an approved plumber and emergency drying gear.",
      duration: 2.5,
    },
    {
      at: "Claims Assessor",
      action: "assessor-handoff",
      narration: "Adam hands the claim to Settlement.",
    },
    {
      at: "Settlement Officer",
      action: "settle",
      narration: "Seth approves the payout less the excess.",
      duration: 2.5,
      outcome: "approved",
    },
    {
      at: "Customer Communications Specialist",
      action: "comms-notify",
      narration: "Cara calls Michael to confirm the outcome and timing.",
      duration: 2.0,
    },
  ],

  motor: [
    {
      at: "customer",
      action: "arrive-at-zone",
      narration:
        "Aisha is rear-ended at an intersection and calls Zava Insurance.",
      duration: 2.0,
    },
    {
      at: "customer",
      action: "walk-to-office",
      narration: "Aisha drives to the Zava Insurance Claims Office to lodge her claim.",
    },
    {
      at: "customer",
      action: "enter-office",
      narration: "Aisha arrives at the office.",
    },
    {
      at: "customer",
      action: "lodge-at-reception",
      narration: "Aisha lodges her Motor — rear-end collision claim.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-pickup",
      narration: "Iris captures the at-fault details and photos.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-route",
      narration: "Iris routes the claim to the Claims Assessor.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-pickup",
      narration: "Adam reviews the policy and coverage for the collision.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-process",
      narration: "Adam clears coverage — proceed to repairer assignment.",
      duration: 2.5,
    },
    {
      at: "Supplier Coordinator",
      action: "supplier-coordinate",
      narration: "Sam assigns an approved repairer and books a rental car.",
      duration: 3.0,
    },
    {
      at: "Claims Assessor",
      action: "assessor-handoff",
      narration: "Adam hands the claim to Settlement.",
    },
    {
      at: "Settlement Officer",
      action: "settle",
      narration: "Seth authorises payment for the repairer directly.",
      duration: 2.5,
      outcome: "approved",
    },
    {
      at: "Customer Communications Specialist",
      action: "comms-notify",
      narration:
        "Cara messages Aisha with the repairer details and rental pickup.",
      duration: 2.0,
    },
  ],

  business: [
    {
      at: "customer",
      action: "arrive-at-zone",
      narration:
        "Tom assesses the smoke damage to his café after the electrical fire.",
      duration: 2.0,
    },
    {
      at: "customer",
      action: "walk-to-office",
      narration: "Tom heads to the Zava Insurance Claims Office to lodge his claim.",
    },
    {
      at: "customer",
      action: "enter-office",
      narration: "Tom arrives at the office.",
    },
    {
      at: "customer",
      action: "lodge-at-reception",
      narration: "Tom lodges his Business — café smoke damage claim.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-pickup",
      narration: "Iris captures the property and business-interruption details.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-route",
      narration: "Iris routes the claim to the Claims Assessor.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-pickup",
      narration: "Adam reviews the commercial cover and exclusions.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-process",
      narration: "Adam confirms property and business-interruption cover.",
      duration: 2.5,
    },
    {
      at: "Loss Adjuster",
      action: "loss-adjuster-review",
      narration:
        "Lara schedules a site visit to estimate restoration costs.",
      duration: 3.0,
    },
    {
      at: "Supplier Coordinator",
      action: "supplier-coordinate",
      narration:
        "Sam lines up smoke-restoration specialists and a temporary kitchen.",
      duration: 2.5,
    },
    {
      at: "Claims Team Leader",
      action: "team-leader-review",
      narration: "Theo reviews the high-value claim and signs off.",
      duration: 2.5,
    },
    {
      at: "Claims Assessor",
      action: "assessor-handoff",
      narration: "Adam hands the claim to Settlement.",
    },
    {
      at: "Settlement Officer",
      action: "settle",
      narration:
        "Seth issues an interim payment plus business-interruption support.",
      duration: 2.5,
      outcome: "approved",
    },
    {
      at: "Customer Communications Specialist",
      action: "comms-notify",
      narration: "Cara walks Tom through the staged settlement plan.",
      duration: 2.0,
    },
  ],

  travel: [
    {
      at: "customer",
      action: "arrive-at-zone",
      narration:
        "Grace realises her luggage didn’t arrive and contacts Zava Insurance.",
      duration: 2.0,
    },
    {
      at: "customer",
      action: "walk-to-office",
      narration:
        "Grace heads from the airport to the Zava Insurance Claims Office to lodge her claim.",
    },
    {
      at: "customer",
      action: "enter-office",
      narration: "Grace arrives at the office.",
    },
    {
      at: "customer",
      action: "lodge-at-reception",
      narration: "Grace lodges her Travel — lost luggage claim.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-pickup",
      narration:
        "Iris captures the airline reference and items list.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-route",
      narration: "Iris routes the claim to the Claims Assessor.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-pickup",
      narration: "Adam reviews the travel policy and item evidence.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-process",
      narration:
        "Adam notes some items lack receipts — flagged for fraud quick-check.",
      duration: 2.5,
    },
    {
      at: "Fraud Investigator",
      action: "fraud-review",
      narration: "Felix runs a quick fraud check — clears the claim.",
      duration: 2.5,
    },
    {
      at: "Claims Assessor",
      action: "assessor-handoff",
      narration: "Adam hands the claim to Settlement.",
    },
    {
      at: "Settlement Officer",
      action: "settle",
      narration:
        "Seth approves a partial settlement covering the verified items.",
      duration: 2.5,
      outcome: "partial",
    },
    {
      at: "Customer Communications Specialist",
      action: "comms-notify",
      narration:
        "Cara explains the partial outcome to Grace in plain English.",
      duration: 2.0,
    },
  ],

  life: [
    {
      at: "customer",
      action: "arrive-at-zone",
      narration:
        "Robert prepares the bereavement paperwork after losing a family member.",
      duration: 2.0,
    },
    {
      at: "customer",
      action: "walk-to-office",
      narration: "Robert travels to the Zava Insurance Claims Office to lodge the claim.",
    },
    {
      at: "customer",
      action: "enter-office",
      narration: "Robert arrives at the office.",
    },
    {
      at: "customer",
      action: "lodge-at-reception",
      narration: "Robert lodges the Life — beneficiary claim.",
    },
    {
      at: "Claims Intake Officer",
      action: "intake-pickup",
      narration: "Iris handles the lodgement with care and patience.",
    },
    {
      at: "Claims Team Leader",
      action: "team-leader-review",
      narration:
        "Theo personally oversees the bereavement claim for compassionate handling.",
      duration: 2.5,
    },
    {
      at: "Claims Intake Officer",
      action: "intake-route",
      narration: "Iris routes the claim to the Claims Assessor.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-pickup",
      narration: "Adam reviews the policy and required documents gently.",
    },
    {
      at: "Claims Assessor",
      action: "assessor-process",
      narration: "Adam confirms the policy is in force and beneficiary verified.",
      duration: 2.5,
    },
    {
      at: "Claims Assessor",
      action: "assessor-handoff",
      narration: "Adam hands the claim to Settlement.",
    },
    {
      at: "Settlement Officer",
      action: "settle",
      narration: "Seth prepares the full benefit payment for the beneficiary.",
      duration: 2.5,
      outcome: "approved",
    },
    {
      at: "Customer Communications Specialist",
      action: "comms-notify",
      narration: "Cara calls Robert with empathy and clear next steps.",
      duration: 2.5,
    },
  ],
};

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

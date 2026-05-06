/**
 * JSON-driven scenario definitions.
 *
 * Each scenario lives in its own `<id>.json` file in this folder so the
 * simulation can be fully triggered and played out from data alone:
 *  - Customer + incident zone (neighbourhood theme)
 *  - Reset block — snaps every staff member back to their desk and clears
 *    any leftover ambient claim folders before the scripted run begins.
 *  - Beat list — narration, action, and dwell time for every step.
 *  - Pre-assessor / extras consultation hooks (Loss Adjuster, Fraud,
 *    Supplier Coordinator, Team Leader) and the deterministic settlement
 *    outcome.
 *
 * `personaData.ts` and `claimSimulation.ts` import these to drive the
 * scripted flow, so one JSON edit changes both the on-screen narration
 * and the underlying simulation behaviour.
 */
import type { ScenarioId, StaffRole } from "../personaData";

import home from "./home.json";
import motor from "./motor.json";
import business from "./business.json";
import travel from "./travel.json";
import life from "./life.json";

export type ScenarioOutcome = "approved" | "rejected" | "partial";

export interface ScenarioConsultation {
  role: StaffRole;
  narration: string;
  duration: number;
}

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

export type BeatFocus = StaffRole | "customer" | "office" | "neighbourhood";

export interface ScenarioBeatJson {
  at: BeatFocus;
  action: BeatAction;
  narration: string;
  duration?: number;
  outcome?: ScenarioOutcome;
}

export interface ScenarioResetJson {
  office: {
    /** Snap every staff member back to their home desk. */
    snapStaffToDesks: boolean;
    /** Clear inbox / settlement / comms / assessor-ready queues. */
    clearQueues: boolean;
    /** Despawn every non-scripted customer currently in flight. */
    removeUnscriptedCustomers: boolean;
  };
  neighbourhood: {
    incidentZone: ScenarioId;
  };
}

export interface ScenarioDefinition {
  id: ScenarioId;
  scenarioNumber: number;
  /**
   * Fixed claim case number used when this scenario is launched. Mirrors
   * the seeded entries minted by `IntakeClaimStore.SeedDefaults` in the
   * backend so the scripted simulation, intake mock data, and downstream
   * agent pages all reference the same claim id.
   */
  caseId: string;
  customerId: ScenarioId;
  incidentZone: ScenarioId;
  approveAtAssessor: boolean;
  settlement: ScenarioOutcome;
  narrations: {
    assessor: string;
    settlement: string;
    comms: string;
  };
  preAssessor: ScenarioConsultation[];
  extras: ScenarioConsultation[];
  beats: ScenarioBeatJson[];
  reset: ScenarioResetJson;
}

/** Single source of truth for every scripted scenario. */
export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  home: home as ScenarioDefinition,
  motor: motor as ScenarioDefinition,
  business: business as ScenarioDefinition,
  travel: travel as ScenarioDefinition,
  life: life as ScenarioDefinition,
};

export function getScenario(id: ScenarioId): ScenarioDefinition {
  const s = SCENARIOS[id];
  if (!s) {
    const valid = Object.keys(SCENARIOS).join(", ");
    throw new Error(`Unknown scenario id: ${id}. Valid IDs are: ${valid}`);
  }
  return s;
}

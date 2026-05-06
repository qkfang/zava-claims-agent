/**
 * Maps each customer scenario id to its docs/scenario-N number.
 * scenario-1 motor-collision, scenario-2 fraud-staged-theft (travel),
 * scenario-3 home-burst-pipe, scenario-4 business-fire, scenario-5 life.
 */
import type { ScenarioId } from "./personaData";

// Keep the property order aligned with docs/scenario-N-*.md so the
// canonical 1..5 sequence is consistent across frontend, backend and docs.
export const SCENARIO_NUMBER: Record<ScenarioId, number> = {
  motor: 1,
  travel: 2,
  home: 3,
  business: 4,
  life: 5,
};

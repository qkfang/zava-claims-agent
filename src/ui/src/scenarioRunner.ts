import { Scene, Vector3 } from "@babylonjs/core";
import { CameraDirector } from "./cameraDirector";
import {
  ClaimSimulation,
  type BeatFocusInfo,
  type CustomerAgentInfo,
} from "./claimSimulation";
import {
  CUSTOMER_PERSONAS,
  findCustomerPersona,
  findStaffByRole,
  type CustomerPersona,
  type ScenarioId,
} from "./personaData";
import type { IncidentZones } from "./neighbourhoodScene";
import type { HudLogger } from "./hud";
import { PALETTES, VoxelCharacter } from "./voxelCharacter";
import {
  GATED_STAGES,
  STAGE_CONFIG,
  StepGate,
  type StageInfo,
  type StageKey,
} from "./stepGate";
import { SCENARIO_NUMBER } from "./scenarioNumbers";
import {
  CustomerResultBanner,
  ScenarioSummaryModal,
  type ScenarioOutcome,
} from "./scenarioSummary";
import { ActivityPanel, stageToActivity } from "./activityPanel";

/**
 * Hook the runner uses to drive the neighbourhood scene's per-scenario
 * incident animation (e.g. the burst-pipe water spurt). Implemented by
 * the result of `buildNeighbourhood`.
 */
export interface NeighbourhoodIncidentController {
  playIncident(id: ScenarioId): void;
  clearIncident(): void;
}

/**
 * Scenario states (used internally to gate camera + scene transitions).
 */
type RunnerState =
  | "idle"
  | "neighbourhood-arrive"
  | "neighbourhood-walk"
  | "transition"
  | "office"
  | "closing";

/**
 * Hook a scripted scenario can invoke when the user cancels via the banner.
 */
export interface ScenarioRunnerHooks {
  /** Switch the active rendered scene. */
  setActiveScene(key: "office" | "neighbourhood"): void;
  /** Show a brief CSS fade overlay during scene transition. */
  fadeTransition(): Promise<void>;
  /** Update the "Now playing" banner UI. */
  showBanner(persona: CustomerPersona, narration: string): void;
  /** Update only the banner's narration line. */
  updateBannerNarration(narration: string): void;
  /** Hide the banner. */
  hideBanner(): void;
  /** Disable / enable the scene-toggle buttons during scripted playback. */
  setSceneToggleDisabled(disabled: boolean): void;
}

/**
 * ScenarioRunner orchestrates a scripted customer journey from the
 * neighbourhood incident zone all the way through the claims office.
 */
export class ScenarioRunner {
  private state: RunnerState = "idle";
  private nhCustomer: VoxelCharacter | null = null;
  /** Remaining waypoints the customer is walking through (last one is the office door). */
  private nhRoute: Vector3[] = [];
  private nhArriveDelay = 0;
  private currentPersona: CustomerPersona | null = null;
  private currentClaimId: string | null = null;
  private inflightInfo: CustomerAgentInfo | null = null;
  private focusObserver: { remove: () => void } | null = null;
  /** Cancellation token incremented to ignore stale callbacks. */
  private runId = 0;

  /** Step-gate UI + state. */
  private readonly stepGate = new StepGate();
  private readonly resultBanner = new CustomerResultBanner();
  private readonly summaryModal = new ScenarioSummaryModal();
  private readonly activityPanel = new ActivityPanel();
  /** True while running with auto-play (no per-step prompt). */
  private autoPlay = false;
  /** Ordered list of steps that have actually fired in this run. */
  private executedSteps: StageInfo[] = [];
  /** Staff currently displaying thought bulbs. */
  private bulbStaffCharId: string | null = null;
  /** Stages that have already been gated this run (avoid re-prompting). */
  private gatedStagesSeen = new Set<string>();

  constructor(
    private readonly nhScene: Scene,
    private readonly officeScene: Scene,
    private readonly nhCamera: CameraDirector,
    private readonly officeCamera: CameraDirector,
    private readonly zones: IncidentZones,
    private readonly sim: ClaimSimulation,
    private readonly hud: HudLogger,
    private readonly hooks: ScenarioRunnerHooks,
    private readonly incidents: NeighbourhoodIncidentController,
  ) {}

  isPlaying(): boolean {
    return this.state !== "idle";
  }

  /**
   * Start a scripted scenario. If `id` is "random", picks one at random.
   */
  start(id: ScenarioId | "random", opts: { autoPlay?: boolean } = {}): void {
    if (this.state !== "idle") return;
    const scenarioId: ScenarioId =
      id === "random"
        ? CUSTOMER_PERSONAS[Math.floor(Math.random() * CUSTOMER_PERSONAS.length)]
            .id
        : id;
    const persona = findCustomerPersona(scenarioId);
    this.currentPersona = persona;
    this.runId++;
    this.autoPlay = !!opts.autoPlay;
    this.executedSteps = [];
    this.gatedStagesSeen.clear();
    this.clearThoughtBulbs();
    this.resultBanner.hide();
    document.body.classList.add("scenario-active");
    const myRunId = this.runId;

    this.hooks.setSceneToggleDisabled(true);
    this.hooks.showBanner(
      persona,
      `${persona.name} — ${persona.situation}`,
    );

    // Switch to the neighbourhood scene and place the customer at their zone.
    this.hooks.setActiveScene("neighbourhood");

    const palette = PALETTES[persona.palette];
    const ch = new VoxelCharacter(this.nhScene, `nh_cust_${persona.id}`, palette);
    const start = this.zones[persona.id].clone();
    start.y = 0.2;
    ch.root.position = start;
    this.nhCustomer = ch;

    // Highlight the customer in the neighbourhood scene.
    ch.setHighlight(true);

    // Camera focuses on the incident zone at a friendly orbit.
    this.nhCamera.focusNode(ch.root, {
      radius: 22,
      beta: Math.PI / 3.4,
      durationSec: 1.4,
    });

    this.state = "neighbourhood-arrive";
    // Hold the customer at the incident zone a little longer so the
    // viewer can watch the scripted "story of the accident" animation
    // play out (e.g. burst pipe water spurt) before they walk to the
    // office.
    this.nhArriveDelay = 4.5;
    this.hooks.updateBannerNarration(
      `${persona.name} — ${persona.situation_long}`,
    );
    this.hud.log(
      `${persona.name} reports ${persona.claim_type} from the neighbourhood`,
      "warn",
    );

    // Kick off the per-scenario incident animation in the neighbourhood
    // (e.g. burst pipe spurts water, rear-end collision shakes both cars).
    this.incidents.playIncident(persona.id);

    // Sanity check: if state changes underneath us, abort.
    if (myRunId !== this.runId) return;
  }

  /**
   * Cancel the in-flight scenario (banner ✕ click). Despawns the
   * neighbourhood customer and lets any in-office claim continue silently
   * but releases camera focus and re-enables auto-spawn.
   */
  cancel(): void {
    if (this.state === "idle") return;
    this.runId++;
    if (this.closingHandle !== null) {
      window.clearTimeout(this.closingHandle);
      this.closingHandle = null;
    }
    // Make sure the simulation isn't left paused if we cancel mid-step-gate.
    this.sim.setPaused(false);
    this.stepGate.close();
    this.resultBanner.hide();
    this.activityPanel.hide();
    document.body.classList.remove("scenario-active");
    this.clearThoughtBulbs();
    this.cleanupNeighbourhoodCustomer();
    this.incidents.clearIncident();
    this.releaseFocus();
    this.hooks.hideBanner();
    this.hooks.setSceneToggleDisabled(false);
    this.state = "idle";
    this.currentPersona = null;
    this.currentClaimId = null;
    this.inflightInfo = null;
    this.executedSteps = [];
    this.gatedStagesSeen.clear();
    this.sim.resumeAutoSpawn();
    this.hud.log("Scenario cancelled by user", "warn");
  }

  /**
   * Per-frame tick — advances the neighbourhood walk + arrival delay.
   * Office-stage progression is driven by the ClaimSimulation pipeline
   * itself; we just track state changes.
   */
  update(dtSec: number): void {
    if (this.state === "idle") return;

    if (this.state === "neighbourhood-arrive") {
      this.nhArriveDelay -= dtSec;
      if (this.nhArriveDelay <= 0) {
        // Begin walking toward the office door, routed along the road
        // grid so the customer doesn't stride straight through houses,
        // shops, or the central roundabout island.
        this.state = "neighbourhood-walk";
        this.nhRoute = this.buildNhRoute();
        this.nhWalkRefocusTimer = 0;
        this.nhCustomer?.setWalking(true);
        if (this.currentPersona) {
          this.hooks.updateBannerNarration(
            `${this.currentPersona.name} heads to the Zava Insurance Claims Office.`,
          );
          this.hud.log(
            `${this.currentPersona.name} heads to the Zava Insurance Claims Office`,
            "warn",
          );
        }
        // Camera tracks the customer
        if (this.nhCustomer) {
          this.nhCamera.focusNode(this.nhCustomer.root, {
            radius: 18,
            beta: Math.PI / 3.4,
            durationSec: 1.0,
          });
        }
      }
    } else if (this.state === "neighbourhood-walk") {
      this.advanceNhWalk(dtSec);
    }
    // office and closing states are driven by simulation events
  }

  private nhWalkRefocusTimer = 0;

  /**
   * Build a list of waypoints from the customer's current position to
   * the office front door. The route hugs the main road sidewalks (at
   * z≈±3.4 and x≈±3.4) so the character walks around houses, the
   * roundabout island, and other scenery rather than clipping through
   * them in a straight line.
   */
  private buildNhRoute(): Vector3[] {
    const door = this.zones.officeDoor.clone();
    door.y = 0.2;
    const id = this.currentPersona?.id;
    // Sidewalk corridors just outside the central asphalt (kerbs sit at
    // ±2.95 with depth 0.9 → walkable strip from ~±3.0 to ~±3.4).
    const N = 3.4; // north sidewalk z
    const S = -3.4; // south sidewalk z
    const W = -3.4; // west sidewalk x
    const E = 3.4; // east sidewalk x
    let waypoints: Array<[number, number]> = [];
    switch (id) {
      case "home":
        // Spawn (~14, 10) → south to north sidewalk → west around the
        // roundabout via the NW corner → south down west sidewalk → door.
        waypoints = [[14, N], [W, N], [W, -4]];
        break;
      case "motor":
        // Spawn (~23.5, -2) is on the road south of centre — step onto
        // the south sidewalk then walk west to the door.
        waypoints = [[14, S], [W, S]];
        break;
      case "business":
        // Spawn (~-17, -12) south-west — walk north to south sidewalk
        // then east to the door.
        waypoints = [[-17, S], [W, S]];
        break;
      case "travel":
        // Spawn (~-15, 14) north-west — south to north sidewalk, east
        // to NW corner, then south to the door.
        waypoints = [[-15, N], [W, N], [W, -4]];
        break;
      case "life":
        // Spawn (~15, -14) south-east — north to south sidewalk then
        // west to the door.
        waypoints = [[15, S], [W, S]];
        break;
      default:
        waypoints = [];
    }
    const route = waypoints.map(([x, z]) => new Vector3(x, 0.2, z));
    route.push(door);
    return route;
  }

  private advanceNhWalk(dtSec: number): void {
    if (!this.nhCustomer || this.nhRoute.length === 0) return;
    const speed = 3.2;
    this.nhCustomer.update(dtSec);
    const root = this.nhCustomer.root;
    const target = this.nhRoute[0];
    const dx = target.x - root.position.x;
    const dz = target.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    // If we're close enough to the current waypoint, advance to the
    // next. The final waypoint is the office door, so an empty queue
    // triggers the office transition.
    if (dist < 0.4) {
      this.nhRoute.shift();
      if (this.nhRoute.length === 0) {
        this.beginTransition();
        return;
      }
      return;
    }
    const step = Math.min(dist, speed * dtSec);
    const nx = dx / dist;
    const nz = dz / dist;
    root.position.x += nx * step;
    root.position.z += nz * step;
    root.rotation.y = Math.atan2(nx, nz);

    // Camera gently follows — retarget at ~1Hz so animation has time to play.
    this.nhWalkRefocusTimer -= dtSec;
    if (this.nhWalkRefocusTimer <= 0) {
      this.nhWalkRefocusTimer = 1.0;
      this.nhCamera.focusNode(root, {
        radius: 18,
        durationSec: 1.0,
      });
    }
  }

  private async beginTransition(): Promise<void> {
    if (this.state !== "neighbourhood-walk") return;
    this.state = "transition";
    const persona = this.currentPersona!;
    this.hooks.updateBannerNarration(
      `${persona.name} arrives at the office.`,
    );

    // Brief CSS fade
    await this.hooks.fadeTransition();

    // Tear down the neighbourhood customer and stop its incident
    // animation now that the scene is no longer being shown.
    this.cleanupNeighbourhoodCustomer();
    this.incidents.clearIncident();

    // Switch scenes
    this.hooks.setActiveScene("office");

    // Hand off to the simulation: spawn the scripted customer in the office.
    const myRunId = this.runId;
    const inflight = this.sim.startScripted(persona.id, {
      onFocusChange: (info) => {
        if (myRunId !== this.runId) return;
        this.handleFocusChange(info);
      },
      onClosed: () => {
        if (myRunId !== this.runId) return;
        this.handleClosed();
      },
    });
    this.inflightInfo = inflight.customer;
    this.currentClaimId = inflight.customer.claimId;

    this.state = "office";

    // Initial focus on the customer entering the office.
    this.officeCamera.focusNode(inflight.customer.character.root, {
      radius: 20,
      beta: Math.PI / 3.2,
      durationSec: 1.2,
    });
    this.sim.setHighlightedCharacter(inflight.customer.characterId);
  }

  private handleFocusChange(info: BeatFocusInfo): void {
    if (this.state !== "office") return;
    const ch = this.sim.getCharacterById(info.characterId);
    if (ch) {
      this.officeCamera.focusNode(ch.root, {
        radius: 16,
        beta: Math.PI / 3.4,
        durationSec: 1.0,
      });
      this.sim.setHighlightedCharacter(info.characterId);
    }
    this.hooks.updateBannerNarration(info.narration);

    // Is this beat a "step start" we should gate / annotate?
    const stage = info.stage as StageKey;
    if (GATED_STAGES.has(stage) && !this.gatedStagesSeen.has(stage)) {
      this.gatedStagesSeen.add(stage);
      const stageInfo = this.buildStageInfo(stage, info.narration);
      if (stageInfo) {
        this.executedSteps.push(stageInfo);
        // Show the thought bulbs above the staff member.
        this.showThoughtBulbsForStage(info.characterId, stageInfo);
        // Show the activity panel — focuses the UI on the active staff +
        // their AI sub-agents while the case is being worked on.
        this.activityPanel.show(stageToActivity(stageInfo));
        if (!this.autoPlay) this.openStepGate(stageInfo);
      }
    } else {
      // Same stage, narration changed — keep the panel in sync.
      this.activityPanel.updateNarration(info.narration);
    }
  }

  /** Build a StageInfo (title, staff, agents, narration) for this stage. */
  private buildStageInfo(stage: StageKey, narration: string): StageInfo | null {
    const cfg = STAGE_CONFIG[stage];
    if (!cfg) return null;
    // Resolve the staff member for this stage.
    const role = this.staffRoleForStage(stage);
    const persona = findStaffByRole(role);
    return {
      title: cfg.title,
      staffRole: role,
      staffName: persona.name,
      staffColor: persona.color,
      narration,
      agents: cfg.agents,
    };
  }

  private staffRoleForStage(stage: StageKey):
    | "Claims Intake Officer"
    | "Claims Assessor"
    | "Loss Adjuster"
    | "Supplier Coordinator"
    | "Fraud Investigator"
    | "Claims Team Leader"
    | "Settlement Officer"
    | "Customer Communications Specialist" {
    switch (stage) {
      case "intake-pickup":
        return "Claims Intake Officer";
      case "assessor-pickup":
        return "Claims Assessor";
      case "consult:Loss Adjuster":
        return "Loss Adjuster";
      case "consult:Supplier Coordinator":
        return "Supplier Coordinator";
      case "consult:Fraud Investigator":
        return "Fraud Investigator";
      case "consult:Claims Team Leader":
        return "Claims Team Leader";
      case "settle":
        return "Settlement Officer";
      case "comms-notify":
        return "Customer Communications Specialist";
    }
  }

  private showThoughtBulbsForStage(
    staffCharId: string,
    stageInfo: StageInfo,
  ): void {
    this.clearThoughtBulbs();
    const ch = this.sim.getCharacterById(staffCharId);
    if (!ch) return;
    ch.showThoughtBulbs(stageInfo.agents.map((a) => ({ name: a.name })));
    this.bulbStaffCharId = staffCharId;
    // Mark the corresponding agent card so the AI Agents panel can focus
    // on the staff member currently working on the case.
    const panel = document.getElementById("agents-panel");
    if (panel) panel.dataset.activeStaffId = staffCharId;
  }

  private clearThoughtBulbs(): void {
    if (this.bulbStaffCharId) {
      const prev = this.sim.getCharacterById(this.bulbStaffCharId);
      prev?.hideThoughtBulbs();
      this.bulbStaffCharId = null;
    }
    const panel = document.getElementById("agents-panel");
    if (panel) delete panel.dataset.activeStaffId;
  }

  /** Open the step-gate modal and pause the simulation until dismissed. */
  private openStepGate(stageInfo: StageInfo): void {
    // Compute step number / total against the executed list (best-effort —
    // we don't know the full plan ahead of time, so display as "Step N").
    const stepNumber = this.executedSteps.length;
    const display: StageInfo = { ...stageInfo, stepNumber };
    this.sim.setPaused(true);
    const myRunId = this.runId;
    this.stepGate.open(display, {
      onContinue: () => {
        if (myRunId !== this.runId) return;
        this.sim.setPaused(false);
      },
      onAutoPlay: () => {
        if (myRunId !== this.runId) return;
        this.autoPlay = true;
        this.sim.setPaused(false);
      },
      onCancel: () => {
        if (myRunId !== this.runId) return;
        this.cancel();
      },
    });
  }

  private closingHandle: number | null = null;

  private handleClosed(): void {
    if (this.state !== "office") return;
    this.state = "closing";
    this.clearThoughtBulbs();
    this.activityPanel.hide();
    const persona = this.currentPersona;
    this.hud.log(
      `${persona?.name ?? "Customer"} scenario complete`,
      "good",
    );
    this.hooks.updateBannerNarration(
      `${persona?.name ?? "Customer"} — claim closed.`,
    );

    // Resolve outcome from the claim status & show the customer result animation.
    let outcome: ScenarioOutcome = "approved";
    let amount = 0;
    if (this.currentClaimId) {
      const claim = this.sim.getClaim(this.currentClaimId);
      if (claim) {
        amount = claim.amount;
        if (claim.status === "rejected") outcome = "rejected";
        else if (claim.status === "approved") outcome = "approved";
      }
    }
    if (persona) {
      this.resultBanner.show(persona, outcome, amount);
    }

    // After a short hold, show the summary modal. The user dismisses it to
    // fully end the run (and the camera/banner cleanup runs in onSummaryClosed).
    if (this.closingHandle !== null) window.clearTimeout(this.closingHandle);
    const myRunId = this.runId;
    this.closingHandle = window.setTimeout(() => {
      this.closingHandle = null;
      if (myRunId !== this.runId) return;
      this.resultBanner.hide();
      if (persona && this.currentClaimId) {
        this.summaryModal.open(
          {
            scenarioNumber: SCENARIO_NUMBER[persona.id],
            persona,
            claimId: this.currentClaimId,
            amount,
            outcome,
            steps: this.executedSteps,
          },
          () => this.finishScenario(),
        );
      } else {
        this.finishScenario();
      }
    }, 2500);
  }

  /** Final teardown invoked once the user closes the summary modal. */
  private finishScenario(): void {
    this.activityPanel.hide();
    document.body.classList.remove("scenario-active");
    this.releaseFocus();
    this.hooks.hideBanner();
    this.hooks.setSceneToggleDisabled(false);
    this.state = "idle";
    this.currentPersona = null;
    this.currentClaimId = null;
    this.inflightInfo = null;
    this.executedSteps = [];
    this.gatedStagesSeen.clear();
    this.autoPlay = false;
  }

  private releaseFocus(): void {
    this.sim.setHighlightedCharacter(null);
    this.officeCamera.releaseFocus();
    this.nhCamera.releaseFocus();
  }

  private cleanupNeighbourhoodCustomer(): void {
    if (!this.nhCustomer) return;
    this.nhCustomer.setHighlight(false);
    this.nhCustomer.root.dispose();
    this.nhCustomer = null;
    this.nhRoute = [];
  }

  /** Required for use in main.ts dispose flow (currently unused). */
  dispose(): void {
    this.cancel();
    this.focusObserver?.remove();
  }
}

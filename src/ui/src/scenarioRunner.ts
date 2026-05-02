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
  type CustomerPersona,
  type ScenarioId,
} from "./personaData";
import type { IncidentZones } from "./neighbourhoodScene";
import type { HudLogger } from "./hud";
import { PALETTES, VoxelCharacter } from "./voxelCharacter";

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
  private nhTarget: Vector3 | null = null;
  private nhArriveDelay = 0;
  private currentPersona: CustomerPersona | null = null;
  private currentClaimId: string | null = null;
  private inflightInfo: CustomerAgentInfo | null = null;
  private focusObserver: { remove: () => void } | null = null;
  /** Cancellation token incremented to ignore stale callbacks. */
  private runId = 0;

  constructor(
    private readonly nhScene: Scene,
    private readonly officeScene: Scene,
    private readonly nhCamera: CameraDirector,
    private readonly officeCamera: CameraDirector,
    private readonly zones: IncidentZones,
    private readonly sim: ClaimSimulation,
    private readonly hud: HudLogger,
    private readonly hooks: ScenarioRunnerHooks,
  ) {}

  isPlaying(): boolean {
    return this.state !== "idle";
  }

  /**
   * Start a scripted scenario. If `id` is "random", picks one at random.
   */
  start(id: ScenarioId | "random"): void {
    if (this.state !== "idle") return;
    const scenarioId: ScenarioId =
      id === "random"
        ? CUSTOMER_PERSONAS[Math.floor(Math.random() * CUSTOMER_PERSONAS.length)]
            .id
        : id;
    const persona = findCustomerPersona(scenarioId);
    this.currentPersona = persona;
    this.runId++;
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
    this.nhArriveDelay = 2.0;
    this.hooks.updateBannerNarration(
      `${persona.name} — ${persona.situation_long}`,
    );
    this.hud.log(
      `${persona.name} reports ${persona.claim_type} from the neighbourhood`,
      "warn",
    );

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
    this.cleanupNeighbourhoodCustomer();
    this.releaseFocus();
    this.hooks.hideBanner();
    this.hooks.setSceneToggleDisabled(false);
    this.state = "idle";
    this.currentPersona = null;
    this.currentClaimId = null;
    this.inflightInfo = null;
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
        // Begin walking toward the office door.
        this.state = "neighbourhood-walk";
        this.nhTarget = this.zones.officeDoor.clone();
        this.nhWalkRefocusTimer = 0;
        this.nhCustomer?.setWalking(true);
        if (this.currentPersona) {
          this.hooks.updateBannerNarration(
            `${this.currentPersona.name} heads to the Zava Claims Office.`,
          );
          this.hud.log(
            `${this.currentPersona.name} heads to the Zava Claims Office`,
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

  private advanceNhWalk(dtSec: number): void {
    if (!this.nhCustomer || !this.nhTarget) return;
    const speed = 3.2;
    this.nhCustomer.update(dtSec);
    const root = this.nhCustomer.root;
    const dx = this.nhTarget.x - root.position.x;
    const dz = this.nhTarget.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      // Arrived at the office boundary — transition to office.
      this.beginTransition();
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

    // Tear down the neighbourhood customer.
    this.cleanupNeighbourhoodCustomer();

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
  }

  private closingHandle: number | null = null;

  private handleClosed(): void {
    if (this.state !== "office") return;
    this.state = "closing";
    this.hud.log(
      `${this.currentPersona?.name ?? "Customer"} scenario complete`,
      "good",
    );
    this.hooks.updateBannerNarration(
      `${this.currentPersona?.name ?? "Customer"} — claim closed.`,
    );
    // Wait briefly, then release focus and clear the banner.
    if (this.closingHandle !== null) window.clearTimeout(this.closingHandle);
    this.closingHandle = window.setTimeout(() => {
      this.closingHandle = null;
      this.releaseFocus();
      this.hooks.hideBanner();
      this.hooks.setSceneToggleDisabled(false);
      this.state = "idle";
      this.currentPersona = null;
      this.currentClaimId = null;
      this.inflightInfo = null;
    }, 2500);
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
    this.nhTarget = null;
  }

  /** Required for use in main.ts dispose flow (currently unused). */
  dispose(): void {
    this.cancel();
    this.focusObserver?.remove();
  }
}

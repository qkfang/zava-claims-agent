import {
  Color3,
  Mesh,
  MeshBuilder,
  Observable,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { OfficeLayout } from "./officeScene";
import { PALETTES, VoxelCharacter, type VoxelCharacterPalette } from "./voxelCharacter";
import {
  CUSTOMER_PERSONAS,
  STAFF_PERSONAS,
  findCustomerPersona,
  findStaffByRole,
  type CustomerPersona,
  type ScenarioId,
  type StaffPersona,
} from "./personaData";
import { getScenario } from "./scenarios";

/**
 * Claims-industry staff roles, mirroring the cast in
 * `docs/characters.md` and the departments in `res/img-office.png`.
 */
export type AgentRole =
  | "Claims Intake Officer"
  | "Claims Assessor"
  | "Loss Adjuster"
  | "Fraud Investigator"
  | "Supplier Coordinator"
  | "Settlement Officer"
  | "Customer Communications Specialist"
  | "Claims Team Leader";

export type ClaimStatus =
  | "submitted"
  | "intake"
  | "assessing"
  | "assessed"
  | "settling"
  | "approved"
  | "rejected"
  | "communicating"
  | "closed";

export interface Claim {
  id: string;
  type: string;
  amount: number;
  status: ClaimStatus;
  /** The visible folder mesh that travels with the claim. */
  mesh: Mesh;
  /**
   * Optional scripted scenario data. Present only on claims started via
   * `startScripted` — drives deterministic outcomes and inserts extra
   * "consultation" beats with ambient staff (Loss Adjuster, Fraud,
   * Supplier Coordinator, Team Leader) between assessor and settlement.
   */
  script?: ClaimScript;
  /**
   * Identifier of the staff member currently holding / processing the
   * claim folder. `null` means the folder is on a desk/inbox/archive.
   */
  currentHolderId: string | null;
}

export type ScriptOutcome = "approved" | "rejected" | "partial";

export interface ScriptExtraBeat {
  role: AgentRole;
  narration: string;
  /** Seconds the ambient staff member dwells on the folder. */
  duration: number;
}

export interface ClaimScript {
  scenarioId: ScenarioId;
  /**
   * Fixed claim id used for the spawned customer's claim folder. Mirrors
   * the seeded record in the backend so the on-screen claim id matches
   * the mock data shown on the agent demo pages.
   */
  caseId: string;
  /** Force assessor to approve (true) or reject (false). */
  approveAtAssessor: boolean;
  /** Sequential extra consultations between assessor approval & settlement. */
  extras: ScriptExtraBeat[];
  /** Extra consultations to run BEFORE the assessor (e.g. Team Leader for life). */
  preAssessor: ScriptExtraBeat[];
  /** Final settlement outcome — overrides the random roll. */
  settlement: ScriptOutcome;
  /** Narration used when assessor processes the claim. */
  assessorNarration?: string;
  /** Narration used when settlement decision is made. */
  settlementNarration?: string;
  /** Narration used when comms notifies the customer. */
  commsNarration?: string;
  /** Hex color used for log entries / banner. */
  color: string;
  /** Persona name shown in banner. */
  personaName: string;
  /** Fired when the camera focus should change. */
  onFocusChange?: (info: BeatFocusInfo) => void;
  /** Fired once when the scripted claim is fully closed. */
  onClosed?: () => void;
}

export interface BeatFocusInfo {
  /** Stable id of the staff/customer the camera should follow. */
  characterId: string;
  /** Activity-log narration for this beat. */
  narration: string;
  /** Pipeline stage label. */
  stage: string;
}

/**
 * Customer claim scenarios — each one matches a customer persona from
 * `docs/characters.md`. Backed by `personaData.ts` so the simulation,
 * profile cards, and scenario picker stay in sync.
 */
const CUSTOMER_SCENARIOS: Array<{
  id: ScenarioId;
  persona: string;
  palette: keyof typeof PALETTES;
  type: string;
  min: number;
  max: number;
}> = CUSTOMER_PERSONAS.map((p) => ({
  id: p.id,
  persona: p.name,
  palette: p.palette as keyof typeof PALETTES,
  type: p.claim_type,
  min: p.amount_min,
  max: p.amount_max,
}));

/** Unique ID counter — small + readable for the activity log. */
let nextClaimNum = 1001;

/** Logger contract used by the simulation. */
export interface SimLogger {
  setMetric(name: "submitted" | "processing" | "approved" | "rejected", value: number): void;
  log(message: string, kind?: "info" | "good" | "bad" | "warn"): void;
  setAgentStatus(id: string, busy: boolean, activity: string): void;
  registerAgent(info: { id: string; name: string; role: AgentRole; color: string; palette: VoxelCharacterPalette }): void;
}

/** Move a transform along XZ toward `target` at a given speed (m/s). */
function moveToward(
  node: TransformNode,
  target: Vector3,
  speed: number,
  dtSec: number,
): boolean {
  const dx = target.x - node.position.x;
  const dz = target.z - node.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) {
    node.position.x = target.x;
    node.position.z = target.z;
    return true;
  }
  const step = Math.min(dist, speed * dtSec);
  const nx = dx / dist;
  const nz = dz / dist;
  node.position.x += nx * step;
  node.position.z += nz * step;
  // Face direction of travel
  node.rotation.y = Math.atan2(nx, nz);
  return false;
}

/** Tasks that processing staff agents can be assigned to. */
type Task =
  | { kind: "idle" }
  | { kind: "pickup"; claim: Claim }
  | { kind: "assess"; claim: Claim }
  | { kind: "carry-to-settlement"; claim: Claim }
  | { kind: "settle"; claim: Claim }
  | { kind: "carry-to-comms"; claim: Claim }
  | { kind: "communicate"; claim: Claim }
  /** Ambient staff consult on a scripted claim (Loss Adjuster, Fraud, etc). */
  | { kind: "consult"; claim: Claim; beat: ScriptExtraBeat };

interface StaffAgent {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  character: VoxelCharacter;
  homePoint: Vector3;
  task: Task;
  /** Time remaining (sec) for the current "processing" sub-state. */
  processTimer: number;
  /** Current intermediate target while moving. */
  moveTarget: Vector3 | null;
  /** Optional callback invoked once we reach moveTarget. */
  onArrive: (() => void) | null;
  /** True for staff that participate in the active claim pipeline. */
  active: boolean;
  /** Rotating status messages used by ambient staff. */
  ambientMessages?: string[];
  ambientIndex?: number;
  ambientTimer?: number;
  /** Ring buffer of recent claim ids this staff member has touched. */
  claimsHistory: string[];
  /** Persona record (typical line, personality, etc) for profile card. */
  persona: StaffPersona;
}

interface CustomerAgent {
  character: VoxelCharacter;
  claim: Claim;
  persona: string;
  /** Customer persona id (if known) — used by profile card. */
  personaId?: ScenarioId;
  state: "entering" | "to-reception" | "leaving" | "done";
  moveTarget: Vector3;
}

/**
 * Top-level simulation: customers spawn, drop claims at reception, the
 * Claims Intake Officer routes them through Claims Assessor → Settlement
 * Officer → Customer Communications Specialist. Loss Adjuster, Fraud
 * Investigator, Supplier Coordinator and Team Leader are visible at their
 * desks with rotating ambient status to reinforce the office metaphor.
 */
export class ClaimSimulation {
  private readonly scene: Scene;
  private readonly layout: OfficeLayout;
  private readonly logger: SimLogger;

  private readonly staff: StaffAgent[] = [];
  private readonly customers: CustomerAgent[] = [];

  /** Claims sitting in the intake inbox awaiting pickup. */
  private readonly inbox: Claim[] = [];
  /** Claims that have been assessed, awaiting a Settlement Officer pickup. */
  private readonly settlementQueue: Claim[] = [];
  /** Claims waiting for Customer Communications (approved or rejected). */
  private readonly communicationsQueue: Claim[] = [];

  private spawnTimer = 1.5;
  private autoSpawnPaused = false;
  private paused = false;
  private metrics = { submitted: 0, processing: 0, approved: 0, rejected: 0 };

  /** Track every claim that has touched the office, by id. */
  private readonly claimsById = new Map<string, Claim>();
  /** Customer agents indexed by their character.id (e.g. "cust_C-1001"). */
  private readonly customersByCharId = new Map<string, CustomerAgent>();

  /** Observable fired when a scripted claim's focus character changes. */
  readonly onScriptFocusChange = new Observable<BeatFocusInfo>();

  /** The currently highlighted character (hover or click), or null. */
  private highlightedId: string | null = null;

  constructor(scene: Scene, layout: OfficeLayout, logger: SimLogger) {
    this.scene = scene;
    this.layout = layout;
    this.logger = logger;
    this.spawnStaff();
  }

  private spawnStaff(): void {
    /** Map StaffPersona to its desk position from the office layout. */
    const homeFor = (role: AgentRole): Vector3 => {
      switch (role) {
        case "Claims Intake Officer":
          return this.layout.intakeDeskPoint;
        case "Claims Assessor":
          return this.layout.assessorDeskPoint;
        case "Loss Adjuster":
          return this.layout.lossAdjusterDeskPoint;
        case "Fraud Investigator":
          return this.layout.fraudDeskPoint;
        case "Supplier Coordinator":
          return this.layout.supplierDeskPoint;
        case "Settlement Officer":
          return this.layout.settlementDeskPoint;
        case "Customer Communications Specialist":
          return this.layout.communicationsDeskPoint;
        case "Claims Team Leader":
          return this.layout.teamLeaderDeskPoint;
      }
    };

    for (const persona of STAFF_PERSONAS) {
      const home = homeFor(persona.role);
      const palette = PALETTES[persona.palette];
      const ch = new VoxelCharacter(this.scene, persona.id, palette);
      ch.root.position = home.clone();
      ch.root.position.y = 0.2;
      const agent: StaffAgent = {
        id: persona.id,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        character: ch,
        homePoint: home.clone(),
        task: { kind: "idle" },
        processTimer: 0,
        moveTarget: null,
        onArrive: null,
        active: persona.active_in_pipeline,
        ambientMessages: persona.active_in_pipeline ? undefined : persona.ambient,
        ambientIndex: 0,
        ambientTimer: 3 + Math.random() * 4,
        claimsHistory: [],
        persona,
      };
      this.staff.push(agent);
      this.logger.registerAgent({
        id: persona.id,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        palette,
      });
      const initialStatus = persona.ambient[0] ?? "Awaiting next claim";
      this.logger.setAgentStatus(persona.id, false, initialStatus);
    }
  }

  /** Spawn a new customer with a fresh claim folder. */
  spawnCustomer(scenarioId?: ScenarioId, script?: ClaimScript): CustomerAgent {
    const scenario = scenarioId
      ? CUSTOMER_SCENARIOS.find((s) => s.id === scenarioId) ??
        CUSTOMER_SCENARIOS[0]
      : CUSTOMER_SCENARIOS[Math.floor(Math.random() * CUSTOMER_SCENARIOS.length)];
    const amount = Math.round(
      scenario.min + Math.random() * (scenario.max - scenario.min),
    );
    const claimId = script?.caseId ?? `C-${nextClaimNum++}`;
    const claim: Claim = {
      id: claimId,
      type: scenario.type,
      amount,
      status: "submitted",
      mesh: this.makeClaimFolder(claimId),
      currentHolderId: null,
      script,
    };
    this.claimsById.set(claimId, claim);

    const palette = PALETTES[scenario.palette];
    const ch = new VoxelCharacter(this.scene, `cust_${claimId}`, palette);
    ch.root.position = this.layout.spawnPoint.clone();
    ch.root.position.y = 0.2;
    // Slight lateral jitter so they don't overlap (only for unscripted spawns)
    if (!script) {
      ch.root.position.x += (Math.random() - 0.5) * 1.5;
    }

    // Customer carries the folder until they reach reception.
    claim.mesh.parent = ch.getHandAnchor();
    claim.mesh.position = Vector3.Zero();
    claim.mesh.rotation = Vector3.Zero();
    claim.currentHolderId = ch.id;

    const customer: CustomerAgent = {
      character: ch,
      claim,
      persona: scenario.persona,
      personaId: scenario.id,
      state: "entering",
      moveTarget: this.layout.entrancePoint.clone(),
    };
    ch.setWalking(true);
    // Scripted customers continue the same urgent run they used to cross
    // the neighbourhood — they sprint through the door and across the
    // lobby to reception, then drop back to a normal walk on the way out.
    if (script) {
      ch.setRunning(true);
    }
    this.customers.push(customer);
    this.customersByCharId.set(ch.id, customer);

    this.metrics.submitted++;
    this.metrics.processing++;
    this.pushMetrics();
    this.logger.log(
      `${scenario.persona} arrived with claim ${claim.id} — ${claim.type}, $${claim.amount.toLocaleString()}`,
      script ? "warn" : "info",
    );
    if (script) {
      this.fireFocusChange(claim, ch.id, "customer-arrives", `${scenario.persona} arrived at the office`);
    }
    return customer;
  }

  private makeClaimFolder(id: string): Mesh {
    const folder = MeshBuilder.CreateBox(
      `folder_${id}`,
      { width: 0.32, height: 0.06, depth: 0.42 },
      this.scene,
    );
    const mat = new StandardMaterial(`folderMat_${id}`, this.scene);
    // Random-ish folder color (manila / blue / red)
    const palette = ["#e8c069", "#d4584b", "#5a8fcf", "#7a9c5a"];
    mat.diffuseColor = Color3.FromHexString(
      palette[Math.floor(Math.random() * palette.length)],
    );
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    folder.material = mat;
    return folder;
  }

  /** Per-frame tick. */
  update(dtSec: number): void {
    if (this.paused) return;
    // Auto-spawn customers periodically (paused during scripted scenarios).
    if (!this.autoSpawnPaused) {
      this.spawnTimer -= dtSec;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 6 + Math.random() * 6;
        this.spawnCustomer();
      }
    }

    this.updateCustomers(dtSec);
    this.updateStaff(dtSec);
    this.updateAmbient(dtSec);
  }

  private updateCustomers(dtSec: number): void {
    const customerWalkSpeed = 2.2;
    const customerRunSpeed = 4.4;
    for (const c of this.customers) {
      if (c.state === "done") continue;
      c.character.update(dtSec);
      // Scripted customers (claim.script) sprint into the building and
      // across the lobby; ambient customers stroll at normal pace.
      const running = !!c.claim.script && (c.state === "entering" || c.state === "to-reception");
      const speed = running ? customerRunSpeed : customerWalkSpeed;
      const arrived = moveToward(
        c.character.root,
        c.moveTarget,
        speed,
        dtSec,
      );
      if (!arrived) continue;

      switch (c.state) {
        case "entering":
          c.state = "to-reception";
          c.moveTarget = this.layout.receptionPoint.clone();
          break;
        case "to-reception": {
          // Drop folder on the inbox tray.
          c.character.setWalking(false);
          const folder = c.claim.mesh;
          folder.parent = null;
          folder.position = this.layout.inboxPoint.clone();
          // Stack folders slightly so they don't overlap.
          folder.position.y += this.inbox.length * 0.07;
          this.inbox.push(c.claim);
          c.claim.currentHolderId = null;
          this.logger.log(
            `Claim ${c.claim.id} lodged at reception by ${c.persona}`,
            c.claim.script ? "warn" : "info",
          );
          if (c.claim.script) {
            this.fireFocusChange(
              c.claim,
              "intake-1",
              "lodge-at-reception",
              `${c.persona} lodged claim ${c.claim.id} at reception`,
            );
          }
          c.state = "leaving";
          c.moveTarget = this.layout.exitPoint.clone();
          c.character.setRunning(false);
          c.character.setWalking(true);
          break;
        }
        case "leaving":
          c.state = "done";
          c.character.setWalking(false);
          this.customersByCharId.delete(c.character.id);
          c.character.root.dispose();
          break;
      }
    }
    // Compact the customer array occasionally
    if (this.customers.length > 0 && this.customers[0].state === "done") {
      for (let i = this.customers.length - 1; i >= 0; i--) {
        if (this.customers[i].state === "done") this.customers.splice(i, 1);
      }
    }
  }

  private updateStaff(dtSec: number): void {
    const speed = 2.6;
    for (const s of this.staff) {
      if (!s.active) continue;
      s.character.update(dtSec);

      // Try to assign tasks to idle staff.
      if (s.task.kind === "idle") {
        this.tryAssignTask(s);
      }

      if (s.moveTarget) {
        s.character.setWalking(true);
        const arrived = moveToward(s.character.root, s.moveTarget, speed, dtSec);
        if (arrived) {
          s.moveTarget = null;
          s.character.setWalking(false);
          const cb = s.onArrive;
          s.onArrive = null;
          if (cb) cb();
        }
      } else if (s.processTimer > 0) {
        s.processTimer -= dtSec;
        if (s.processTimer <= 0) {
          this.completeProcessingStep(s);
        }
      }
    }
  }

  /** Cycle ambient (non-pipeline) staff through their rotating activities. */
  private updateAmbient(dtSec: number): void {
    for (const s of this.staff) {
      if (s.active || !s.ambientMessages || s.ambientMessages.length === 0) {
        continue;
      }
      s.character.update(dtSec);
      s.ambientTimer = (s.ambientTimer ?? 0) - dtSec;
      if (s.ambientTimer <= 0) {
        s.ambientIndex = ((s.ambientIndex ?? 0) + 1) % s.ambientMessages.length;
        s.ambientTimer = 4 + Math.random() * 4;
        this.logger.setAgentStatus(s.id, false, s.ambientMessages[s.ambientIndex]);
      }
    }
  }

  private tryAssignTask(s: StaffAgent): void {
    if (s.role === "Claims Intake Officer" && this.inbox.length > 0) {
      const claim = this.inbox.shift()!;
      s.task = { kind: "pickup", claim };
      this.recordClaim(s, claim);
      this.logger.setAgentStatus(s.id, true, `Picking up ${claim.id}`);
      if (claim.script) {
        this.fireFocusChange(claim, s.id, "intake-pickup", `Iris picks up claim ${claim.id}`);
      }
      this.gotoAndThen(s, this.layout.inboxPoint, () => {
        // Take folder
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.mesh.rotation = Vector3.Zero();
        claim.currentHolderId = s.id;
        // Walk to assessor desk and drop on assessor's inbox.
        claim.status = "intake";
        this.logger.log(
          `Claims Intake routed ${claim.id} to Claims Assessor`,
          claim.script ? "warn" : "info",
        );
        s.task = { kind: "assess", claim };
        this.logger.setAgentStatus(s.id, true, `Routing ${claim.id}`);
        if (claim.script) {
          this.fireFocusChange(claim, s.id, "intake-route", `Iris routes ${claim.id} to the Claims Assessor`);
        }
        const dropPoint = this.layout.assessorDeskPoint.clone();
        dropPoint.z -= 1.4; // approach side of desk
        this.gotoAndThen(s, dropPoint, () => {
          // Drop claim on assessor desk top
          const drop = this.layout.assessorDeskPoint.clone();
          drop.y = 1.0;
          drop.z += 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = drop;
          claim.mesh.rotation = Vector3.Zero();
          claim.currentHolderId = null;
          claim.status = "assessing";
          // For "life" scenario, run any pre-assessor consultations (Team Leader)
          // before handing off to the assessor.
          if (claim.script && claim.script.preAssessor.length > 0) {
            const beat = claim.script.preAssessor.shift()!;
            this.startConsultation(claim, beat);
          } else {
            // Hand off to assessor queue (assessor will pick it up).
            this.handoffForAssessor(claim);
          }
          // Intake officer returns home.
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
          });
        });
      });
      return;
    }

    if (s.role === "Claims Assessor") {
      // Assessor picks claims that have been routed to its desk.
      const claim = this.popAssessorReady();
      if (!claim) return;
      s.task = { kind: "assess", claim };
      this.recordClaim(s, claim);
      this.logger.setAgentStatus(s.id, true, `Assessing ${claim.id}`);
      this.logger.log(
        claim.script?.assessorNarration ??
          `Claims Assessor inspecting ${claim.id} (${claim.type})`,
        claim.script ? "warn" : "info",
      );
      if (claim.script) {
        this.fireFocusChange(claim, s.id, "assessor-pickup", `Adam begins assessing ${claim.id}`);
      }
      // Pick up folder from desk
      const pickupPoint = this.layout.assessorDeskPoint.clone();
      pickupPoint.z -= 1.0;
      this.gotoAndThen(s, pickupPoint, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.currentHolderId = s.id;
        // Sit at desk for a "processing" beat
        this.gotoAndThen(s, s.homePoint, () => {
          s.processTimer = claim.script ? 2.5 : 2.5 + Math.random() * 2.0;
        });
      });
      return;
    }

    if (s.role === "Settlement Officer" && this.settlementQueue.length > 0) {
      const claim = this.settlementQueue.shift()!;
      s.task = { kind: "settle", claim };
      this.recordClaim(s, claim);
      this.logger.setAgentStatus(s.id, true, `Reviewing ${claim.id}`);
      this.logger.log(
        claim.script?.settlementNarration ??
          `Settlement Officer reviewing ${claim.id} for payout`,
        claim.script ? "warn" : "info",
      );
      if (claim.script) {
        this.fireFocusChange(claim, s.id, "settle", `Seth reviews ${claim.id} for settlement`);
      }
      const pickup = this.layout.settlementDeskPoint.clone();
      pickup.z -= 1.0;
      this.gotoAndThen(s, pickup, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.currentHolderId = s.id;
        this.gotoAndThen(s, s.homePoint, () => {
          s.processTimer = claim.script ? 2.5 : 2.5 + Math.random() * 2.0;
        });
      });
      return;
    }

    if (
      s.role === "Customer Communications Specialist" &&
      this.communicationsQueue.length > 0
    ) {
      const claim = this.communicationsQueue.shift()!;
      s.task = { kind: "communicate", claim };
      this.recordClaim(s, claim);
      this.logger.setAgentStatus(s.id, true, `Notifying customer for ${claim.id}`);
      if (claim.script) {
        this.fireFocusChange(claim, s.id, "comms-notify", `Cara notifies the customer for ${claim.id}`);
      }
      // Pick from settlement desk.
      const pickup = this.layout.settlementDeskPoint.clone();
      pickup.z -= 1.0;
      this.gotoAndThen(s, pickup, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.currentHolderId = s.id;
        // Walk to comms desk and place folder in archive (closed file).
        this.gotoAndThen(s, this.layout.communicationsDeskPoint, () => {
          const slot = this.layout.archivePoint.clone();
          slot.x += (Math.random() - 0.5) * 1.5;
          slot.z += (Math.random() - 0.5) * 0.8;
          slot.y += Math.random() * 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = slot;
          claim.mesh.rotation = new Vector3(0, Math.random() * Math.PI, 0);
          claim.currentHolderId = null;
          claim.status = "closed";
          this.logger.log(
            claim.script?.commsNarration ??
              `Customer notified — claim ${claim.id} closed`,
            "good",
          );
          s.task = { kind: "idle" };
          this.metrics.processing = Math.max(0, this.metrics.processing - 1);
          this.pushMetrics();
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
          });
          // Notify scenario runner that the scripted claim is fully closed.
          if (claim.script) {
            const onClosed = claim.script.onClosed;
            // Defer slightly so the comms beat reads naturally.
            setTimeout(() => onClosed?.(), 600);
          }
        });
      });
      return;
    }
  }

  /** Assessor desk inbox state — at most one claim awaiting assessment. */
  private assessorReady: Claim | null = null;
  private handoffForAssessor(claim: Claim): void {
    this.assessorReady = claim;
  }
  private popAssessorReady(): Claim | null {
    if (!this.assessorReady) return null;
    const c = this.assessorReady;
    this.assessorReady = null;
    return c;
  }

  private completeProcessingStep(s: StaffAgent): void {
    const t = s.task;
    if (t.kind === "assess") {
      const claim = t.claim;
      // Scripted claims use deterministic outcome; otherwise 85% pass.
      const valid = claim.script
        ? claim.script.approveAtAssessor
        : Math.random() < 0.85;
      if (valid) {
        claim.status = "assessed";
        this.logger.log(
          `Claims Assessor cleared ${claim.id} — forwarding to Settlement`,
          "good",
        );
        if (claim.script) {
          this.fireFocusChange(claim, s.id, "assessor-process", `Adam cleared ${claim.id}`);
        }
        // Scripted claim with extras — run the next consultation before settlement.
        if (claim.script && claim.script.extras.length > 0) {
          // Drop folder back on assessor desk so the consultant can pick it up.
          const drop = this.layout.assessorDeskPoint.clone();
          drop.y = 1.0;
          drop.z += 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = drop;
          claim.mesh.rotation = Vector3.Zero();
          claim.currentHolderId = null;
          // Assessor returns home; consultation runs in parallel.
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Awaiting consultation");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting consultation");
          });
          const beat = claim.script.extras.shift()!;
          this.startConsultation(claim, beat);
          return;
        }
        // Carry folder to settlement desk.
        s.task = { kind: "carry-to-settlement", claim };
        this.logger.setAgentStatus(s.id, true, `Hand-off ${claim.id}`);
        const drop = this.layout.settlementDeskPoint.clone();
        drop.z -= 1.4;
        this.gotoAndThen(s, drop, () => {
          const placed = this.layout.settlementDeskPoint.clone();
          placed.y = 1.0;
          placed.z += 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = placed;
          claim.mesh.rotation = Vector3.Zero();
          claim.currentHolderId = null;
          this.settlementQueue.push(claim);
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
          });
        });
      } else {
        // Rejected at assessment — send straight to communications.
        claim.status = "rejected";
        this.metrics.rejected++;
        this.pushMetrics();
        this.logger.log(
          `Claims Assessor declined ${claim.id} (missing documents)`,
          "bad",
        );
        s.task = { kind: "carry-to-comms", claim };
        this.logger.setAgentStatus(s.id, true, `Hand-off ${claim.id}`);
        const drop = this.layout.settlementDeskPoint.clone();
        drop.z -= 1.4;
        this.gotoAndThen(s, drop, () => {
          const placed = this.layout.settlementDeskPoint.clone();
          placed.y = 1.0;
          placed.z += 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = placed;
          claim.mesh.rotation = Vector3.Zero();
          claim.currentHolderId = null;
          this.communicationsQueue.push(claim);
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
          });
        });
      }
    } else if (t.kind === "settle") {
      const claim = t.claim;
      let outcome: "approved" | "rejected" | "partial";
      if (claim.script) {
        outcome = claim.script.settlement;
      } else {
        const approveProb =
          claim.amount < 5000 ? 0.9 : claim.amount < 12000 ? 0.7 : 0.4;
        outcome = Math.random() < approveProb ? "approved" : "rejected";
      }
      if (outcome === "approved" || outcome === "partial") {
        claim.status = "approved";
        this.metrics.approved++;
        const tag = outcome === "partial" ? " (partial)" : "";
        this.logger.log(
          `Settlement APPROVED${tag} ${claim.id} — payout $${claim.amount.toLocaleString()}`,
          "good",
        );
      } else {
        claim.status = "rejected";
        this.metrics.rejected++;
        this.logger.log(
          `Settlement DECLINED ${claim.id} (escalated for review)`,
          "bad",
        );
      }
      this.pushMetrics();
      // Drop on desk for comms pickup
      const drop = this.layout.settlementDeskPoint.clone();
      drop.y = 1.0;
      drop.z += 0.4;
      claim.mesh.parent = null;
      claim.mesh.position = drop;
      claim.mesh.rotation = Vector3.Zero();
      claim.currentHolderId = null;
      this.communicationsQueue.push(claim);
      s.task = { kind: "idle" };
      this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
    } else if (t.kind === "consult") {
      // An ambient staff member finished a scripted consultation: drop the
      // folder back on the assessor's desk and run the next extra (if any),
      // otherwise queue for assessor handoff.
      const claim = t.claim;
      const drop = this.layout.assessorDeskPoint.clone();
      drop.y = 1.0;
      drop.z += 0.4;
      claim.mesh.parent = null;
      claim.mesh.position = drop;
      claim.mesh.rotation = Vector3.Zero();
      claim.currentHolderId = null;
      s.task = { kind: "idle" };
      this.logger.setAgentStatus(s.id, false, s.persona.ambient[0] ?? "Awaiting next claim");
      // Send consultant home, then return them to ambient (non-pipeline) state.
      this.gotoAndThen(s, s.homePoint, () => {
        s.active = false;
        this.logger.setAgentStatus(s.id, false, s.persona.ambient[0] ?? "Awaiting next claim");
      });
      if (claim.script && claim.script.extras.length > 0) {
        const beat = claim.script.extras.shift()!;
        this.startConsultation(claim, beat);
      } else {
        // All extras done — queue claim for the Claims Assessor to hand off
        // to settlement. We re-route via the assessor by adding a synthetic
        // "carry-to-settlement" task: simpler is to push directly into the
        // settlement queue (folder is already on assessor desk; we relocate
        // it). We let the assessor handle it.
        const assessor = this.staff.find(
          (x) => x.role === "Claims Assessor",
        );
        if (assessor && assessor.task.kind === "idle") {
          // Assessor picks it back up and carries to settlement.
          assessor.task = { kind: "assess", claim };
          this.recordClaim(assessor, claim);
          this.logger.setAgentStatus(
            assessor.id,
            true,
            `Hand-off ${claim.id}`,
          );
          if (claim.script) {
            this.fireFocusChange(claim, assessor.id, "assessor-handoff", `Adam hands ${claim.id} to Settlement`);
          }
          const pickup = this.layout.assessorDeskPoint.clone();
          pickup.z -= 1.0;
          this.gotoAndThen(assessor, pickup, () => {
            claim.mesh.parent = assessor.character.getHandAnchor();
            claim.mesh.position = Vector3.Zero();
            claim.currentHolderId = assessor.id;
            // Now carry to settlement
            const dropPos = this.layout.settlementDeskPoint.clone();
            dropPos.z -= 1.4;
            this.gotoAndThen(assessor, dropPos, () => {
              const placed = this.layout.settlementDeskPoint.clone();
              placed.y = 1.0;
              placed.z += 0.4;
              claim.mesh.parent = null;
              claim.mesh.position = placed;
              claim.mesh.rotation = Vector3.Zero();
              claim.currentHolderId = null;
              this.settlementQueue.push(claim);
              assessor.task = { kind: "idle" };
              this.logger.setAgentStatus(
                assessor.id,
                false,
                "Returning to desk",
              );
              this.gotoAndThen(assessor, assessor.homePoint, () => {
                this.logger.setAgentStatus(
                  assessor.id,
                  false,
                  "Awaiting next claim",
                );
              });
            });
          });
        }
      }
    }
  }

  /**
   * Start a scripted consultation: an ambient staff member walks to the
   * assessor's desk, picks up the folder, walks back to their own desk,
   * dwells for `beat.duration` seconds, then walks back and drops the
   * folder on the assessor's desk so the next step can run.
   */
  private startConsultation(claim: Claim, beat: ScriptExtraBeat): void {
    const consultant = this.staff.find((x) => x.role === beat.role);
    if (!consultant) return;
    // Temporarily activate this consultant so the staff updater drives it.
    consultant.active = true;
    consultant.task = { kind: "consult", claim, beat };
    this.recordClaim(consultant, claim);
    this.logger.setAgentStatus(consultant.id, true, beat.narration);
    this.logger.log(beat.narration, claim.script ? "warn" : "info");
    if (claim.script) {
      this.fireFocusChange(
        claim,
        consultant.id,
        `consult:${beat.role}`,
        beat.narration,
      );
    }
    // Walk to assessor desk to pick up
    const pickup = this.layout.assessorDeskPoint.clone();
    pickup.z -= 1.0;
    this.gotoAndThen(consultant, pickup, () => {
      claim.mesh.parent = consultant.character.getHandAnchor();
      claim.mesh.position = Vector3.Zero();
      claim.currentHolderId = consultant.id;
      // Walk back to consultant's own desk
      this.gotoAndThen(consultant, consultant.homePoint, () => {
        consultant.processTimer = beat.duration;
      });
    });
  }

  private gotoAndThen(
    s: StaffAgent,
    target: Vector3,
    onArrive: () => void,
  ): void {
    s.moveTarget = target.clone();
    s.moveTarget.y = 0.2;
    s.onArrive = onArrive;
  }

  private pushMetrics(): void {
    this.logger.setMetric("submitted", this.metrics.submitted);
    this.logger.setMetric("processing", this.metrics.processing);
    this.logger.setMetric("approved", this.metrics.approved);
    this.logger.setMetric("rejected", this.metrics.rejected);
  }

  /* ---------------------------------------------------------------- */
  /* Helpers used internally for scripted scenarios + profile cards    */
  /* ---------------------------------------------------------------- */

  private recordClaim(s: StaffAgent, claim: Claim): void {
    if (s.claimsHistory[0] === claim.id) return;
    s.claimsHistory.unshift(claim.id);
    if (s.claimsHistory.length > 8) s.claimsHistory.length = 8;
  }

  private fireFocusChange(
    claim: Claim,
    characterId: string,
    stage: string,
    narration: string,
  ): void {
    const info: BeatFocusInfo = { characterId, stage, narration };
    this.onScriptFocusChange.notifyObservers(info);
    claim.script?.onFocusChange?.(info);
  }

  /* ---------------------------------------------------------------- */
  /* Public API used by main.ts / scenarioRunner / profileCard         */
  /* ---------------------------------------------------------------- */

  /** Look up a claim by id. */
  getClaim(id: string): { id: string; type: string; amount: number; status: ClaimStatus } | null {
    const c = this.claimsById.get(id);
    if (!c) return null;
    return { id: c.id, type: c.type, amount: c.amount, status: c.status };
  }

  /** True if auto-spawning of random customers is currently paused. */
  isAutoSpawnPaused(): boolean {
    return this.autoSpawnPaused;
  }
  pauseAutoSpawn(): void {
    this.autoSpawnPaused = true;
  }
  resumeAutoSpawn(): void {
    this.autoSpawnPaused = false;
    this.spawnTimer = 8 + Math.random() * 4;
  }

  /**
   * Pause / resume the entire simulation tick (used by the step gate to
   * freeze movement and processing while the user reads the popup).
   */
  setPaused(p: boolean): void {
    this.paused = p;
  }
  isPaused(): boolean {
    return this.paused;
  }

  /** Look up a staff member by their stable id. */
  getStaff(id: string): {
    id: string;
    name: string;
    role: AgentRole;
    color: string;
    character: VoxelCharacter;
    homePoint: Vector3;
  } | undefined {
    const s = this.staff.find((x) => x.id === id);
    if (!s) return undefined;
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      color: s.color,
      character: s.character,
      homePoint: s.homePoint.clone(),
    };
  }

  /** Look up a staff member by role. */
  getStaffByRole(role: AgentRole): ReturnType<ClaimSimulation["getStaff"]> {
    const s = this.staff.find((x) => x.role === role);
    if (!s) return undefined;
    return this.getStaff(s.id);
  }

  /** Returns the VoxelCharacter for a given id (staff or customer). */
  getCharacterById(id: string): VoxelCharacter | null {
    const s = this.staff.find((x) => x.id === id);
    if (s) return s.character;
    const c = this.customersByCharId.get(id);
    if (c) return c.character;
    return null;
  }

  /** Highlight a single character (typically the camera-focus target). */
  setHighlightedCharacter(id: string | null): void {
    if (this.highlightedId === id) return;
    if (this.highlightedId) {
      const prev = this.getCharacterById(this.highlightedId);
      prev?.setHighlight(false);
    }
    this.highlightedId = id;
    if (id) {
      const ch = this.getCharacterById(id);
      ch?.setHighlight(true);
    }
  }

  /** Returns the id of the currently scripted-highlighted character, or null. */
  getHighlightedCharacter(): string | null {
    return this.highlightedId;
  }

  /** Returns the office layout reference points (for scenarioRunner). */
  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Make a profile-card view-model for the clicked character. */
  getCharacterProfile(id: string): CharacterProfile | null {
    const staff = this.staff.find((x) => x.id === id);
    if (staff) {
      const heldClaim = this.findClaimHeldBy(id);
      const claims = staff.claimsHistory
        .map((cid) => this.claimsById.get(cid))
        .filter((c): c is Claim => !!c)
        .map((c) => ({
          id: c.id,
          type: c.type,
          status: c.status,
        }));
      return {
        kind: "staff",
        id: staff.id,
        name: staff.name,
        role: staff.role,
        color: staff.color,
        palette: PALETTES[staff.persona.palette],
        personality: staff.persona.personality,
        typicalLine: staff.persona.typical_line,
        responsibilities: staff.persona.responsibilities,
        situation: staff.persona.role_short,
        current: heldClaim
          ? `Holding ${heldClaim.id} — ${heldClaim.type}`
          : describeTask(staff.task),
        icon: staff.persona.icon,
        claims,
        scenarioName: "",
        currentHandler: null,
        activeClaim: null,
      };
    }

    const customer = this.customersByCharId.get(id);
    if (customer) {
      const persona = customer.personaId
        ? findCustomerPersona(customer.personaId)
        : undefined;
      const handler = customer.claim.currentHolderId
        ? this.staff.find((x) => x.id === customer.claim.currentHolderId)
        : undefined;
      return {
        kind: "customer",
        id: customer.character.id,
        name: customer.persona,
        role: persona?.claim_type ?? customer.claim.type,
        color: persona?.color ?? "#6e7a8a",
        palette: PALETTES[(persona?.palette ?? "customerHome") as keyof typeof PALETTES],
        personality: persona?.personality ?? "",
        typicalLine: persona?.typical_line ?? "",
        responsibilities: persona?.need ?? [],
        situation: persona?.situation_long ?? "",
        current: describeCustomerState(customer),
        icon: null,
        claims: [
          {
            id: customer.claim.id,
            type: customer.claim.type,
            status: customer.claim.status,
          },
        ],
        scenarioName: persona?.claim_type ?? "Customer",
        currentHandler: handler ? `${handler.name} — ${handler.role}` : null,
        activeClaim: {
          id: customer.claim.id,
          type: customer.claim.type,
          amount: customer.claim.amount,
          status: customer.claim.status,
        },
      };
    }

    return null;
  }

  private findClaimHeldBy(id: string): Claim | undefined {
    for (const c of this.claimsById.values()) {
      if (c.currentHolderId === id) return c;
    }
    return undefined;
  }

  /**
   * Snap the office back to a clean baseline before a scripted scenario
   * begins, per the JSON `reset` block. Despawns unscripted customers,
   * clears claim queues / orphan folders, and returns every staff member
   * to their desk so the camera and the audience start from a known state.
   */
  resetForScenario(scenarioId: ScenarioId): void {
    const def = getScenario(scenarioId);
    const reset = def.reset.office;

    if (reset.removeUnscriptedCustomers) {
      // Despawn any non-scripted customer that's currently in flight.
      for (const c of this.customers) {
        if (c.claim.script) continue;
        if (c.state === "done") continue;
        // Detach folder from customer; we'll dispose it via removeClaim.
        if (c.claim.mesh.parent === c.character.getHandAnchor()) {
          c.claim.mesh.parent = null;
        }
        this.customersByCharId.delete(c.character.id);
        c.character.root.dispose();
        c.state = "done";
        this.removeClaim(c.claim);
      }
      // Compact the customer array.
      for (let i = this.customers.length - 1; i >= 0; i--) {
        if (this.customers[i].state === "done") this.customers.splice(i, 1);
      }
    }

    if (reset.clearQueues) {
      // Drop any folders sitting in the inbox / settlement / comms queues.
      for (const q of [this.inbox, this.settlementQueue, this.communicationsQueue]) {
        while (q.length > 0) {
          const claim = q.shift()!;
          if (!claim.script) this.removeClaim(claim);
        }
      }
      if (this.assessorReady && !this.assessorReady.script) {
        this.removeClaim(this.assessorReady);
      }
      this.assessorReady = null;
    }

    if (reset.snapStaffToDesks) {
      // Force every staff member back to their home desk and a clean state.
      for (const s of this.staff) {
        // If a staff member is carrying a folder for an unscripted claim, drop it.
        const held = this.findClaimHeldBy(s.id);
        if (held && !held.script) {
          held.mesh.parent = null;
          this.removeClaim(held);
        }
        s.task = { kind: "idle" };
        s.moveTarget = null;
        s.onArrive = null;
        s.processTimer = 0;
        s.character.setWalking(false);
        s.character.hideThoughtBulbs();
        s.character.root.position.x = s.homePoint.x;
        s.character.root.position.y = 0.2;
        s.character.root.position.z = s.homePoint.z;
        s.character.root.rotation.y = 0;
        // Ambient roles return to their first ambient message; pipeline roles
        // go back to "Awaiting next claim".
        s.active = s.persona.active_in_pipeline;
        const initial = s.persona.ambient[0] ?? "Awaiting next claim";
        this.logger.setAgentStatus(s.id, false, initial);
      }
    }
  }

  /** Dispose a claim's folder mesh and remove it from the registry. */
  private removeClaim(claim: Claim): void {
    if (claim.mesh && !claim.mesh.isDisposed()) {
      claim.mesh.dispose();
    }
    this.claimsById.delete(claim.id);
    this.metrics.processing = Math.max(0, this.metrics.processing - 1);
    this.pushMetrics();
  }

  /**
   * Begin a scripted scenario in the office. The caller is responsible for
   * the neighbourhood walk + scene transition; once that's done it calls
   * this method which spawns the customer at the office spawn point and
   * lets the existing pipeline take over (with deterministic outcomes).
   *
   * @returns the spawned customer (caller can read its character.id, claim, etc).
   */
  startScripted(scenarioId: ScenarioId, hooks: {
    onFocusChange?: (info: BeatFocusInfo) => void;
    onClosed?: () => void;
  } = {}): { customer: CustomerAgentInfo; persona: CustomerPersona } {
    this.pauseAutoSpawn();
    // Apply the JSON reset block so the office is in a clean, deterministic
    // state regardless of any ambient activity that was in flight.
    this.resetForScenario(scenarioId);
    const persona = findCustomerPersona(scenarioId);
    const script = buildScriptForScenario(persona);
    script.onFocusChange = hooks.onFocusChange;
    script.onClosed = () => {
      hooks.onClosed?.();
      // Auto-spawn resumes a few seconds after closure so the office calms down.
      setTimeout(() => this.resumeAutoSpawn(), 1500);
    };
    const customer = this.spawnCustomer(scenarioId, script);
    return {
      customer: {
        characterId: customer.character.id,
        character: customer.character,
        claimId: customer.claim.id,
        personaName: customer.persona,
      },
      persona,
    };
  }
}

/* ---------------------------------------------------------------- */
/* Public types & helpers                                            */
/* ---------------------------------------------------------------- */

export interface CustomerAgentInfo {
  characterId: string;
  character: VoxelCharacter;
  claimId: string;
  personaName: string;
}

export interface CharacterProfileClaim {
  id: string;
  type: string;
  status: ClaimStatus;
}

export interface CharacterProfile {
  kind: "staff" | "customer";
  id: string;
  name: string;
  role: string;
  color: string;
  /** Voxel palette so the profile card can render a matching character bust. */
  palette: VoxelCharacterPalette;
  personality: string;
  typicalLine: string;
  responsibilities: string[];
  situation: string;
  current: string;
  /** Staff only — emoji icon for this role (matches the backend agent page). */
  icon: string | null;
  claims: CharacterProfileClaim[];
  /** Customer only — friendly scenario name. */
  scenarioName: string;
  /** Customer only — name of staff currently holding the folder. */
  currentHandler: string | null;
  /** Customer only — their in-flight claim. */
  activeClaim: {
    id: string;
    type: string;
    amount: number;
    status: ClaimStatus;
  } | null;
}

function describeTask(task: Task): string {
  switch (task.kind) {
    case "idle":
      return "At desk, awaiting work";
    case "pickup":
      return `Picking up ${task.claim.id}`;
    case "assess":
      return `Working on ${task.claim.id}`;
    case "carry-to-settlement":
      return `Routing ${task.claim.id} to Settlement`;
    case "settle":
      return `Settling ${task.claim.id}`;
    case "carry-to-comms":
      return `Routing ${task.claim.id} to Communications`;
    case "communicate":
      return `Notifying customer about ${task.claim.id}`;
    case "consult":
      return `${task.beat.role} consultation on ${task.claim.id}`;
  }
}

function describeCustomerState(c: CustomerAgent): string {
  switch (c.state) {
    case "entering":
      return "Walking into the office";
    case "to-reception":
      return "Heading to reception";
    case "leaving":
      return "Leaving the office";
    case "done":
      return "Departed";
  }
}

/**
 * Builds a deterministic scenario script for a given customer persona,
 * sourced from the JSON definition in `src/ui/src/scenarios/<id>.json`.
 * The JSON is the single source of truth — narration, consultations,
 * outcome — so editing the JSON updates both the on-screen story and
 * the underlying simulation behaviour.
 */
function buildScriptForScenario(p: CustomerPersona): ClaimScript {
  const def = getScenario(p.id);
  return {
    scenarioId: def.id,
    caseId: def.caseId,
    approveAtAssessor: def.approveAtAssessor,
    extras: def.extras.map((c) => ({
      role: c.role as AgentRole,
      narration: c.narration,
      duration: c.duration,
    })),
    preAssessor: def.preAssessor.map((c) => ({
      role: c.role as AgentRole,
      narration: c.narration,
      duration: c.duration,
    })),
    settlement: def.settlement,
    color: p.color,
    personaName: p.name,
    assessorNarration: def.narrations.assessor,
    settlementNarration: def.narrations.settlement,
    commsNarration: def.narrations.comms,
  };
}

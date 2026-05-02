import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { OfficeLayout } from "./officeScene";
import { PALETTES, VoxelCharacter } from "./voxelCharacter";

export type AgentRole =
  | "Receptionist"
  | "Validator"
  | "Approver"
  | "Filer";

export type ClaimStatus =
  | "submitted"
  | "validating"
  | "validated"
  | "approving"
  | "approved"
  | "rejected"
  | "filing"
  | "filed";

export interface Claim {
  id: string;
  type: string;
  amount: number;
  status: ClaimStatus;
  /** The visible folder mesh that travels with the claim. */
  mesh: Mesh;
}

const CLAIM_TYPES: Array<{ type: string; min: number; max: number }> = [
  { type: "Auto collision", min: 800, max: 9500 },
  { type: "Home water damage", min: 1200, max: 18000 },
  { type: "Travel cancellation", min: 200, max: 4000 },
  { type: "Health — outpatient", min: 100, max: 2500 },
  { type: "Property theft", min: 500, max: 12000 },
  { type: "Pet veterinary", min: 150, max: 3200 },
];

/** Unique ID counter — small + readable for the activity log. */
let nextClaimNum = 1001;

/** Logger contract used by the simulation. */
export interface SimLogger {
  setMetric(name: "submitted" | "processing" | "approved" | "rejected", value: number): void;
  log(message: string, kind?: "info" | "good" | "bad" | "warn"): void;
  setAgentStatus(id: string, busy: boolean, activity: string): void;
  registerAgent(info: { id: string; name: string; role: AgentRole; color: string }): void;
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

/** Tasks staff agents can be assigned to. */
type Task =
  | { kind: "idle" }
  | { kind: "pickup"; claim: Claim }
  | { kind: "validate"; claim: Claim }
  | { kind: "carry-to-approver"; claim: Claim }
  | { kind: "approve"; claim: Claim }
  | { kind: "carry-to-filer"; claim: Claim }
  | { kind: "file"; claim: Claim };

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
}

interface CustomerAgent {
  character: VoxelCharacter;
  claim: Claim;
  state: "entering" | "to-reception" | "leaving" | "done";
  moveTarget: Vector3;
}

/**
 * Top-level simulation: customers spawn, drop claims at reception, staff
 * agents (Receptionist → Validator → Approver → Filer) process them.
 */
export class ClaimSimulation {
  private readonly scene: Scene;
  private readonly layout: OfficeLayout;
  private readonly logger: SimLogger;

  private readonly staff: StaffAgent[] = [];
  private readonly customers: CustomerAgent[] = [];

  /** Claims sitting in the reception inbox awaiting pickup. */
  private readonly inbox: Claim[] = [];
  /** Claims that have been validated, awaiting an approver pickup. */
  private readonly approverQueue: Claim[] = [];
  /** Claims waiting for the filer (approved or rejected). */
  private readonly filerQueue: Claim[] = [];

  private spawnTimer = 1.5;
  private metrics = { submitted: 0, processing: 0, approved: 0, rejected: 0 };

  constructor(scene: Scene, layout: OfficeLayout, logger: SimLogger) {
    this.scene = scene;
    this.layout = layout;
    this.logger = logger;
    this.spawnStaff();
  }

  private spawnStaff(): void {
    const defs: Array<{
      id: string;
      name: string;
      role: AgentRole;
      palette: keyof typeof PALETTES;
      home: Vector3;
      color: string;
    }> = [
      {
        id: "rec-1",
        name: "Riley Park",
        role: "Receptionist",
        palette: "receptionist",
        home: this.layout.receptionistDeskPoint,
        color: "#f4c463",
      },
      {
        id: "val-1",
        name: "Vera Singh",
        role: "Validator",
        palette: "validator",
        home: this.layout.validatorDeskPoint,
        color: "#5fb8a8",
      },
      {
        id: "app-1",
        name: "Aiden Cole",
        role: "Approver",
        palette: "approver",
        home: this.layout.approverDeskPoint,
        color: "#3a5fb0",
      },
      {
        id: "fil-1",
        name: "Finn Yamato",
        role: "Filer",
        palette: "filer",
        home: this.layout.filerDeskPoint,
        color: "#a8b85f",
      },
    ];

    for (const d of defs) {
      const ch = new VoxelCharacter(this.scene, d.id, PALETTES[d.palette]);
      ch.root.position = d.home.clone();
      ch.root.position.y = 0.2;
      const agent: StaffAgent = {
        id: d.id,
        name: d.name,
        role: d.role,
        color: d.color,
        character: ch,
        homePoint: d.home.clone(),
        task: { kind: "idle" },
        processTimer: 0,
        moveTarget: null,
        onArrive: null,
      };
      this.staff.push(agent);
      this.logger.registerAgent({
        id: d.id,
        name: d.name,
        role: d.role,
        color: d.color,
      });
      this.logger.setAgentStatus(d.id, false, "Waiting at desk");
    }
  }

  /** Spawn a new customer with a fresh claim folder. */
  spawnCustomer(): void {
    const tpl = CLAIM_TYPES[Math.floor(Math.random() * CLAIM_TYPES.length)];
    const amount = Math.round(
      tpl.min + Math.random() * (tpl.max - tpl.min),
    );
    const claimId = `C-${nextClaimNum++}`;
    const claim: Claim = {
      id: claimId,
      type: tpl.type,
      amount,
      status: "submitted",
      mesh: this.makeClaimFolder(claimId),
    };

    const paletteKeys: Array<keyof typeof PALETTES> = [
      "customer1",
      "customer2",
      "customer3",
      "customer4",
    ];
    const palette =
      PALETTES[paletteKeys[Math.floor(Math.random() * paletteKeys.length)]];
    const ch = new VoxelCharacter(this.scene, `cust_${claimId}`, palette);
    ch.root.position = this.layout.spawnPoint.clone();
    ch.root.position.y = 0.2;
    // Slight lateral jitter so they don't overlap
    ch.root.position.x += (Math.random() - 0.5) * 1.5;

    // Customer carries the folder until they reach reception.
    claim.mesh.parent = ch.getHandAnchor();
    claim.mesh.position = Vector3.Zero();
    claim.mesh.rotation = Vector3.Zero();

    const customer: CustomerAgent = {
      character: ch,
      claim,
      state: "entering",
      moveTarget: this.layout.entrancePoint.clone(),
    };
    ch.setWalking(true);
    this.customers.push(customer);

    this.metrics.submitted++;
    this.metrics.processing++;
    this.pushMetrics();
    this.logger.log(
      `Customer arrived with claim ${claim.id} — ${claim.type}, $${claim.amount.toLocaleString()}`,
      "info",
    );
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
    // Auto-spawn customers periodically
    this.spawnTimer -= dtSec;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 6 + Math.random() * 6;
      this.spawnCustomer();
    }

    this.updateCustomers(dtSec);
    this.updateStaff(dtSec);
  }

  private updateCustomers(dtSec: number): void {
    const customerSpeed = 2.2;
    for (const c of this.customers) {
      if (c.state === "done") continue;
      c.character.update(dtSec);
      const arrived = moveToward(
        c.character.root,
        c.moveTarget,
        customerSpeed,
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
          this.logger.log(
            `Claim ${c.claim.id} dropped in reception inbox`,
            "info",
          );
          c.state = "leaving";
          c.moveTarget = this.layout.exitPoint.clone();
          c.character.setWalking(true);
          break;
        }
        case "leaving":
          c.state = "done";
          c.character.setWalking(false);
          c.character.root.dispose();
          break;
      }
    }
    // Compact the customer array occasionally
    if (this.customers.length > 0 && this.customers[0].state === "done") {
      // Keep array size manageable
      for (let i = this.customers.length - 1; i >= 0; i--) {
        if (this.customers[i].state === "done") this.customers.splice(i, 1);
      }
    }
  }

  private updateStaff(dtSec: number): void {
    const speed = 2.6;
    for (const s of this.staff) {
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

  private tryAssignTask(s: StaffAgent): void {
    if (s.role === "Receptionist" && this.inbox.length > 0) {
      const claim = this.inbox.shift()!;
      s.task = { kind: "pickup", claim };
      this.logger.setAgentStatus(s.id, true, `Picking up ${claim.id}`);
      this.gotoAndThen(s, this.layout.inboxPoint, () => {
        // Take folder
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.mesh.rotation = Vector3.Zero();
        // Walk to validator desk and drop on validator's inbox.
        this.logger.log(`Receptionist routed ${claim.id} to Validator`, "info");
        s.task = { kind: "validate", claim };
        this.logger.setAgentStatus(s.id, true, `Routing ${claim.id}`);
        const dropPoint = this.layout.validatorDeskPoint.clone();
        dropPoint.z -= 1.2; // approach side of desk
        this.gotoAndThen(s, dropPoint, () => {
          // Drop claim on validator desk top
          const drop = this.layout.validatorDeskPoint.clone();
          drop.y = 1.0;
          drop.z -= 0.55;
          claim.mesh.parent = null;
          claim.mesh.position = drop;
          claim.mesh.rotation = Vector3.Zero();
          claim.status = "validating";
          // Hand off to validator queue (validator will pick it up).
          this.handoffForValidator(claim, drop);
          // Receptionist returns home.
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Waiting at desk");
          });
        });
      });
      return;
    }

    if (s.role === "Validator") {
      // Validator picks claims that have been routed to its desk.
      const claim = this.popValidatorReady();
      if (!claim) return;
      s.task = { kind: "validate", claim };
      this.logger.setAgentStatus(s.id, true, `Validating ${claim.id}`);
      this.logger.log(
        `Validator inspecting ${claim.id} (${claim.type})`,
        "info",
      );
      // Pick up folder from desk
      const pickupPoint = this.layout.validatorDeskPoint.clone();
      pickupPoint.z -= 1.0;
      this.gotoAndThen(s, pickupPoint, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        // Sit at desk for a "processing" beat
        this.gotoAndThen(s, s.homePoint, () => {
          s.processTimer = 2.5 + Math.random() * 2.0;
        });
      });
      return;
    }

    if (s.role === "Approver" && this.approverQueue.length > 0) {
      const claim = this.approverQueue.shift()!;
      s.task = { kind: "approve", claim };
      this.logger.setAgentStatus(s.id, true, `Reviewing ${claim.id}`);
      this.logger.log(
        `Approver picked up ${claim.id} for review`,
        "info",
      );
      const pickup = this.layout.approverDeskPoint.clone();
      pickup.z -= 1.0;
      this.gotoAndThen(s, pickup, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        this.gotoAndThen(s, s.homePoint, () => {
          s.processTimer = 2.5 + Math.random() * 2.0;
        });
      });
      return;
    }

    if (s.role === "Filer" && this.filerQueue.length > 0) {
      const claim = this.filerQueue.shift()!;
      s.task = { kind: "file", claim };
      this.logger.setAgentStatus(s.id, true, `Filing ${claim.id}`);
      // Pick from approver desk.
      const pickup = this.layout.approverDeskPoint.clone();
      pickup.z -= 1.0;
      this.gotoAndThen(s, pickup, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        // Walk to archive and place folder on a shelf.
        this.gotoAndThen(s, this.layout.filerDeskPoint, () => {
          const slot = this.layout.archivePoint.clone();
          slot.x += (Math.random() - 0.5) * 4;
          slot.z += (Math.random() - 0.5) * 1.2;
          slot.y += Math.random() * 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = slot;
          claim.mesh.rotation = new Vector3(0, Math.random() * Math.PI, 0);
          claim.status = "filed";
          this.logger.log(`Claim ${claim.id} filed in archive`, "good");
          s.task = { kind: "idle" };
          this.metrics.processing = Math.max(0, this.metrics.processing - 1);
          this.pushMetrics();
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Waiting at desk");
          });
        });
      });
      return;
    }
  }

  /** Validator desk inbox state — at most one claim awaiting validation. */
  private validatorReady: Claim | null = null;
  private handoffForValidator(claim: Claim, _drop: Vector3): void {
    // Simple: queue at the validator's desk.
    this.validatorReady = claim;
  }
  private popValidatorReady(): Claim | null {
    if (!this.validatorReady) return null;
    const c = this.validatorReady;
    this.validatorReady = null;
    return c;
  }

  private completeProcessingStep(s: StaffAgent): void {
    const t = s.task;
    if (t.kind === "validate") {
      const claim = t.claim;
      // Decide validity: 85% pass.
      const valid = Math.random() < 0.85;
      if (valid) {
        claim.status = "validated";
        this.logger.log(
          `Validator passed ${claim.id} — forwarding to Approver`,
          "good",
        );
        // Carry folder to approver desk.
        s.task = { kind: "carry-to-approver", claim };
        this.logger.setAgentStatus(s.id, true, `Hand-off ${claim.id}`);
        const drop = this.layout.approverDeskPoint.clone();
        drop.z -= 1.2;
        this.gotoAndThen(s, drop, () => {
          const placed = this.layout.approverDeskPoint.clone();
          placed.y = 1.0;
          placed.z -= 0.55;
          claim.mesh.parent = null;
          claim.mesh.position = placed;
          claim.mesh.rotation = Vector3.Zero();
          this.approverQueue.push(claim);
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Waiting at desk");
          });
        });
      } else {
        // Rejected at validation — send straight to filer.
        claim.status = "rejected";
        this.metrics.rejected++;
        this.pushMetrics();
        this.logger.log(
          `Validator rejected ${claim.id} (missing documents)`,
          "bad",
        );
        s.task = { kind: "carry-to-filer", claim };
        this.logger.setAgentStatus(s.id, true, `Hand-off ${claim.id}`);
        const drop = this.layout.approverDeskPoint.clone();
        drop.z -= 1.2;
        this.gotoAndThen(s, drop, () => {
          const placed = this.layout.approverDeskPoint.clone();
          placed.y = 1.0;
          placed.z -= 0.55;
          claim.mesh.parent = null;
          claim.mesh.position = placed;
          claim.mesh.rotation = Vector3.Zero();
          this.filerQueue.push(claim);
          s.task = { kind: "idle" };
          this.logger.setAgentStatus(s.id, false, "Returning to desk");
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Waiting at desk");
          });
        });
      }
    } else if (t.kind === "approve") {
      const claim = t.claim;
      // Approval rule: large amounts more likely rejected.
      const approveProb = claim.amount < 5000 ? 0.9 : claim.amount < 12000 ? 0.7 : 0.4;
      const approved = Math.random() < approveProb;
      if (approved) {
        claim.status = "approved";
        this.metrics.approved++;
        this.logger.log(
          `Approver APPROVED ${claim.id} — payout $${claim.amount.toLocaleString()}`,
          "good",
        );
      } else {
        claim.status = "rejected";
        this.metrics.rejected++;
        this.logger.log(
          `Approver REJECTED ${claim.id} (policy review needed)`,
          "bad",
        );
      }
      this.pushMetrics();
      // Drop on desk for filer pickup
      const drop = this.layout.approverDeskPoint.clone();
      drop.y = 1.0;
      drop.z -= 0.55;
      claim.mesh.parent = null;
      claim.mesh.position = drop;
      claim.mesh.rotation = Vector3.Zero();
      this.filerQueue.push(claim);
      s.task = { kind: "idle" };
      this.logger.setAgentStatus(s.id, false, "Waiting at desk");
    }
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
}

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

/**
 * Claims-industry staff roles, mirroring the cast in
 * `storybook/characters.md` and the departments in `res/img-office.png`.
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
}

/**
 * Customer claim scenarios — each one matches a customer persona from
 * `storybook/characters.md` so the simulation tells a recognisable story.
 */
const CUSTOMER_SCENARIOS: Array<{
  persona: string;
  palette: keyof typeof PALETTES;
  type: string;
  min: number;
  max: number;
}> = [
  { persona: "Michael Harris",  palette: "customerHome",     type: "Home — burst pipe damage",     min: 1500, max: 18000 },
  { persona: "Aisha Khan",      palette: "customerMotor",    type: "Motor — rear-end collision",    min: 800,  max: 9500 },
  { persona: "Tom Bradley",     palette: "customerBusiness", type: "Business — café smoke damage", min: 4000, max: 35000 },
  { persona: "Grace Williams",  palette: "customerTravel",   type: "Travel — lost luggage",        min: 200,  max: 4000 },
  { persona: "Robert Chen",     palette: "customerLife",     type: "Life — beneficiary claim",      min: 5000, max: 50000 },
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

/** Tasks that processing staff agents can be assigned to. */
type Task =
  | { kind: "idle" }
  | { kind: "pickup"; claim: Claim }
  | { kind: "assess"; claim: Claim }
  | { kind: "carry-to-settlement"; claim: Claim }
  | { kind: "settle"; claim: Claim }
  | { kind: "carry-to-comms"; claim: Claim }
  | { kind: "communicate"; claim: Claim };

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
}

interface CustomerAgent {
  character: VoxelCharacter;
  claim: Claim;
  persona: string;
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
      active: boolean;
      ambient?: string[];
    }> = [
      // ----- Active pipeline staff -----
      {
        id: "intake-1",
        name: "Sarah Mitchell",
        role: "Claims Intake Officer",
        palette: "intakeOfficer",
        home: this.layout.intakeDeskPoint,
        color: "#f4c463",
        active: true,
      },
      {
        id: "assessor-1",
        name: "Daniel Cho",
        role: "Claims Assessor",
        palette: "claimsAssessor",
        home: this.layout.assessorDeskPoint,
        color: "#5fb8a8",
        active: true,
      },
      {
        id: "settlement-1",
        name: "Hannah Lee",
        role: "Settlement Officer",
        palette: "settlementOfficer",
        home: this.layout.settlementDeskPoint,
        color: "#3a5fb0",
        active: true,
      },
      {
        id: "comms-1",
        name: "Olivia Martin",
        role: "Customer Communications Specialist",
        palette: "commsSpecialist",
        home: this.layout.communicationsDeskPoint,
        color: "#c14a7a",
        active: true,
      },
      // ----- Ambient/decorative staff (visible, rotating status messages) -----
      {
        id: "loss-1",
        name: "Priya Nair",
        role: "Loss Adjuster",
        palette: "lossAdjuster",
        home: this.layout.lossAdjusterDeskPoint,
        color: "#7a9c5a",
        active: false,
        ambient: [
          "Reviewing inspection photos",
          "Estimating repair costs",
          "Drafting assessment report",
          "Calling contractor",
        ],
      },
      {
        id: "fraud-1",
        name: "Elena Garcia",
        role: "Fraud Investigator",
        palette: "fraudInvestigator",
        home: this.layout.fraudDeskPoint,
        color: "#7a4f9c",
        active: false,
        ambient: [
          "Cross-checking claim history",
          "Verifying timeline",
          "Compiling investigation notes",
          "Reviewing documents",
        ],
      },
      {
        id: "supplier-1",
        name: "James O'Connor",
        role: "Supplier Coordinator",
        palette: "supplierCoord",
        home: this.layout.supplierDeskPoint,
        color: "#e07a3a",
        active: false,
        ambient: [
          "Booking approved repairer",
          "Tracking supplier quotes",
          "Scheduling inspection",
          "Updating supplier status",
        ],
      },
      {
        id: "lead-1",
        name: "Mark Reynolds",
        role: "Claims Team Leader",
        palette: "teamLeader",
        home: this.layout.teamLeaderDeskPoint,
        color: "#cdb497",
        active: false,
        ambient: [
          "Reviewing escalations",
          "Monitoring team workload",
          "Coaching staff",
          "Approving high-value claim",
        ],
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
        active: d.active,
        ambientMessages: d.ambient,
        ambientIndex: 0,
        ambientTimer: 3 + Math.random() * 4,
      };
      this.staff.push(agent);
      this.logger.registerAgent({
        id: d.id,
        name: d.name,
        role: d.role,
        color: d.color,
      });
      const initialStatus = d.ambient?.[0] ?? "Waiting at desk";
      this.logger.setAgentStatus(d.id, false, initialStatus);
    }
  }

  /** Spawn a new customer with a fresh claim folder. */
  spawnCustomer(): void {
    const scenario =
      CUSTOMER_SCENARIOS[Math.floor(Math.random() * CUSTOMER_SCENARIOS.length)];
    const amount = Math.round(
      scenario.min + Math.random() * (scenario.max - scenario.min),
    );
    const claimId = `C-${nextClaimNum++}`;
    const claim: Claim = {
      id: claimId,
      type: scenario.type,
      amount,
      status: "submitted",
      mesh: this.makeClaimFolder(claimId),
    };

    const palette = PALETTES[scenario.palette];
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
      persona: scenario.persona,
      state: "entering",
      moveTarget: this.layout.entrancePoint.clone(),
    };
    ch.setWalking(true);
    this.customers.push(customer);

    this.metrics.submitted++;
    this.metrics.processing++;
    this.pushMetrics();
    this.logger.log(
      `${scenario.persona} arrived with claim ${claim.id} — ${claim.type}, $${claim.amount.toLocaleString()}`,
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
    this.updateAmbient(dtSec);
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
            `Claim ${c.claim.id} lodged at reception by ${c.persona}`,
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
      this.logger.setAgentStatus(s.id, true, `Picking up ${claim.id}`);
      this.gotoAndThen(s, this.layout.inboxPoint, () => {
        // Take folder
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        claim.mesh.rotation = Vector3.Zero();
        // Walk to assessor desk and drop on assessor's inbox.
        claim.status = "intake";
        this.logger.log(
          `Claims Intake routed ${claim.id} to Claims Assessor`,
          "info",
        );
        s.task = { kind: "assess", claim };
        this.logger.setAgentStatus(s.id, true, `Routing ${claim.id}`);
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
          claim.status = "assessing";
          // Hand off to assessor queue (assessor will pick it up).
          this.handoffForAssessor(claim);
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
      this.logger.setAgentStatus(s.id, true, `Assessing ${claim.id}`);
      this.logger.log(
        `Claims Assessor inspecting ${claim.id} (${claim.type})`,
        "info",
      );
      // Pick up folder from desk
      const pickupPoint = this.layout.assessorDeskPoint.clone();
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

    if (s.role === "Settlement Officer" && this.settlementQueue.length > 0) {
      const claim = this.settlementQueue.shift()!;
      s.task = { kind: "settle", claim };
      this.logger.setAgentStatus(s.id, true, `Reviewing ${claim.id}`);
      this.logger.log(
        `Settlement Officer reviewing ${claim.id} for payout`,
        "info",
      );
      const pickup = this.layout.settlementDeskPoint.clone();
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

    if (
      s.role === "Customer Communications Specialist" &&
      this.communicationsQueue.length > 0
    ) {
      const claim = this.communicationsQueue.shift()!;
      s.task = { kind: "communicate", claim };
      this.logger.setAgentStatus(s.id, true, `Notifying customer for ${claim.id}`);
      // Pick from settlement desk.
      const pickup = this.layout.settlementDeskPoint.clone();
      pickup.z -= 1.0;
      this.gotoAndThen(s, pickup, () => {
        claim.mesh.parent = s.character.getHandAnchor();
        claim.mesh.position = Vector3.Zero();
        // Walk to comms desk and place folder in archive (closed file).
        this.gotoAndThen(s, this.layout.communicationsDeskPoint, () => {
          const slot = this.layout.archivePoint.clone();
          slot.x += (Math.random() - 0.5) * 1.5;
          slot.z += (Math.random() - 0.5) * 0.8;
          slot.y += Math.random() * 0.4;
          claim.mesh.parent = null;
          claim.mesh.position = slot;
          claim.mesh.rotation = new Vector3(0, Math.random() * Math.PI, 0);
          claim.status = "closed";
          this.logger.log(
            `Customer notified — claim ${claim.id} closed`,
            "good",
          );
          s.task = { kind: "idle" };
          this.metrics.processing = Math.max(0, this.metrics.processing - 1);
          this.pushMetrics();
          this.gotoAndThen(s, s.homePoint, () => {
            this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
          });
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
      // Decide validity: 85% pass.
      const valid = Math.random() < 0.85;
      if (valid) {
        claim.status = "assessed";
        this.logger.log(
          `Claims Assessor cleared ${claim.id} — forwarding to Settlement`,
          "good",
        );
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
      // Settlement rule: large amounts more likely declined.
      const approveProb = claim.amount < 5000 ? 0.9 : claim.amount < 12000 ? 0.7 : 0.4;
      const approved = Math.random() < approveProb;
      if (approved) {
        claim.status = "approved";
        this.metrics.approved++;
        this.logger.log(
          `Settlement APPROVED ${claim.id} — payout $${claim.amount.toLocaleString()}`,
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
      this.communicationsQueue.push(claim);
      s.task = { kind: "idle" };
      this.logger.setAgentStatus(s.id, false, "Awaiting next claim");
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

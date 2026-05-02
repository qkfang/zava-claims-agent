import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

/**
 * Palette pieces that define the look of a voxel character. All values are
 * hex colors and are compiled into StandardMaterials lazily.
 */
export interface VoxelCharacterPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  accent?: string;
}

/**
 * A blocky humanoid built from boxes — head, torso, two arms, two legs.
 * Exposes `walking` / `setWalking()` to play a tiny limb-swing animation
 * and `root` so callers can move the character around the scene.
 */
export class VoxelCharacter {
  public readonly root: TransformNode;
  private readonly leftArm: Mesh;
  private readonly rightArm: Mesh;
  private readonly leftLeg: Mesh;
  private readonly rightLeg: Mesh;
  private readonly heldItemAnchor: TransformNode;
  private walking = false;
  private walkPhase = 0;

  constructor(
    scene: Scene,
    name: string,
    palette: VoxelCharacterPalette,
  ) {
    const root = new TransformNode(`char_${name}`, scene);
    this.root = root;

    const matCache = new Map<string, StandardMaterial>();
    const mat = (hex: string): StandardMaterial => {
      let m = matCache.get(hex);
      if (!m) {
        m = new StandardMaterial(`m_${hex}_${name}`, scene);
        m.diffuseColor = Color3.FromHexString(hex);
        m.specularColor = new Color3(0.04, 0.04, 0.04);
        matCache.set(hex, m);
      }
      return m;
    };

    // Body proportions (units = meters, 1 unit ~ a "voxel block")
    const head = MeshBuilder.CreateBox(`head_${name}`, { size: 0.55 }, scene);
    head.material = mat(palette.skin);
    head.parent = root;
    head.position.y = 1.55;

    const hair = MeshBuilder.CreateBox(
      `hair_${name}`,
      { width: 0.6, height: 0.18, depth: 0.6 },
      scene,
    );
    hair.material = mat(palette.hair);
    hair.parent = root;
    hair.position.y = 1.84;

    const torso = MeshBuilder.CreateBox(
      `torso_${name}`,
      { width: 0.65, height: 0.7, depth: 0.4 },
      scene,
    );
    torso.material = mat(palette.shirt);
    torso.parent = root;
    torso.position.y = 0.92;

    const makeArm = (side: 1 | -1): Mesh => {
      const pivot = new TransformNode(
        `arm_pivot_${side}_${name}`,
        scene,
      );
      pivot.parent = root;
      pivot.position = new Vector3(side * 0.45, 1.22, 0);

      const arm = MeshBuilder.CreateBox(
        `arm_${side}_${name}`,
        { width: 0.22, height: 0.65, depth: 0.22 },
        scene,
      );
      arm.material = mat(palette.shirt);
      arm.parent = pivot;
      arm.position.y = -0.32;
      // Smuggle pivot identity onto the mesh so we can rotate it.
      (arm as Mesh & { pivotNode: TransformNode }).pivotNode = pivot;
      return arm;
    };

    this.leftArm = makeArm(1);
    this.rightArm = makeArm(-1);

    const makeLeg = (side: 1 | -1): Mesh => {
      const pivot = new TransformNode(
        `leg_pivot_${side}_${name}`,
        scene,
      );
      pivot.parent = root;
      pivot.position = new Vector3(side * 0.18, 0.55, 0);

      const leg = MeshBuilder.CreateBox(
        `leg_${side}_${name}`,
        { width: 0.26, height: 0.55, depth: 0.28 },
        scene,
      );
      leg.material = mat(palette.pants);
      leg.parent = pivot;
      leg.position.y = -0.28;
      (leg as Mesh & { pivotNode: TransformNode }).pivotNode = pivot;
      return leg;
    };

    this.leftLeg = makeLeg(1);
    this.rightLeg = makeLeg(-1);

    const shoeL = MeshBuilder.CreateBox(
      `shoeL_${name}`,
      { width: 0.3, height: 0.12, depth: 0.36 },
      scene,
    );
    shoeL.material = mat(palette.shoes);
    shoeL.parent = this.leftLeg.parent as TransformNode;
    shoeL.position.y = -0.6;
    shoeL.position.z = 0.04;

    const shoeR = MeshBuilder.CreateBox(
      `shoeR_${name}`,
      { width: 0.3, height: 0.12, depth: 0.36 },
      scene,
    );
    shoeR.material = mat(palette.shoes);
    shoeR.parent = this.rightLeg.parent as TransformNode;
    shoeR.position.y = -0.6;
    shoeR.position.z = 0.04;

    if (palette.accent) {
      const tie = MeshBuilder.CreateBox(
        `tie_${name}`,
        { width: 0.12, height: 0.4, depth: 0.05 },
        scene,
      );
      tie.material = mat(palette.accent);
      tie.parent = root;
      tie.position = new Vector3(0, 1.0, 0.22);
    }

    // Anchor in the right hand for held items (claim folder, clipboard, etc).
    this.heldItemAnchor = new TransformNode(`hand_${name}`, scene);
    this.heldItemAnchor.parent = this.rightArm.parent as TransformNode;
    this.heldItemAnchor.position = new Vector3(0, -0.7, 0.18);
  }

  setWalking(walking: boolean): void {
    this.walking = walking;
    if (!walking) {
      this.resetLimbs();
    }
  }

  /** Anchor where a held item should be parented. */
  getHandAnchor(): TransformNode {
    return this.heldItemAnchor;
  }

  /** Per-frame update — advances the walk animation if active. */
  update(dtSec: number): void {
    if (!this.walking) return;
    this.walkPhase += dtSec * 9;
    const swing = Math.sin(this.walkPhase) * 0.7;

    const lArmPivot = (this.leftArm as Mesh & { pivotNode: TransformNode })
      .pivotNode;
    const rArmPivot = (this.rightArm as Mesh & { pivotNode: TransformNode })
      .pivotNode;
    const lLegPivot = (this.leftLeg as Mesh & { pivotNode: TransformNode })
      .pivotNode;
    const rLegPivot = (this.rightLeg as Mesh & { pivotNode: TransformNode })
      .pivotNode;

    lArmPivot.rotation.x = -swing;
    rArmPivot.rotation.x = swing;
    lLegPivot.rotation.x = swing;
    rLegPivot.rotation.x = -swing;
  }

  private resetLimbs(): void {
    const reset = (mesh: Mesh) => {
      const pivot = (mesh as Mesh & { pivotNode: TransformNode }).pivotNode;
      pivot.rotation.x = 0;
    };
    reset(this.leftArm);
    reset(this.rightArm);
    reset(this.leftLeg);
    reset(this.rightLeg);
    this.walkPhase = 0;
  }
}

export const PALETTES: Record<string, VoxelCharacterPalette> = {
  // ----- Customers (mapped to the 5 personas in storybook/characters.md) -----
  // Michael Harris — Home Insurance Customer (stressed homeowner)
  customerHome:    { skin: "#f3c79b", hair: "#5a3a25", shirt: "#4f8fd6", pants: "#2d3344", shoes: "#1a1a1a" },
  // Aisha Khan — Motor Insurance Customer (busy commuter)
  customerMotor:   { skin: "#e8b48a", hair: "#2d2418", shirt: "#d36b5b", pants: "#3a2f24", shoes: "#1a1a1a" },
  // Tom Bradley — Small Business Owner (café owner)
  customerBusiness: { skin: "#f5d2b3", hair: "#9a5a2a", shirt: "#7ab97a", pants: "#2a3344", shoes: "#1a1a1a" },
  // Grace Williams — Travel Insurance Customer (frustrated traveller)
  customerTravel:  { skin: "#d9a37e", hair: "#1a1a1a", shirt: "#c188d4", pants: "#3a3a44", shoes: "#1a1a1a" },
  // Robert Chen — Life Insurance Beneficiary (quiet, formal)
  customerLife:    { skin: "#e8c69a", hair: "#1f1a18", shirt: "#3a3a44", pants: "#1c1c22", shoes: "#1a1a1a", accent: "#22252e" },

  // ----- Staff (mapped to storybook/characters.md staff cast) -----
  // Sarah Mitchell — Claims Intake Officer (warm reception palette)
  intakeOfficer:    { skin: "#f3c79b", hair: "#3a2418", shirt: "#f4c463", pants: "#3a2a55", shoes: "#1a1a1a", accent: "#b8454a" },
  // Daniel Cho — Claims Assessor (analytical, navy/teal)
  claimsAssessor:   { skin: "#e8b48a", hair: "#1a1a1a", shirt: "#5fb8a8", pants: "#2d3344", shoes: "#1a1a1a", accent: "#1c2230" },
  // Priya Nair — Loss Adjuster (field-oriented, earthy green)
  lossAdjuster:     { skin: "#d9a37e", hair: "#2d1a10", shirt: "#7a9c5a", pants: "#3a2f24", shoes: "#1a1a1a", accent: "#3a2a20" },
  // Elena Garcia — Fraud Investigator (sharp purple suit)
  fraudInvestigator:{ skin: "#e8b48a", hair: "#1a1a1a", shirt: "#7a4f9c", pants: "#1c2230", shoes: "#1a1a1a", accent: "#2a3a5c" },
  // James O'Connor — Supplier Coordinator (warm orange polo)
  supplierCoord:    { skin: "#f3c79b", hair: "#cfa050", shirt: "#e07a3a", pants: "#3a3a44", shoes: "#1a1a1a" },
  // Hannah Lee — Settlement Officer (corporate blue button-down)
  settlementOfficer:{ skin: "#f5d2b3", hair: "#3a2418", shirt: "#3a5fb0", pants: "#1c2230", shoes: "#1a1a1a", accent: "#ffb347" },
  // Olivia Martin — Customer Communications Specialist (friendly magenta)
  commsSpecialist:  { skin: "#e8c69a", hair: "#5a3a25", shirt: "#c14a7a", pants: "#3a3a44", shoes: "#1a1a1a" },
  // Mark Reynolds — Claims Team Leader (grey suit, confident)
  teamLeader:       { skin: "#e8b48a", hair: "#5a4a35", shirt: "#cdb497", pants: "#2a2f3a", shoes: "#1a1a1a", accent: "#1c2230" },
};

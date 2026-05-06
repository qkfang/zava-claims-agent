import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { VoxelCharacterPalette } from "./characterPalettes";

// Re-export palette types/data so existing callers can keep importing
// from `./voxelCharacter` if they want to.
export {
  PALETTES,
  type VoxelCharacterPalette,
  type HairStyle,
  type FacialHair,
  type LowerBody,
} from "./characterPalettes";

/**
 * A blocky humanoid built from boxes — head, torso, two arms, two legs —
 * with optional details (hair styles, glasses, beard, dress, etc.) so that
 * each persona reads as a distinct individual in the voxel office.
 *
 * Exposes `setWalking()` to drive a tiny limb-swing animation and `root`
 * so callers can move the character around the scene.
 */
/**
 * Metadata stamped on a character's invisible hitbox so the scene-pick
 * handler can identify which character was clicked, regardless of which
 * body part the ray actually hit.
 */
export interface CharacterPickMetadata {
  kind: "character";
  /** Matches the `id` passed to the VoxelCharacter constructor. */
  id: string;
}

export class VoxelCharacter {
  public readonly root: TransformNode;
  /** Stable id stamped on the click hitbox (matches StaffPersona/Customer id). */
  public readonly id: string;
  private readonly leftArm: Mesh;
  private readonly rightArm: Mesh;
  private readonly leftLeg: Mesh;
  private readonly rightLeg: Mesh;
  private readonly heldItemAnchor: TransformNode;
  /** Invisible click hitbox covering the full body. */
  private readonly hitbox: Mesh;
  /** All visible body meshes — used to disable picking on body parts. */
  private readonly visibleMeshes: Mesh[] = [];
  private highlighted = false;
  /** Glowing disc on the floor used to spotlight the active/focused character. */
  private spotlightDisc: Mesh | null = null;
  private spotlightPhase = 0;
  private walking = false;
  private walkPhase = 0;
  private running = false;

  /** Thought-bulb meshes shown above the head when the staff is delegating to AI agents. */
  private thoughtBulbs: Mesh[] = [];
  /** Disposable label & decoration meshes attached to each bulb. */
  private thoughtBulbExtras: Mesh[] = [];
  /** Base Y position of each thought bulb (used to apply the bob without drift). */
  private thoughtBaseY: number[] = [];
  private thoughtPhase = 0;
  /** Palette stored so thought bulbs can be tinted to match the staff member. */
  private readonly palette: VoxelCharacterPalette;

  constructor(
    scene: Scene,
    name: string,
    palette: VoxelCharacterPalette,
  ) {
    const root = new TransformNode(`char_${name}`, scene);
    this.root = root;
    this.id = name;
    this.palette = palette;

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

    const hairStyle = palette.hairStyle ?? "short";
    const facial = palette.facial ?? "none";
    const lower = palette.lowerBody ?? "pants";
    const eyeHex = palette.eye ?? "#1a1410";

    // Slightly darker shade of the skin tone, used for facial hair.
    const darken = (hex: string, amt = 0.45): string => {
      const c = Color3.FromHexString(hex);
      const r = Math.max(0, Math.floor(c.r * 255 * (1 - amt)));
      const g = Math.max(0, Math.floor(c.g * 255 * (1 - amt)));
      const b = Math.max(0, Math.floor(c.b * 255 * (1 - amt)));
      const toHex = (v: number) => v.toString(16).padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    // ---------- Head & face ----------
    const headSize = 0.6;
    const headY = 1.55;
    const head = MeshBuilder.CreateBox(`head_${name}`, { size: headSize }, scene);
    head.material = mat(palette.skin);
    head.parent = root;
    head.position.y = headY;

    // Eyes — two small dark blocks slightly inset on the front of the head.
    const eyeMat = mat(eyeHex);
    const eyeWhiteMat = mat("#ffffff");
    const makeEye = (side: 1 | -1): void => {
      const white = MeshBuilder.CreateBox(
        `eyeW_${side}_${name}`,
        { width: 0.12, height: 0.1, depth: 0.04 },
        scene,
      );
      white.material = eyeWhiteMat;
      white.parent = root;
      white.position = new Vector3(side * 0.13, headY + 0.04, headSize / 2 + 0.001);

      const pupil = MeshBuilder.CreateBox(
        `eye_${side}_${name}`,
        { width: 0.06, height: 0.06, depth: 0.04 },
        scene,
      );
      pupil.material = eyeMat;
      pupil.parent = root;
      pupil.position = new Vector3(side * 0.13, headY + 0.04, headSize / 2 + 0.01);
    };
    makeEye(1);
    makeEye(-1);

    // Mouth — a thin dark line.
    const mouth = MeshBuilder.CreateBox(
      `mouth_${name}`,
      { width: 0.18, height: 0.03, depth: 0.04 },
      scene,
    );
    mouth.material = mat(darken(palette.skin, 0.55));
    mouth.parent = root;
    mouth.position = new Vector3(0, headY - 0.14, headSize / 2 + 0.001);

    // Glasses — bridge + two square lenses framing the eyes.
    if (palette.glasses) {
      const frameMat = mat("#1a1a1a");
      const bridge = MeshBuilder.CreateBox(
        `gbridge_${name}`,
        { width: 0.1, height: 0.03, depth: 0.04 },
        scene,
      );
      bridge.material = frameMat;
      bridge.parent = root;
      bridge.position = new Vector3(0, headY + 0.04, headSize / 2 + 0.02);

      const makeLens = (side: 1 | -1): void => {
        const lens = MeshBuilder.CreateBox(
          `glens_${side}_${name}`,
          { width: 0.18, height: 0.16, depth: 0.04 },
          scene,
        );
        lens.material = frameMat;
        lens.parent = root;
        lens.position = new Vector3(
          side * 0.15,
          headY + 0.04,
          headSize / 2 + 0.02,
        );
        // Inner pane — slightly inset to look like a lens.
        const pane = MeshBuilder.CreateBox(
          `gpane_${side}_${name}`,
          { width: 0.13, height: 0.11, depth: 0.02 },
          scene,
        );
        pane.material = mat("#9fc7e6");
        pane.parent = lens;
        pane.position.z = 0.012;
      };
      makeLens(1);
      makeLens(-1);
    }

    // Facial hair.
    if (facial !== "none") {
      const beardMat = mat(darken(palette.hair, 0.05));
      if (facial === "beard" || facial === "stubble") {
        const beard = MeshBuilder.CreateBox(
          `beard_${name}`,
          {
            width: 0.5,
            height: facial === "stubble" ? 0.12 : 0.22,
            depth: 0.5,
          },
          scene,
        );
        beard.material = beardMat;
        beard.parent = root;
        beard.position = new Vector3(0, headY - 0.18, 0);
      }
      if (facial === "moustache") {
        const m1 = MeshBuilder.CreateBox(
          `must_${name}`,
          { width: 0.22, height: 0.04, depth: 0.04 },
          scene,
        );
        m1.material = beardMat;
        m1.parent = root;
        m1.position = new Vector3(0, headY - 0.08, headSize / 2 + 0.001);
      }
    }

    // ---------- Hair / headwear ----------
    this.buildHair(scene, name, root, mat, palette, hairStyle, headY, headSize);

    // ---------- Neck ----------
    const neck = MeshBuilder.CreateBox(
      `neck_${name}`,
      { width: 0.22, height: 0.1, depth: 0.22 },
      scene,
    );
    neck.material = mat(palette.skin);
    neck.parent = root;
    neck.position.y = 1.22;

    // ---------- Torso ----------
    const torso = MeshBuilder.CreateBox(
      `torso_${name}`,
      { width: 0.7, height: 0.7, depth: 0.42 },
      scene,
    );
    torso.material = mat(palette.shirt);
    torso.parent = root;
    torso.position.y = 0.92;

    // Optional accent tie / scarf hanging from the collar.
    if (palette.accent && lower !== "dress") {
      const tie = MeshBuilder.CreateBox(
        `tie_${name}`,
        { width: 0.12, height: 0.4, depth: 0.05 },
        scene,
      );
      tie.material = mat(palette.accent);
      tie.parent = root;
      tie.position = new Vector3(0, 1.0, 0.22);
    }

    // Optional shirt logo / pocket detail.
    if (palette.shirtLogo && palette.accent) {
      const logo = MeshBuilder.CreateBox(
        `logo_${name}`,
        { width: 0.14, height: 0.14, depth: 0.03 },
        scene,
      );
      logo.material = mat(palette.accent);
      logo.parent = root;
      logo.position = new Vector3(0.18, 1.05, 0.22);
    }

    // ---------- Arms ----------
    const makeArm = (side: 1 | -1): Mesh => {
      const pivot = new TransformNode(`arm_pivot_${side}_${name}`, scene);
      pivot.parent = root;
      pivot.position = new Vector3(side * 0.48, 1.22, 0);

      const arm = MeshBuilder.CreateBox(
        `arm_${side}_${name}`,
        { width: 0.22, height: 0.55, depth: 0.22 },
        scene,
      );
      arm.material = mat(palette.shirt);
      arm.parent = pivot;
      arm.position.y = -0.27;

      // Hand — small skin-tone block at the cuff.
      const hand = MeshBuilder.CreateBox(
        `hand_${side}_${name}`,
        { width: 0.22, height: 0.14, depth: 0.22 },
        scene,
      );
      hand.material = mat(palette.skin);
      hand.parent = pivot;
      hand.position.y = -0.62;

      (arm as Mesh & { pivotNode: TransformNode }).pivotNode = pivot;
      return arm;
    };

    this.leftArm = makeArm(1);
    this.rightArm = makeArm(-1);

    // ---------- Lower body ----------
    if (lower === "dress") {
      // Flared dress replaces both pants and torso bottom.
      const dress = MeshBuilder.CreateBox(
        `dress_${name}`,
        { width: 0.95, height: 0.55, depth: 0.55 },
        scene,
      );
      dress.material = mat(palette.pants);
      dress.parent = root;
      dress.position.y = 0.45;
    } else if (lower === "skirt") {
      const skirt = MeshBuilder.CreateBox(
        `skirt_${name}`,
        { width: 0.85, height: 0.32, depth: 0.5 },
        scene,
      );
      skirt.material = mat(palette.pants);
      skirt.parent = root;
      skirt.position.y = 0.6;
    }

    // Legs — shorter when wearing a skirt or dress so they peek out below.
    const legHeight = lower === "dress" ? 0.32 : lower === "skirt" ? 0.45 : 0.55;
    const legY = lower === "dress" ? 0.32 : lower === "skirt" ? 0.45 : 0.55;
    // For a dress, color the visible lower-leg in skin tone (tights would be palette.pants).
    const legColor =
      lower === "dress" ? palette.skin : palette.pants;

    const makeLeg = (side: 1 | -1): Mesh => {
      const pivot = new TransformNode(`leg_pivot_${side}_${name}`, scene);
      pivot.parent = root;
      pivot.position = new Vector3(side * 0.18, legY, 0);

      const leg = MeshBuilder.CreateBox(
        `leg_${side}_${name}`,
        { width: 0.26, height: legHeight, depth: 0.28 },
        scene,
      );
      leg.material = mat(legColor);
      leg.parent = pivot;
      leg.position.y = -legHeight / 2;
      (leg as Mesh & { pivotNode: TransformNode }).pivotNode = pivot;
      return leg;
    };

    this.leftLeg = makeLeg(1);
    this.rightLeg = makeLeg(-1);

    const makeShoe = (parent: Mesh, n: string): void => {
      const shoe = MeshBuilder.CreateBox(
        `shoe_${n}_${name}`,
        { width: 0.3, height: 0.12, depth: 0.36 },
        scene,
      );
      shoe.material = mat(palette.shoes);
      shoe.parent = parent.parent as TransformNode;
      shoe.position.y = -legHeight - 0.06;
      shoe.position.z = 0.04;
    };
    makeShoe(this.leftLeg, "L");
    makeShoe(this.rightLeg, "R");

    // ---------- Held-item anchor (in the right hand) ----------
    this.heldItemAnchor = new TransformNode(`hand_${name}`, scene);
    this.heldItemAnchor.parent = this.rightArm.parent as TransformNode;
    this.heldItemAnchor.position = new Vector3(0, -0.7, 0.18);

    // ---------- Click hitbox (invisible, full-body) ----------
    // A single tall box covering the character so picking is reliable
    // regardless of which voxel sub-piece the ray hits. Tagged via metadata
    // so the pointer handler can identify the character.
    const hitbox = MeshBuilder.CreateBox(
      `hit_${name}`,
      { width: 1.1, height: 2.2, depth: 0.9 },
      scene,
    );
    hitbox.parent = root;
    hitbox.position = new Vector3(0, 1.0, 0);
    hitbox.isPickable = true;
    hitbox.visibility = 0; // invisible but still pickable
    hitbox.metadata = { kind: "character", id: name } as CharacterPickMetadata;
    this.hitbox = hitbox;

    // Collect visible body meshes for highlight effect — every Mesh child of
    // root that has a material. Skip the hitbox itself.
    const collect = (node: TransformNode): void => {
      const children = node.getChildren();
      for (const child of children) {
        if (child instanceof Mesh && child !== this.hitbox && child.material) {
          this.visibleMeshes.push(child);
        }
        if (child instanceof TransformNode) {
          collect(child);
        }
      }
    };
    collect(root);

    // Make sure the visible body parts don't intercept picks (they'd hide
    // the invisible hitbox otherwise on some Babylon versions).
    for (const m of this.visibleMeshes) {
      m.isPickable = false;
    }
  }

  /** Builds hair / hat / hood / crown depending on `style`. */
  private buildHair(
    scene: Scene,
    name: string,
    root: TransformNode,
    mat: (hex: string) => StandardMaterial,
    palette: VoxelCharacterPalette,
    style: NonNullable<VoxelCharacterPalette["hairStyle"]>,
    headY: number,
    headSize: number,
  ): void {
    const hairMat = mat(palette.hair);
    const headTopY = headY + headSize / 2;

    const addCap = (
      capName: string,
      width: number,
      height: number,
      depth: number,
      yOffset: number,
      material: StandardMaterial = hairMat,
    ): Mesh => {
      const m = MeshBuilder.CreateBox(
        `${capName}_${name}`,
        { width, height, depth },
        scene,
      );
      m.material = material;
      m.parent = root;
      m.position.y = headTopY + yOffset - height / 2;
      return m;
    };

    switch (style) {
      case "bald":
        // Nothing on top.
        break;

      case "short": {
        addCap("hair", 0.66, 0.18, 0.66, 0.08);
        // Side-burn slabs.
        const sideL = MeshBuilder.CreateBox(
          `hairSL_${name}`,
          { width: 0.05, height: 0.25, depth: 0.6 },
          scene,
        );
        sideL.material = hairMat;
        sideL.parent = root;
        sideL.position = new Vector3(-headSize / 2 - 0.02, headY + 0.05, 0);
        const sideR = sideL.clone(`hairSR_${name}`);
        sideR.position.x = headSize / 2 + 0.02;
        break;
      }

      case "long": {
        addCap("hair", 0.66, 0.2, 0.66, 0.1);
        // Long flowing back.
        const back = MeshBuilder.CreateBox(
          `hairBack_${name}`,
          { width: 0.6, height: 0.55, depth: 0.12 },
          scene,
        );
        back.material = hairMat;
        back.parent = root;
        back.position = new Vector3(0, headY - 0.1, -headSize / 2 - 0.04);
        // Front fringe.
        const fringe = MeshBuilder.CreateBox(
          `hairF_${name}`,
          { width: 0.66, height: 0.12, depth: 0.08 },
          scene,
        );
        fringe.material = hairMat;
        fringe.parent = root;
        fringe.position = new Vector3(0, headY + 0.18, headSize / 2 + 0.01);
        break;
      }

      case "afro": {
        const a = MeshBuilder.CreateBox(
          `afro_${name}`,
          { width: 0.85, height: 0.45, depth: 0.85 },
          scene,
        );
        a.material = hairMat;
        a.parent = root;
        a.position.y = headTopY + 0.12;
        break;
      }

      case "ponytail": {
        addCap("hair", 0.66, 0.2, 0.66, 0.1);
        const tail = MeshBuilder.CreateBox(
          `tail_${name}`,
          { width: 0.18, height: 0.5, depth: 0.18 },
          scene,
        );
        tail.material = hairMat;
        tail.parent = root;
        tail.position = new Vector3(
          0,
          headY - 0.05,
          -headSize / 2 - 0.12,
        );
        // Front fringe.
        const fringe = MeshBuilder.CreateBox(
          `pfringe_${name}`,
          { width: 0.66, height: 0.1, depth: 0.08 },
          scene,
        );
        fringe.material = hairMat;
        fringe.parent = root;
        fringe.position = new Vector3(0, headY + 0.2, headSize / 2 + 0.01);
        break;
      }

      case "bun": {
        addCap("hair", 0.66, 0.18, 0.66, 0.08);
        const bun = MeshBuilder.CreateBox(
          `bun_${name}`,
          { width: 0.28, height: 0.28, depth: 0.28 },
          scene,
        );
        bun.material = hairMat;
        bun.parent = root;
        bun.position = new Vector3(0, headTopY + 0.18, -0.08);
        break;
      }

      case "beanie": {
        addCap("beanie", 0.7, 0.28, 0.7, 0.16);
        // Brim band in accent color if available.
        const band = MeshBuilder.CreateBox(
          `beanieBand_${name}`,
          { width: 0.72, height: 0.08, depth: 0.72 },
          scene,
        );
        band.material = mat(palette.accent ?? "#ffffff");
        band.parent = root;
        band.position.y = headTopY + 0.04;
        break;
      }

      case "cap": {
        // Crown of the cap.
        const crownMat = mat(palette.accent ?? palette.hair);
        addCap("capCrown", 0.7, 0.22, 0.7, 0.13, crownMat);
        // Visor extending forward.
        const visor = MeshBuilder.CreateBox(
          `capVisor_${name}`,
          { width: 0.7, height: 0.05, depth: 0.3 },
          scene,
        );
        visor.material = crownMat;
        visor.parent = root;
        visor.position = new Vector3(0, headTopY + 0.04, 0.4);
        // Tiny tuft of hair peeking out at sides.
        const tuftL = MeshBuilder.CreateBox(
          `capTuftL_${name}`,
          { width: 0.05, height: 0.18, depth: 0.55 },
          scene,
        );
        tuftL.material = hairMat;
        tuftL.parent = root;
        tuftL.position = new Vector3(-headSize / 2 - 0.02, headY + 0.1, 0);
        const tuftR = tuftL.clone(`capTuftR_${name}`);
        tuftR.position.x = headSize / 2 + 0.02;
        break;
      }

      case "hat": {
        // Fedora / wide-brim hat.
        const hatMat = mat(palette.accent ?? palette.hair);
        const brim = MeshBuilder.CreateBox(
          `hatBrim_${name}`,
          { width: 0.95, height: 0.05, depth: 0.95 },
          scene,
        );
        brim.material = hatMat;
        brim.parent = root;
        brim.position.y = headTopY + 0.04;
        const top = MeshBuilder.CreateBox(
          `hatTop_${name}`,
          { width: 0.62, height: 0.3, depth: 0.62 },
          scene,
        );
        top.material = hatMat;
        top.parent = root;
        top.position.y = headTopY + 0.22;
        break;
      }

      case "hood": {
        // Hood extends a bit beyond the head and dips down the back.
        const hoodMat = mat(palette.shirt);
        const hood = MeshBuilder.CreateBox(
          `hood_${name}`,
          { width: 0.78, height: 0.7, depth: 0.78 },
          scene,
        );
        hood.material = hoodMat;
        hood.parent = root;
        hood.position.y = headY + 0.08;
        // Hollow out the front a touch by overlaying a face plate (skin).
        const faceHole = MeshBuilder.CreateBox(
          `hoodFace_${name}`,
          { width: 0.6, height: 0.5, depth: 0.05 },
          scene,
        );
        faceHole.material = mat(palette.skin);
        faceHole.parent = root;
        faceHole.position = new Vector3(0, headY + 0.02, headSize / 2 + 0.02);
        break;
      }

      case "crown": {
        addCap("hair", 0.66, 0.16, 0.66, 0.06);
        const crownMat = mat(palette.accent ?? "#f4c463");
        const band = MeshBuilder.CreateBox(
          `crownBand_${name}`,
          { width: 0.7, height: 0.08, depth: 0.7 },
          scene,
        );
        band.material = crownMat;
        band.parent = root;
        band.position.y = headTopY + 0.18;
        // Three little spikes on top.
        for (let i = -1; i <= 1; i++) {
          const spike = MeshBuilder.CreateBox(
            `crownSpike_${i}_${name}`,
            { width: 0.1, height: 0.18, depth: 0.1 },
            scene,
          );
          spike.material = crownMat;
          spike.parent = root;
          spike.position = new Vector3(i * 0.22, headTopY + 0.32, 0);
        }
        break;
      }
    }
  }

  setWalking(walking: boolean): void {
    this.walking = walking;
    if (!walking) {
      this.running = false;
      this.resetLimbs();
    }
  }

  /**
   * Toggle a faster "running" gait — speeds up the limb-swing
   * animation. Callers are still responsible for moving the character
   * faster through world space (this only affects the animation rate).
   */
  setRunning(running: boolean): void {
    this.running = running;
  }

  /** Anchor where a held item should be parented. */
  getHandAnchor(): TransformNode {
    return this.heldItemAnchor;
  }

  /** The full-body invisible click target. */
  getHitbox(): Mesh {
    return this.hitbox;
  }

  /**
   * Highlight the focused character with a glowing spotlight disc on the
   * floor at their feet (used for hover state and to draw attention to
   * the focused character during scripted scenarios). Deliberately does
   * NOT outline the character figure — the spotlight reads as a stage
   * "follow spot" and keeps the voxel silhouette clean.
   */
  setHighlight(on: boolean, color?: Color3): void {
    if (this.highlighted === on) return;
    this.highlighted = on;
    const c = color ?? new Color3(1.0, 0.78, 0.28);
    if (on) {
      const scene = this.root.getScene();
      if (!this.spotlightDisc) {
        const disc = MeshBuilder.CreateDisc(
          `spot_${this.id}`,
          { radius: 0.95, tessellation: 48 },
          scene,
        );
        // Lay flat on the floor and parent to the character so it tracks
        // the character's position as they walk around.
        disc.rotation.x = Math.PI / 2;
        disc.parent = this.root;
        disc.position.y = 0.06;
        disc.isPickable = false;
        const m = new StandardMaterial(`spotMat_${this.id}`, scene);
        m.diffuseColor = new Color3(0, 0, 0);
        m.emissiveColor = c;
        m.specularColor = new Color3(0, 0, 0);
        m.alpha = 0.55;
        m.backFaceCulling = false;
        m.disableLighting = true;
        disc.material = m;
        this.spotlightDisc = disc;
      } else {
        (this.spotlightDisc.material as StandardMaterial).emissiveColor = c;
      }
      this.spotlightDisc.isVisible = true;
    } else if (this.spotlightDisc) {
      this.spotlightDisc.isVisible = false;
    }
  }

  /**
   * Show one flat "AI agent" icon floating above the staff member's head per
   * AI sub-agent currently delegated to the case. Each icon is a flat
   * billboard plane painted with the staff member's palette (skin/hair/shirt)
   * so the audience reads them as the same persona's AI clones, and carries
   * a floating name label such as "Agent Iris #1 — Intake Triage Assistant".
   *
   * Pass an empty array (or call `hideThoughtBulbs`) to clear.
   */
  showThoughtBulbs(agents: { name: string }[]): void {
    this.hideThoughtBulbs();
    const n = Math.max(0, Math.min(3, agents.length));
    if (n === 0) return;
    const scene = this.root.getScene();

    // Lay the icons out in a horizontal arc just above the character's head
    // so they read as a "trio of mini-personas" floating with the staff.
    const layout: Array<[number, number, number]> = [];
    if (n === 1) {
      layout.push([0.0, 3.0, 0.0]);
    } else if (n === 2) {
      layout.push([-0.85, 2.95, 0.0]);
      layout.push([0.85, 2.95, 0.0]);
    } else {
      layout.push([-1.4, 2.85, 0.0]);
      layout.push([0.0, 3.15, 0.0]);
      layout.push([1.4, 2.85, 0.0]);
    }

    for (let i = 0; i < n; i++) {
      // Flat agent-icon plane (single billboard, drawn via DynamicTexture)
      // tinted with the staff persona's palette so it reads as their AI clone.
      const icon = makeAgentIconMesh(
        scene,
        `tbulb_${this.id}_${i}`,
        this.palette,
      );
      icon.parent = this.root;
      icon.position = new Vector3(...layout[i]);
      icon.billboardMode = Mesh.BILLBOARDMODE_Y;
      icon.isPickable = false;

      // Floating name label (DynamicTexture plane) — shows the agent's name.
      const label = makeAgentLabelMesh(scene, `tbulb_${this.id}_${i}_lbl`, agents[i].name);
      label.parent = icon;
      label.position = new Vector3(0, 0.95, 0);
      label.isPickable = false;
      this.thoughtBulbExtras.push(label);

      this.thoughtBulbs.push(icon);
      this.thoughtBaseY.push(layout[i][1]);
    }
    this.thoughtPhase = 0;
  }

  /** Remove any thought bulbs currently shown above the character. */
  hideThoughtBulbs(): void {
    for (const b of this.thoughtBulbExtras) b.dispose();
    for (const b of this.thoughtBulbs) b.dispose();
    this.thoughtBulbs = [];
    this.thoughtBulbExtras = [];
    this.thoughtBaseY = [];
  }

  /** Per-frame update — advances the walk animation if active. */
  update(dtSec: number): void {
    if (this.spotlightDisc && this.spotlightDisc.isVisible) {
      // Gentle breathing pulse so the spotlight reads as alive.
      this.spotlightPhase += dtSec * 2.2;
      const pulse = 0.5 + 0.5 * Math.sin(this.spotlightPhase);
      const mat = this.spotlightDisc.material as StandardMaterial;
      mat.alpha = 0.4 + pulse * 0.25;
      const scale = 1.0 + pulse * 0.08;
      this.spotlightDisc.scaling.x = scale;
      this.spotlightDisc.scaling.y = scale;
    }
    if (this.thoughtBulbs.length > 0) {
      this.thoughtPhase += dtSec * 4;
      for (let i = 0; i < this.thoughtBulbs.length; i++) {
        const b = this.thoughtBulbs[i];
        // Apply sine offset to the stored base Y so the bulb bobs in place
        // without any per-frame drift.
        b.position.y =
          this.thoughtBaseY[i] + Math.sin(this.thoughtPhase + i * 0.7) * 0.12;
      }
    }
    if (!this.walking) return;
    this.walkPhase += dtSec * (this.running ? 18 : 9);
    const swing = Math.sin(this.walkPhase) * (this.running ? 1.0 : 0.7);

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

/**
 * Build a flat plane mesh whose material renders a small label such as
 * "Agent Iris #1" via DynamicTexture. Used by `showThoughtBulbs` to put
 * a floating name above each AI sub-agent persona bulb.
 */
function makeAgentLabelMesh(scene: Scene, name: string, text: string): Mesh {
  const width = 1024;
  const height = 256;
  const tex = new DynamicTexture(`tex_${name}`, { width, height }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, width, height);
  // Pill background so the label reads clearly on any backdrop.
  const radius = 60;
  ctx.fillStyle = "rgba(28, 34, 48, 0.85)";
  ctx.strokeStyle = "rgba(255, 179, 71, 0.95)";
  ctx.lineWidth = 6;
  const pad = 12;
  ctx.beginPath();
  ctx.moveTo(pad + radius, pad);
  ctx.lineTo(width - pad - radius, pad);
  ctx.arcTo(width - pad, pad, width - pad, pad + radius, radius);
  ctx.lineTo(width - pad, height - pad - radius);
  ctx.arcTo(width - pad, height - pad, width - pad - radius, height - pad, radius);
  ctx.lineTo(pad + radius, height - pad);
  ctx.arcTo(pad, height - pad, pad, height - pad - radius, radius);
  ctx.lineTo(pad, pad + radius);
  ctx.arcTo(pad, pad, pad + radius, pad, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px Segoe UI, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Truncate very long strings so they fit.
  const maxChars = 36;
  const display = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
  ctx.fillText(display, width / 2, height / 2);
  tex.update();

  const mat = new StandardMaterial(`mat_${name}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.specularColor = new Color3(0, 0, 0);
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;

  // Plane sized to read clearly above the bulb head.
  const plane = MeshBuilder.CreatePlane(name, { width: 2.4, height: 0.6 }, scene);
  plane.material = mat;
  return plane;
}

/**
 * Build a flat billboard plane painted with a stylised "AI agent" badge:
 * a rounded card showing a simple voxel-style head (skin + hair) over the
 * persona's shirt color, with a small "AI" tag. Tinted with the staff
 * persona's palette so the audience reads the floating icon as that
 * persona's AI clone — but rendered flat as a single facing-camera plane
 * rather than a 3D head. Used by `showThoughtBulbs`.
 */
function makeAgentIconMesh(
  scene: Scene,
  name: string,
  palette: VoxelCharacterPalette,
): Mesh {
  const size = 512;
  const tex = new DynamicTexture(`tex_${name}`, { width: size, height: size }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  const skin = palette.skin;
  const hair = palette.hair;
  const shirt = palette.shirt;
  const accent = palette.accent ?? "#ffb347";
  const eye = palette.eye ?? "#22252e";

  // Rounded card background tinted with the persona's shirt color.
  const pad = 28;
  const radius = 64;
  const cardX = pad;
  const cardY = pad;
  const cardW = size - pad * 2;
  const cardH = size - pad * 2;
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = shirt;
  roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Voxel head (skin) — a square with hair slab on top — drawn flat.
  const headSize = 220;
  const headX = (size - headSize) / 2;
  const headY = 130;
  ctx.fillStyle = skin;
  ctx.fillRect(headX, headY, headSize, headSize);

  // Hair slab.
  const hairH = 56;
  ctx.fillStyle = hair;
  ctx.fillRect(headX - 8, headY - hairH + 12, headSize + 16, hairH);

  // Eyes — two small dark squares.
  ctx.fillStyle = eye;
  const eyeW = 28;
  const eyeH = 28;
  const eyeY = headY + 100;
  ctx.fillRect(headX + 50, eyeY, eyeW, eyeH);
  ctx.fillRect(headX + headSize - 50 - eyeW, eyeY, eyeW, eyeH);

  // Optional glasses.
  if (palette.glasses) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#1c2230";
    ctx.strokeRect(headX + 44, eyeY - 6, eyeW + 12, eyeH + 12);
    ctx.strokeRect(headX + headSize - 56 - eyeW, eyeY - 6, eyeW + 12, eyeH + 12);
    ctx.beginPath();
    ctx.moveTo(headX + 44 + eyeW + 12, eyeY + eyeH / 2);
    ctx.lineTo(headX + headSize - 56 - eyeW, eyeY + eyeH / 2);
    ctx.stroke();
  }

  // Small "AI" badge in a corner — reinforces "this is an AI agent".
  const badgeR = 46;
  const badgeCX = size - pad - badgeR - 14;
  const badgeCY = pad + badgeR + 14;
  ctx.beginPath();
  ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(28, 34, 48, 0.85)";
  ctx.stroke();
  ctx.fillStyle = "#1c2230";
  ctx.font = "bold 52px Segoe UI, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI", badgeCX, badgeCY + 2);

  tex.update();

  const mat = new StandardMaterial(`mat_${name}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.specularColor = new Color3(0, 0, 0);
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.disableLighting = true;

  const plane = MeshBuilder.CreatePlane(name, { width: 1.4, height: 1.4 }, scene);
  plane.material = mat;
  return plane;
}

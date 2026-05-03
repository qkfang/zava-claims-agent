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
import { PALETTES } from "./characterPalettes";
import {
  NeighbourhoodAmbient,
  makeBurstPipeIncident,
  makeCalmGlowIncident,
  makeLuggageIncident,
  makeRearEndIncident,
  makeSmokeIncident,
} from "./neighbourhoodAmbient";
import type { ScenarioId } from "./personaData";
import { VoxelCharacter } from "./voxelCharacter";

/**
 * Build the voxel "Claims Neighbourhood" scene as described in
 * `docs/theme_neighhood.md`.
 *
 * The neighbourhood is the **starting point** of every claim. It contains
 * five incident zones, each tied to an insurance product:
 *
 *   - Residential street       — home insurance (burst pipe)
 *   - Main road / intersection — motor insurance (rear-end accident)
 *   - High street              — small-business insurance (café fire)
 *   - Travel hub               — travel insurance (lost luggage)
 *   - Quiet suburb home        — life insurance (bereavement)
 *
 * The Zava Insurance Claims Office sits at the centre as the visual anchor. Roads
 * connect every zone to the office door so customers can be seen "heading
 * to the office".
 *
 * The function is intentionally side-effect-only: it adds meshes to the
 * provided `scene`. All pieces are parented to a single root TransformNode
 * (returned) so callers can dispose them as a unit if needed.
 */
/**
 * Anchor points exported alongside the neighbourhood scene so the
 * scenario runner can place the customer voxel character at the right
 * incident zone, focus the camera there, and walk them along the path
 * toward the office front door.
 */
export interface IncidentZones {
  /** Position in front of the office door (where the route ends). */
  officeDoor: Vector3;
  /** Per-scenario incident anchor (where the customer spawns). */
  home: Vector3;
  motor: Vector3;
  business: Vector3;
  travel: Vector3;
  life: Vector3;
}

export interface NeighbourhoodResult {
  root: TransformNode;
  zones: IncidentZones;
  /** Per-frame tick — drives ambient cars/people/pets and active incidents. */
  update(dtSec: number): void;
  /** Play the scripted incident animation for the given scenario. */
  playIncident(id: ScenarioId): void;
  /** Stop any in-flight incident animation (e.g. on cancel). */
  clearIncident(): void;
}

export function buildNeighbourhood(scene: Scene): NeighbourhoodResult {
  const root = new TransformNode("neighbourhood", scene);

  const matCache = new Map<string, StandardMaterial>();
  const mat = (name: string, hex: string): StandardMaterial => {
    const key = `${name}:${hex}`;
    let m = matCache.get(key);
    if (!m) {
      m = new StandardMaterial(`nh_${name}`, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      matCache.set(key, m);
    }
    return m;
  };

  const attach = (m: Mesh): Mesh => {
    m.parent = root;
    return m;
  };

  // ----- Ground (grass park) -----
  const grass = MeshBuilder.CreateBox(
    "nh_grass",
    { width: 80, depth: 80, height: 0.4 },
    scene,
  );
  grass.position = new Vector3(0, -0.2, 0);
  grass.material = mat("grass", "#9bcb7a");
  attach(grass);

  // Subtle grass tone patches for variety
  const grassDark = mat("grassDark", "#8abf68");
  for (const [x, z, w, d] of [
    [-22, -22, 14, 10],
    [22, 18, 12, 14],
    [-18, 20, 10, 12],
    [20, -20, 14, 10],
  ] as Array<[number, number, number, number]>) {
    const patch = MeshBuilder.CreateBox(
      `nh_grass_patch_${x}_${z}`,
      { width: w, height: 0.05, depth: d },
      scene,
    );
    patch.position = new Vector3(x, 0.03, z);
    patch.material = grassDark;
    attach(patch);
  }

  // ----- Roads -----
  // The roads form a plus shape around the central office, plus a small
  // ring/roundabout at the central crossroads.
  const roadMat = mat("road", "#4a4d55");
  const roadLine = mat("roadLine", "#f4e8a8");

  const makeRoad = (
    name: string,
    width: number,
    depth: number,
    pos: Vector3,
  ): void => {
    const road = MeshBuilder.CreateBox(
      name,
      { width, height: 0.06, depth },
      scene,
    );
    road.position = pos;
    road.material = roadMat;
    attach(road);
  };

  // Horizontal main road (east-west) running across the town
  makeRoad("nh_road_h", 80, 5, new Vector3(0, 0.05, 0));
  // Vertical road (north-south)
  makeRoad("nh_road_v", 5, 80, new Vector3(0, 0.05, 0));

  // Dashed center lines along the horizontal road. We skip dashes that
  // would land inside the central roundabout or on the asphalt of any
  // crossing side street so dashes don't visually float on top of the
  // side-road tarmac.
  for (let x = -38; x <= 38; x += 4) {
    if (Math.abs(x) < 4) continue; // skip intersection
    if (x > -28 && x < -24) continue; // Cedar Way crossing
    if (x > 31 && x < 35) continue; // Oak Drive crossing
    const dash = MeshBuilder.CreateBox(
      `nh_dash_h_${x}`,
      { width: 1.6, height: 0.02, depth: 0.18 },
      scene,
    );
    dash.position = new Vector3(x, 0.09, 0);
    dash.material = roadLine;
    attach(dash);
  }
  for (let z = -38; z <= 38; z += 4) {
    if (Math.abs(z) < 4) continue;
    if (z > -12 && z < -8) continue; // Birch Lane crossing
    if (z > 18 && z < 22) continue; // Maple Crescent crossing
    const dash = MeshBuilder.CreateBox(
      `nh_dash_v_${z}`,
      { width: 0.18, height: 0.02, depth: 1.6 },
      scene,
    );
    dash.position = new Vector3(0, 0.09, z);
    dash.material = roadLine;
    attach(dash);
  }

  // Roundabout at the centre crossroads — circular island with grass
  const roundabout = MeshBuilder.CreateCylinder(
    "nh_roundabout",
    { diameter: 6, height: 0.18 },
    scene,
  );
  roundabout.position = new Vector3(0, 0.1, 0);
  roundabout.material = mat("roundaboutTrim", "#d8d2c0");
  attach(roundabout);

  const roundaboutGrass = MeshBuilder.CreateCylinder(
    "nh_roundabout_grass",
    { diameter: 4, height: 0.22 },
    scene,
  );
  roundaboutGrass.position = new Vector3(0, 0.12, 0);
  roundaboutGrass.material = mat("grass", "#9bcb7a");
  attach(roundaboutGrass);

  // ----- Reusable builders -----

  const makeBox = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    color: string,
  ): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position = pos;
    m.material = mat(name, color);
    attach(m);
    return m;
  };

  // (Legacy `makeRoof` removed — all roofs now use `makeGableRoof` /
  // `makeSuburbanHouse`, which produce a chunky stepped pitched roof
  // instead of a 45°-rotated diamond box that read as "fake".)

  // A proper stepped voxel gable roof — chunkier and more "real suburb"
  // looking than a 45°-rotated diamond box. The ridge runs along the Z
  // (front-to-back) axis, narrowing in X each step. Used for standalone
  // roofs (the named houses); makeSuburbanHouse inlines the same recipe.
  const makeGableRoof = (
    name: string,
    w: number,
    d: number,
    cx: number,
    cz: number,
    baseY: number,
    color: string,
    eaveColor = "#c8b896",
  ): void => {
    const steps = 4;
    const stepH = 0.32;
    const eaveOverhang = 0.4;
    const roofMat = mat(`${name}_roof`, color);
    const eaveMat = mat(`${name}_eave`, eaveColor);
    const eave = MeshBuilder.CreateBox(
      `${name}_eaveSlab`,
      { width: w + eaveOverhang, height: 0.15, depth: d + eaveOverhang },
      scene,
    );
    eave.position = new Vector3(cx, baseY + 0.075, cz);
    eave.material = eaveMat;
    attach(eave);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const layerW = w * (1 - t * 0.78);
      const layerD = d + eaveOverhang * (1 - t);
      const layer = MeshBuilder.CreateBox(
        `${name}_layer_${i}`,
        { width: layerW, height: stepH, depth: layerD },
        scene,
      );
      layer.position = new Vector3(cx, baseY + 0.15 + stepH * (i + 0.5), cz);
      layer.material = roofMat;
      attach(layer);
    }
    const ridge = MeshBuilder.CreateBox(
      `${name}_ridge`,
      { width: 0.4, height: 0.18, depth: d + eaveOverhang * 0.3 },
      scene,
    );
    ridge.position = new Vector3(cx, baseY + 0.15 + stepH * steps + 0.09, cz);
    ridge.material = mat(`${name}_ridgeMat`, "#3a2a20");
    attach(ridge);
  };

  // Voxel chimney — a small brick stack on top of a roof.
  const makeChimney = (
    cx: number,
    cz: number,
    baseY: number,
    color = "#a23a2c",
  ): void => {
    const stack = MeshBuilder.CreateBox(
      `nh_chim_${cx}_${cz}`,
      { width: 0.55, height: 1.4, depth: 0.55 },
      scene,
    );
    stack.position = new Vector3(cx, baseY + 0.7, cz);
    stack.material = mat(`chim_${color}`, color);
    attach(stack);
    const cap = MeshBuilder.CreateBox(
      `nh_chim_cap_${cx}_${cz}`,
      { width: 0.7, height: 0.12, depth: 0.7 },
      scene,
    );
    cap.position = new Vector3(cx, baseY + 1.46, cz);
    cap.material = mat("chim_cap", "#3a3a3a");
    attach(cap);
  };

  // A windowpane with mullions — a small flat panel of glass divided by
  // thin frame strips. Faces along -Z by default; rotate the host as needed.
  const makeMullionedWindow = (
    name: string,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    facing: "south" | "north" | "east" | "west" = "south",
  ): void => {
    const depthOffset = 0.06;
    const sign = facing === "south" || facing === "east" ? -1 : 1;
    const isXFace = facing === "south" || facing === "north";
    const pane = MeshBuilder.CreateBox(
      `${name}_pane`,
      isXFace
        ? { width: w, height: h, depth: 0.05 }
        : { width: 0.05, height: h, depth: w },
      scene,
    );
    pane.position = new Vector3(
      cx + (isXFace ? 0 : sign * depthOffset),
      cy,
      cz + (isXFace ? sign * depthOffset : 0),
    );
    pane.material = mat("nh_glass", "#cfe7ff");
    attach(pane);

    const frameMat = mat("nh_winFrame", "#f4f0e6");
    // Outer frame (top, bottom, left, right).
    const frameThickness = 0.08;
    const frames: Array<[number, number, number, number]> = [
      // [w, h, dx, dy]
      [w + 0.16, frameThickness, 0, h / 2 + frameThickness / 2],
      [w + 0.16, frameThickness, 0, -h / 2 - frameThickness / 2],
      [frameThickness, h + 0.16, -w / 2 - frameThickness / 2, 0],
      [frameThickness, h + 0.16, w / 2 + frameThickness / 2, 0],
      // mullions: vertical & horizontal cross
      [frameThickness * 0.7, h, 0, 0],
      [w, frameThickness * 0.7, 0, 0],
    ];
    for (let i = 0; i < frames.length; i++) {
      const [fw, fh, dx, dy] = frames[i];
      const f = MeshBuilder.CreateBox(
        `${name}_f_${i}`,
        isXFace
          ? { width: fw, height: fh, depth: 0.07 }
          : { width: 0.07, height: fh, depth: fw },
        scene,
      );
      f.position = new Vector3(
        cx + (isXFace ? dx : sign * (depthOffset + 0.005)),
        cy + dy,
        cz + (isXFace ? sign * (depthOffset + 0.005) : dx),
      );
      f.material = frameMat;
      attach(f);
    }
  };

  // A short run of picket fence in front of a house, between (x1, z) and
  // (x2, z) along the X axis, with optional rotation.
  const makePicketFence = (
    x1: number,
    x2: number,
    z: number,
    rotY = 0,
    color = "#f4f0e6",
  ): void => {
    const length = Math.abs(x2 - x1);
    const cx = (x1 + x2) / 2;
    // Rail
    const rail = MeshBuilder.CreateBox(
      `nh_fence_rail_${cx}_${z}`,
      { width: length, height: 0.08, depth: 0.06 },
      scene,
    );
    rail.position = new Vector3(cx, 0.55, z);
    rail.rotation.y = rotY;
    rail.material = mat("fenceRail", color);
    attach(rail);
    // Pickets
    const pickets = Math.max(2, Math.floor(length / 0.45));
    for (let i = 0; i < pickets; i++) {
      const t = pickets === 1 ? 0.5 : i / (pickets - 1);
      const px = x1 + (x2 - x1) * t;
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const wx = cx + (px - cx) * cosR;
      const wz = z + (px - cx) * sinR;
      const picket = MeshBuilder.CreateBox(
        `nh_fence_p_${cx}_${z}_${i}`,
        { width: 0.12, height: 0.7, depth: 0.08 },
        scene,
      );
      picket.position = new Vector3(wx, 0.45, wz);
      picket.rotation.y = rotY;
      picket.material = mat("fencePicket", color);
      attach(picket);
    }
  };

  // A flagstone front path leading from a sidewalk point to a doorstep.
  const makeFrontPath = (
    name: string,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): void => {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const dist = Math.hypot(dx, dz);
    const tiles = Math.max(2, Math.floor(dist / 0.7));
    const stoneMat = mat("path_stone", "#d8c9a2");
    for (let i = 0; i < tiles; i++) {
      const t = (i + 0.5) / tiles;
      const px = fromX + dx * t;
      const pz = fromZ + dz * t;
      const tile = MeshBuilder.CreateBox(
        `${name}_${i}`,
        { width: 0.55, height: 0.06, depth: 0.55 },
        scene,
      );
      tile.position = new Vector3(px, 0.085, pz);
      tile.material = stoneMat;
      attach(tile);
    }
  };

  // A simple voxel mailbox by the kerb.
  const makeMailbox = (x: number, z: number): void => {
    makeBox(`nh_mb_post_${x}_${z}`, 0.1, 0.9, 0.1, new Vector3(x, 0.45, z), "#5a3a22");
    makeBox(`nh_mb_box_${x}_${z}`, 0.45, 0.3, 0.6, new Vector3(x, 1.0, z), "#3a5fb0");
    makeBox(`nh_mb_flag_${x}_${z}`, 0.05, 0.18, 0.05, new Vector3(x + 0.25, 1.1, z), "#c44a3a");
  };

  // A pale concrete kerb / sidewalk strip alongside a road. Useful to
  // visually separate the asphalt from the verge.
  const makeKerb = (
    name: string,
    width: number,
    depth: number,
    pos: Vector3,
  ): void => {
    const k = MeshBuilder.CreateBox(
      name,
      { width, height: 0.12, depth },
      scene,
    );
    k.position = pos;
    k.material = mat("kerb", "#cfc8b4");
    attach(k);
  };

  // A zebra-stripe pedestrian crossing across a road.
  const makeCrosswalk = (
    name: string,
    cx: number,
    cz: number,
    orient: "ew" | "ns",
    span = 4.6,
  ): void => {
    const stripeMat = mat("crosswalkStripe", "#f4f0e6");
    const stripeCount = 5;
    for (let i = 0; i < stripeCount; i++) {
      const t = (i - (stripeCount - 1) / 2) / stripeCount;
      const offset = t * 1.6;
      const stripe = MeshBuilder.CreateBox(
        `${name}_s_${i}`,
        orient === "ew"
          ? { width: 0.4, height: 0.03, depth: span }
          : { width: span, height: 0.03, depth: 0.4 },
        scene,
      );
      stripe.position =
        orient === "ew"
          ? new Vector3(cx + offset, 0.095, cz)
          : new Vector3(cx, 0.095, cz + offset);
      stripe.material = stripeMat;
      attach(stripe);
    }
  };

  // A small wooden street sign at the corner of an intersection.
  const makeStreetSign = (
    x: number,
    z: number,
    text: string,
    color = "#3a5fb0",
  ): void => {
    const pole = MeshBuilder.CreateBox(
      `nh_st_pole_${x}_${z}`,
      { width: 0.12, height: 2.4, depth: 0.12 },
      scene,
    );
    pole.position = new Vector3(x, 1.2, z);
    pole.material = mat("streetSignPole", "#5a5d65");
    attach(pole);
    const blade = MeshBuilder.CreateBox(
      `nh_st_blade_${x}_${z}`,
      { width: 2.2, height: 0.45, depth: 0.08 },
      scene,
    );
    blade.position = new Vector3(x, 2.3, z);
    attach(blade);
    const tex = new DynamicTexture(
      `nh_st_tex_${x}_${z}`,
      { width: 512, height: 96 },
      scene,
      false,
    );
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.fillStyle = color;
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = "#ffffff";
    c.font = "bold 48px sans-serif";
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.fillText(text, 256, 50);
    tex.update();
    const m = new StandardMaterial(`nh_st_mat_${x}_${z}`, scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.5, 0.5, 0.5);
    m.specularColor = new Color3(0, 0, 0);
    blade.material = m;
  };

  // Build a richer voxel suburban house. The footprint sits centered on
  // (cx, cz). The front of the house faces -Z (south), so the door, path,
  // and mailbox all appear on that side.
  type SuburbanHouseOpts = {
    width?: number;
    depth?: number;
    storeys?: 1 | 2;
    wall: string;
    roof: string;
    trim?: string;
    door?: string;
    chimney?: boolean;
    fence?: boolean;
    fenceColor?: string;
    mailbox?: boolean;
    /** Sidewalk Z line — the front path runs from the door out to here. */
    sidewalkZ?: number;
  };
  const makeSuburbanHouse = (
    name: string,
    cx: number,
    cz: number,
    opts: SuburbanHouseOpts,
  ): void => {
    const width = opts.width ?? 5.2;
    const depth = opts.depth ?? 4.0;
    const storeys = opts.storeys ?? 1;
    const wallH = storeys === 2 ? 4.4 : 2.6;
    const trim = opts.trim ?? "#f4f0e6";
    const door = opts.door ?? "#5a3a22";

    // Foundation slab (a touch wider than the walls).
    makeBox(
      `${name}_found`,
      width + 0.4,
      0.4,
      depth + 0.4,
      new Vector3(cx, 0.2, cz),
      "#9a8f7a",
    );

    // Walls.
    makeBox(
      `${name}_walls`,
      width,
      wallH,
      depth,
      new Vector3(cx, 0.4 + wallH / 2, cz),
      opts.wall,
    );

    // Trim band beneath the eaves.
    makeBox(
      `${name}_trim`,
      width + 0.2,
      0.18,
      depth + 0.2,
      new Vector3(cx, 0.4 + wallH - 0.09, cz),
      trim,
    );

    // Roof (real gable, not a diamond) — inlined to avoid relying on
    // a separate root node for the named house.
    const steps = 4;
    const stepH = 0.32;
    const roofMat = mat(`${name}_roofMat`, opts.roof);
    const eaveMat = mat(`${name}_eaveMat`, trim);
    const roofBaseY = 0.4 + wallH;
    // Eave slab.
    {
      const eave = MeshBuilder.CreateBox(
        `${name}_eave`,
        { width: width + 0.6, height: 0.15, depth: depth + 0.6 },
        scene,
      );
      eave.position = new Vector3(cx, roofBaseY + 0.075, cz);
      eave.material = eaveMat;
      attach(eave);
    }
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const layerW = width * (1 - t * 0.8);
      const layerD = depth + 0.4 * (1 - t);
      const layer = MeshBuilder.CreateBox(
        `${name}_rl_${i}`,
        { width: layerW, height: stepH, depth: layerD },
        scene,
      );
      layer.position = new Vector3(cx, roofBaseY + 0.15 + stepH * (i + 0.5), cz);
      layer.material = roofMat;
      attach(layer);
    }
    // Ridge cap.
    const ridge = MeshBuilder.CreateBox(
      `${name}_ridge`,
      { width: 0.36, height: 0.16, depth: depth + 0.2 },
      scene,
    );
    ridge.position = new Vector3(
      cx,
      roofBaseY + 0.15 + stepH * steps + 0.08,
      cz,
    );
    ridge.material = mat(`${name}_ridgeMat`, "#3a2a20");
    attach(ridge);

    // Door + step.
    makeBox(
      `${name}_door`,
      0.95,
      1.7,
      0.16,
      new Vector3(cx, 0.4 + 0.85, cz - depth / 2 - 0.05),
      door,
    );
    makeBox(
      `${name}_doorstep`,
      1.4,
      0.16,
      0.5,
      new Vector3(cx, 0.5, cz - depth / 2 - 0.3),
      "#cfc8b4",
    );

    // Mullioned windows on the front face (one each side of the door, and
    // a row on the upper storey for two-storey houses).
    makeMullionedWindow(
      `${name}_winL`,
      cx - width * 0.3,
      0.4 + wallH * 0.55,
      cz - depth / 2,
      1.0,
      0.85,
      "south",
    );
    makeMullionedWindow(
      `${name}_winR`,
      cx + width * 0.3,
      0.4 + wallH * 0.55,
      cz - depth / 2,
      1.0,
      0.85,
      "south",
    );
    if (storeys === 2) {
      makeMullionedWindow(
        `${name}_winUL`,
        cx - width * 0.3,
        0.4 + wallH * 0.85,
        cz - depth / 2,
        0.9,
        0.7,
        "south",
      );
      makeMullionedWindow(
        `${name}_winUR`,
        cx + width * 0.3,
        0.4 + wallH * 0.85,
        cz - depth / 2,
        0.9,
        0.7,
        "south",
      );
      makeMullionedWindow(
        `${name}_winUC`,
        cx,
        0.4 + wallH * 0.85,
        cz - depth / 2,
        0.9,
        0.7,
        "south",
      );
    }
    // Side windows.
    makeMullionedWindow(
      `${name}_winSideE`,
      cx + width / 2,
      0.4 + wallH * 0.55,
      cz,
      0.85,
      0.85,
      "east",
    );
    makeMullionedWindow(
      `${name}_winSideW`,
      cx - width / 2,
      0.4 + wallH * 0.55,
      cz,
      0.85,
      0.85,
      "west",
    );

    // Chimney (offset toward the back-right of the roof).
    if (opts.chimney) {
      makeChimney(
        cx + width * 0.28,
        cz + depth * 0.15,
        roofBaseY + 0.4,
      );
    }

    // Front path from door out to the kerb / sidewalk.
    if (opts.sidewalkZ !== undefined) {
      makeFrontPath(
        `${name}_path`,
        cx,
        cz - depth / 2 - 0.3,
        cx,
        opts.sidewalkZ,
      );
      if (opts.mailbox) {
        makeMailbox(cx + 1.2, opts.sidewalkZ + 0.3);
      }
    }

    // Picket fence along the front of the lot.
    if (opts.fence) {
      const fz = (opts.sidewalkZ ?? cz - depth / 2 - 1.5) + 0.5;
      makePicketFence(
        cx - width / 2 - 0.6,
        cx - 0.9,
        fz,
        0,
        opts.fenceColor,
      );
      makePicketFence(
        cx + 0.9,
        cx + width / 2 + 0.6,
        fz,
        0,
        opts.fenceColor,
      );
    }
  };

  // Small voxel tree
  const makeTree = (x: number, z: number, scale = 1): void => {
    makeBox(
      `nh_tree_trunk_${x}_${z}`,
      0.4 * scale,
      1.2 * scale,
      0.4 * scale,
      new Vector3(x, 0.6 * scale, z),
      "#7a4f2a",
    );
    makeBox(
      `nh_tree_leaves_${x}_${z}`,
      1.4 * scale,
      1.4 * scale,
      1.4 * scale,
      new Vector3(x, 1.7 * scale, z),
      "#5fa657",
    );
  };

  // Small voxel person — used so the streets feel alive. We don't animate
  // them; the office scene has the live agent simulation. Here they're
  // built with the **same** `VoxelCharacter` class the office uses, so a
  // customer in the neighbourhood looks identical to the same persona
  // when they arrive at the office reception. `paletteKey` selects one
  // of the entries in `PALETTES` (e.g. "customerHome", "intakeOfficer").
  const makePerson = (
    x: number,
    z: number,
    paletteKey: keyof typeof PALETTES = "customerHome",
    faceTowards?: { x: number; z: number },
  ): void => {
    const palette = PALETTES[paletteKey];
    const id = `${paletteKey}_${x.toFixed(1)}_${z.toFixed(1)}`;
    const c = new VoxelCharacter(scene, `nh_${id}`, palette);
    c.root.parent = root;
    c.root.position = new Vector3(x, 0, z);
    if (faceTowards) {
      c.root.rotation.y = Math.atan2(faceTowards.x - x, faceTowards.z - z);
    }
  };

  // Incident marker — a floating "!" bubble above an incident.
  const makeIncidentMarker = (
    x: number,
    y: number,
    z: number,
    icon: "water" | "car" | "fire" | "luggage" | "heart" | "fraud",
  ): void => {
    const bubble = MeshBuilder.CreateBox(
      `nh_marker_${x}_${z}`,
      { width: 0.9, height: 0.9, depth: 0.18 },
      scene,
    );
    bubble.position = new Vector3(x, y, z);
    const bubbleMat = new StandardMaterial(`nh_marker_mat_${x}_${z}`, scene);
    bubbleMat.diffuseColor = Color3.FromHexString("#fff5d6");
    bubbleMat.emissiveColor = Color3.FromHexString("#ffd166");
    bubble.material = bubbleMat;
    attach(bubble);

    const tex = new DynamicTexture(
      `nh_marker_tex_${x}_${z}`,
      { width: 128, height: 128 },
      scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#fff5d6";
    ctx.fillRect(0, 0, 128, 128);

    const symbols: Record<typeof icon, { color: string; glyph: string }> = {
      water: { color: "#3a8fd6", glyph: "💧" },
      car: { color: "#c44a3a", glyph: "🚗" },
      fire: { color: "#e07a2c", glyph: "🔥" },
      luggage: { color: "#8a5a2a", glyph: "🧳" },
      heart: { color: "#c2566f", glyph: "♥" },
      fraud: { color: "#5c4a8a", glyph: "🔍" },
    };
    const sym = symbols[icon];
    ctx.fillStyle = sym.color;
    ctx.font = "bold 96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sym.glyph, 64, 70);
    // exclamation mark above
    ctx.fillStyle = "#1c2230";
    ctx.font = "bold 38px sans-serif";
    ctx.fillText("!", 64, 22);
    tex.update();

    const faceMat = new StandardMaterial(`nh_marker_face_${x}_${z}`, scene);
    faceMat.diffuseTexture = tex;
    faceMat.emissiveColor = new Color3(0.6, 0.6, 0.6);
    faceMat.specularColor = new Color3(0, 0, 0);
    bubble.material = faceMat;
  };

  // A small map-pin label that sits above a zone.
  const makeLabel = (
    x: number,
    z: number,
    text: string,
    color = "#1c2230",
  ): void => {
    const sign = MeshBuilder.CreateBox(
      `nh_label_${x}_${z}`,
      { width: 4.4, height: 0.9, depth: 0.12 },
      scene,
    );
    sign.position = new Vector3(x, 4.4, z);
    sign.rotation.y = -Math.PI / 6;
    attach(sign);

    const tex = new DynamicTexture(
      `nh_label_tex_${x}_${z}`,
      { width: 512, height: 128 },
      scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#fff8e6";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 12, 128);
    ctx.fillStyle = "#1c2230";
    ctx.font = "bold 44px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 64);
    tex.update();

    const m = new StandardMaterial(`nh_label_mat_${x}_${z}`, scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.55, 0.55, 0.55);
    m.specularColor = new Color3(0, 0, 0);
    sign.material = m;

    // Tiny pole under the sign
    const pole = MeshBuilder.CreateBox(
      `nh_label_pole_${x}_${z}`,
      { width: 0.15, height: 4.0, depth: 0.15 },
      scene,
    );
    pole.position = new Vector3(x, 2.0, z);
    pole.material = mat("labelPole", "#7a7a7a");
    attach(pole);
  };

  // A subtle dashed path line tracing a customer's route from an incident
  // zone toward the Zava Insurance Claims Office. The theme guide calls these out as
  // "a subtle path line showing the customer's route to the claims office".
  // We emit a series of short, low-profile tiles between two points.
  const makePathLine = (
    name: string,
    from: { x: number; z: number },
    to: { x: number; z: number },
    color = "#f0d985",
  ): void => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.floor(dist / 1.6));
    const stepMat = mat(`pathLine_${color}`, color);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const px = from.x + dx * t;
      const pz = from.z + dz * t;
      const tile = MeshBuilder.CreateBox(
        `${name}_${i}`,
        { width: 0.55, height: 0.04, depth: 0.55 },
        scene,
      );
      tile.position = new Vector3(px, 0.085, pz);
      tile.material = stepMat;
      attach(tile);
    }
  };

  // ----- Construction-pack-style prop builders -----
  // These are original procedural voxel meshes inspired by the look of
  // generic MagicaVoxel construction packs (chunky steel poles, striped
  // barriers, traffic cones, timber/brick stacks, cement mixer, small
  // crane). They give the scene a builder/repair vibe to match scenarios
  // 3 (home rebuild) and 4 (cafe rebuild).

  // Striped traffic barrier (white body with red ends).
  const makeBarrier = (x: number, z: number, rotY = 0): void => {
    const body = MeshBuilder.CreateBox(
      `nh_barrier_body_${x}_${z}`,
      { width: 2.4, height: 0.5, depth: 0.2 },
      scene,
    );
    body.position = new Vector3(x, 0.55, z);
    body.rotation.y = rotY;
    body.material = mat("barrierBody", "#f4f0e6");
    attach(body);
    for (const dx of [-1.0, 1.0]) {
      const cap = MeshBuilder.CreateBox(
        `nh_barrier_cap_${x}_${z}_${dx}`,
        { width: 0.4, height: 0.5, depth: 0.22 },
        scene,
      );
      const cz = Math.sin(rotY) * dx;
      const cx = Math.cos(rotY) * dx;
      cap.position = new Vector3(x + cx, 0.55, z + cz);
      cap.rotation.y = rotY;
      cap.material = mat("barrierCap", "#c44a3a");
      attach(cap);
    }
    // Trestle legs
    for (const dx of [-0.9, 0.9]) {
      const leg = MeshBuilder.CreateBox(
        `nh_barrier_leg_${x}_${z}_${dx}`,
        { width: 0.12, height: 0.6, depth: 0.5 },
        scene,
      );
      const cz = Math.sin(rotY) * dx;
      const cx = Math.cos(rotY) * dx;
      leg.position = new Vector3(x + cx, 0.3, z + cz);
      leg.rotation.y = rotY;
      leg.material = mat("barrierLeg", "#3a3a3a");
      attach(leg);
    }
  };

  // Small traffic cone — orange with a white reflective stripe.
  const makeCone = (x: number, z: number): void => {
    const base = MeshBuilder.CreateBox(
      `nh_cone_base_${x}_${z}`,
      { width: 0.4, height: 0.08, depth: 0.4 },
      scene,
    );
    base.position = new Vector3(x, 0.04, z);
    base.material = mat("coneBase", "#3a3a3a");
    attach(base);
    const body = MeshBuilder.CreateBox(
      `nh_cone_body_${x}_${z}`,
      { width: 0.28, height: 0.45, depth: 0.28 },
      scene,
    );
    body.position = new Vector3(x, 0.32, z);
    body.material = mat("coneBody", "#e07a2c");
    attach(body);
    const stripe = MeshBuilder.CreateBox(
      `nh_cone_stripe_${x}_${z}`,
      { width: 0.3, height: 0.08, depth: 0.3 },
      scene,
    );
    stripe.position = new Vector3(x, 0.36, z);
    stripe.material = mat("coneStripe", "#fff5d6");
    attach(stripe);
  };

  // Stack of timber planks.
  const makeTimberStack = (x: number, z: number): void => {
    for (let i = 0; i < 4; i++) {
      const plank = MeshBuilder.CreateBox(
        `nh_timber_${x}_${z}_${i}`,
        { width: 2.4, height: 0.18, depth: 0.6 },
        scene,
      );
      plank.position = new Vector3(x, 0.12 + i * 0.2, z);
      plank.material = mat(
        i % 2 === 0 ? "timberA" : "timberB",
        i % 2 === 0 ? "#c98a4a" : "#a86a3a",
      );
      attach(plank);
    }
  };

  // Pile of bricks.
  const makeBrickPile = (x: number, z: number): void => {
    for (let row = 0; row < 3; row++) {
      const offset = row * 0.05;
      for (let col = -1; col <= 1; col++) {
        const b = MeshBuilder.CreateBox(
          `nh_brick_${x}_${z}_${row}_${col}`,
          { width: 0.55, height: 0.22, depth: 0.32 },
          scene,
        );
        b.position = new Vector3(x + col * 0.6 + offset, 0.13 + row * 0.24, z);
        b.material = mat("brick", row === 1 ? "#a23a2c" : "#b04a3a");
        attach(b);
      }
    }
  };

  // Cement mixer — drum on a small wheeled chassis.
  const makeCementMixer = (x: number, z: number): void => {
    // Frame
    makeBox(`nh_mixer_frame_${x}_${z}`, 1.2, 0.25, 0.7, new Vector3(x, 0.15, z), "#e07a2c");
    // Drum (rotated box for a chunky barrel look)
    const drum = MeshBuilder.CreateBox(
      `nh_mixer_drum_${x}_${z}`,
      { width: 1.0, height: 0.9, depth: 0.9 },
      scene,
    );
    drum.position = new Vector3(x, 0.85, z);
    drum.rotation.z = Math.PI / 8;
    drum.material = mat("mixerDrum", "#ffd166");
    attach(drum);
    // Wheels
    for (const dx of [-0.45, 0.45]) {
      const w = MeshBuilder.CreateBox(
        `nh_mixer_wheel_${x}_${z}_${dx}`,
        { width: 0.18, height: 0.3, depth: 0.3 },
        scene,
      );
      w.position = new Vector3(x + dx, 0.15, z + 0.3);
      w.material = mat("mixerWheel", "#1c2230");
      attach(w);
    }
    // Handle / spout
    makeBox(`nh_mixer_handle_${x}_${z}`, 0.1, 0.7, 0.1, new Vector3(x - 0.6, 0.6, z), "#3a3a3a");
  };

  // Scaffolding frame around (cx, cz) with given footprint width/depth.
  // Builds two storeys of horizontal rails plus corner poles and a plank
  // walkway on the upper level.
  const makeScaffold = (
    cx: number,
    cz: number,
    width: number,
    depth: number,
  ): void => {
    const halfW = width / 2;
    const halfD = depth / 2;
    const poleMat = "#9aa0a8";
    const railMat = "#b8b0a0";
    const plankMat = "#c98a4a";
    const height = 4.0;
    // Vertical poles at corners + midpoints
    const poleXs = [-halfW, 0, halfW];
    const poleZs = [-halfD, halfD];
    for (const px of poleXs) {
      for (const pz of poleZs) {
        const pole = MeshBuilder.CreateBox(
          `nh_scaff_pole_${cx}_${cz}_${px}_${pz}`,
          { width: 0.15, height, depth: 0.15 },
          scene,
        );
        pole.position = new Vector3(cx + px, height / 2, cz + pz);
        pole.material = mat("scaffPole", poleMat);
        attach(pole);
      }
    }
    // Horizontal rails (front and back) at two heights
    for (const railY of [1.6, 3.2]) {
      for (const pz of poleZs) {
        const rail = MeshBuilder.CreateBox(
          `nh_scaff_rail_${cx}_${cz}_${railY}_${pz}`,
          { width: width + 0.15, height: 0.1, depth: 0.1 },
          scene,
        );
        rail.position = new Vector3(cx, railY, cz + pz);
        rail.material = mat("scaffRail", railMat);
        attach(rail);
      }
    }
    // Plank walkway on the front face at mid level
    const plank = MeshBuilder.CreateBox(
      `nh_scaff_plank_${cx}_${cz}`,
      { width: width + 0.05, height: 0.08, depth: 0.5 },
      scene,
    );
    plank.position = new Vector3(cx, 2.0, cz - halfD);
    plank.material = mat("scaffPlank", plankMat);
    attach(plank);
  };

  // Small fixed-base voxel crane: tower + horizontal jib + counterweight.
  const makeCrane = (cx: number, cz: number): void => {
    // Base pad
    makeBox(`nh_crane_pad_${cx}_${cz}`, 1.6, 0.2, 1.6, new Vector3(cx, 0.1, cz), "#5a5d65");
    // Tower (stacked segments for a lattice-y feel)
    for (let i = 0; i < 4; i++) {
      makeBox(
        `nh_crane_seg_${cx}_${cz}_${i}`,
        0.6,
        1.6,
        0.6,
        new Vector3(cx, 1.0 + i * 1.6, cz),
        i % 2 === 0 ? "#ffd166" : "#e8b85a",
      );
    }
    // Cab at top
    makeBox(`nh_crane_cab_${cx}_${cz}`, 1.0, 0.7, 0.9, new Vector3(cx, 7.7, cz), "#3a3a3a");
    // Horizontal jib (forward arm)
    makeBox(`nh_crane_jib_${cx}_${cz}`, 5.0, 0.25, 0.4, new Vector3(cx + 1.8, 8.05, cz), "#ffd166");
    // Short counter-jib
    makeBox(
      `nh_crane_cjib_${cx}_${cz}`,
      1.6,
      0.25,
      0.4,
      new Vector3(cx - 1.4, 8.05, cz),
      "#ffd166",
    );
    // Counterweight
    makeBox(`nh_crane_cw_${cx}_${cz}`, 0.8, 0.6, 0.6, new Vector3(cx - 2.0, 7.95, cz), "#1c2230");
    // Hook line
    makeBox(`nh_crane_line_${cx}_${cz}`, 0.06, 2.4, 0.06, new Vector3(cx + 3.6, 6.8, cz), "#1c2230");
    makeBox(`nh_crane_hook_${cx}_${cz}`, 0.3, 0.3, 0.3, new Vector3(cx + 3.6, 5.5, cz), "#3a3a3a");
  };

  // Builder's tipper truck — cab + open tipping bin with a load of gravel.
  const makeBuilderTruck = (x: number, z: number): void => {
    makeBox(`nh_btruck_chassis_${x}_${z}`, 3.4, 0.3, 1.4, new Vector3(x, 0.35, z), "#1c2230");
    makeBox(`nh_btruck_cab_${x}_${z}`, 1.2, 1.0, 1.3, new Vector3(x - 1.0, 1.0, z), "#3a8fd6");
    makeBox(`nh_btruck_cabwin_${x}_${z}`, 1.0, 0.45, 1.32, new Vector3(x - 1.0, 1.2, z), "#cfe7ff");
    makeBox(`nh_btruck_bin_${x}_${z}`, 2.0, 0.9, 1.3, new Vector3(x + 0.6, 0.95, z), "#c44a3a");
    // Gravel mound on top
    makeBox(`nh_btruck_load_${x}_${z}`, 1.7, 0.3, 1.1, new Vector3(x + 0.6, 1.55, z), "#9aa0a8");
    // Wheels
    for (const dx of [-1.0, 0.2, 1.4]) {
      makeBox(
        `nh_btruck_wheel_${x}_${z}_${dx}`,
        0.4,
        0.4,
        0.3,
        new Vector3(x + dx, 0.2, z + 0.65),
        "#1c2230",
      );
      makeBox(
        `nh_btruck_wheel2_${x}_${z}_${dx}`,
        0.4,
        0.4,
        0.3,
        new Vector3(x + dx, 0.2, z - 0.65),
        "#1c2230",
      );
    }
  };

  // Skip / construction dumpster.
  const makeSkip = (x: number, z: number): void => {
    makeBox(`nh_skip_body_${x}_${z}`, 2.6, 0.9, 1.4, new Vector3(x, 0.5, z), "#e07a2c");
    makeBox(`nh_skip_inner_${x}_${z}`, 2.4, 0.85, 1.25, new Vector3(x, 0.55, z), "#3a3a3a");
    // Rubble inside
    makeBox(`nh_skip_rubble_${x}_${z}`, 2.2, 0.25, 1.1, new Vector3(x, 0.85, z), "#a23a2c");
  };

  // ----- Side streets, sidewalks, and crossings -----
  // Adding more streets so the neighbourhood reads as a real suburb with
  // a connected road grid, not just a single cross-shape. Each side
  // street has its own kerbs (sidewalks), centre dashes, and a named
  // street sign at the corner.
  const sideRoadDash = (
    name: string,
    along: "x" | "z",
    fixed: number,
    from: number,
    to: number,
  ): void => {
    for (let v = from; v <= to; v += 3.2) {
      // Skip dashes that fall inside the central main-road asphalt at the
      // intersection. The main horizontal road occupies z∈[-2.5, 2.5] and
      // the main vertical road occupies x∈[-2.5, 2.5]; with a small kerb
      // buffer of ±0.6 a side-road dash anywhere in |v|<3.1 of the cross
      // axis lands on the main road's tarmac and reads as an extra
      // "floating" dotted line on top of the intersection.
      if (along === "x") {
        // Side road runs east-west at z=fixed; it crosses the main vertical
        // road at x≈0. Skip dashes that would sit on the main vertical
        // road's asphalt.
        if (Math.abs(v) < 3.1) continue;
      } else {
        // Side road runs north-south at x=fixed; it crosses the main
        // horizontal road at z≈0.
        if (Math.abs(v) < 3.1) continue;
      }
      const dash = MeshBuilder.CreateBox(
        `${name}_${v}`,
        along === "x"
          ? { width: 1.2, height: 0.02, depth: 0.16 }
          : { width: 0.16, height: 0.02, depth: 1.2 },
        scene,
      );
      dash.position =
        along === "x"
          ? new Vector3(v, 0.085, fixed)
          : new Vector3(fixed, 0.085, v);
      dash.material = roadLine;
      attach(dash);
    }
  };

  // Maple Crescent — east-west residential street running through the
  // northern half, in front of the home-claims zone. Extended west across
  // the main vertical road (now reaches x≈-14) so the upper neighbourhood
  // is no longer split in two by the previous gap at x=0..6. Stops short
  // of the travel hub terminal (x≈-16) so it doesn't slice through that
  // building.
  makeRoad("nh_road_maple", 48, 3.5, new Vector3(10, 0.05, 20));
  sideRoadDash("nh_dash_maple", "x", 20, -12, 32);
  // Side kerbs (sidewalks) along Maple Crescent.
  makeKerb("nh_kerb_maple_n", 48, 0.9, new Vector3(10, 0.07, 22.2));
  makeKerb("nh_kerb_maple_s", 48, 0.9, new Vector3(10, 0.07, 17.8));

  // Birch Lane — east-west street serving the southern apartment / civic
  // area. Sits between the central road and the apartment block. Extended
  // east to x≈38 so it now bridges Elm Court (x=22) and Oak Drive (x=33)
  // — previously the eastern half was disconnected, leaving a gap south
  // of the Northside Smash Repairs garage / Builder's Yard area.
  makeRoad("nh_road_birch", 66, 3.5, new Vector3(5, 0.05, -10));
  sideRoadDash("nh_dash_birch", "x", -10, -26, 36);
  makeKerb("nh_kerb_birch_n", 66, 0.9, new Vector3(5, 0.07, -7.8));
  makeKerb("nh_kerb_birch_s", 66, 0.9, new Vector3(5, 0.07, -12.2));

  // Oak Drive — north-south street on the east side, connecting Maple
  // Crescent to the main road. Placed at x=33 so it sits clear of the
  // Northside Smash Repairs garage at x≈26-29.
  makeRoad("nh_road_oak", 3.5, 28, new Vector3(33, 0.05, 8));
  sideRoadDash("nh_dash_oak", "z", 33, -6, 22);
  makeKerb("nh_kerb_oak_e", 0.9, 28, new Vector3(35.2, 0.07, 8));
  makeKerb("nh_kerb_oak_w", 0.9, 28, new Vector3(30.8, 0.07, 8));

  // Cedar Way — short north-south street west of the office, linking the
  // travel hub area to the main road.
  makeRoad("nh_road_cedar", 3.5, 22, new Vector3(-26, 0.05, 8));
  sideRoadDash("nh_dash_cedar", "z", -26, -2, 18);
  makeKerb("nh_kerb_cedar_e", 0.9, 22, new Vector3(-23.8, 0.07, 8));
  makeKerb("nh_kerb_cedar_w", 0.9, 22, new Vector3(-28.2, 0.07, 8));

  // Sidewalks along the main east-west and north-south roads. They sit
  // just outside the asphalt (which is 5 wide centred on 0).
  makeKerb("nh_kerb_main_n", 80, 0.9, new Vector3(0, 0.07, 2.95));
  makeKerb("nh_kerb_main_s", 80, 0.9, new Vector3(0, 0.07, -2.95));
  makeKerb("nh_kerb_main_e", 0.9, 80, new Vector3(2.95, 0.07, 0));
  makeKerb("nh_kerb_main_w", 0.9, 80, new Vector3(-2.95, 0.07, 0));

  // Zebra crossings around the central roundabout — four approaches.
  // Shifted out from ±4.6 to ±5.5 so the stripes sit cleanly on the road
  // asphalt rather than overlapping the cream-coloured roundabout disc
  // (radius 3) which previously looked like extra white blobs hugging the
  // roundabout. Span shortened to 2.4 to keep the stripes inside the 5-wide
  // road and avoid spilling onto the kerbs / grass.
  makeCrosswalk("nh_xw_n", 0, 5.5, "ew", 2.4);
  makeCrosswalk("nh_xw_s", 0, -5.5, "ew", 2.4);
  makeCrosswalk("nh_xw_e", 5.5, 0, "ns", 2.4);
  makeCrosswalk("nh_xw_w", -5.5, 0, "ns", 2.4);

  // Street name signs at the corners of the new streets.
  makeStreetSign(7.0, 22.5, "MAPLE CRESCENT", "#3a8fd6");
  makeStreetSign(7.0, -12.5, "BIRCH LANE", "#5a8a4a");
  makeStreetSign(36.5, 6.0, "OAK DRIVE", "#c44a3a");
  makeStreetSign(-29.5, 6.0, "CEDAR WAY", "#7a4f9c");

  // Willow Avenue — new south-side east-west connector at z=-22. Threads
  // between the south-west mid-rise cluster, the apartment block, and
  // the Builder's Yard so those outlying lots are no longer dead-ended.
  makeRoad("nh_road_willow", 48, 3.5, new Vector3(8, 0.05, -22));
  sideRoadDash("nh_dash_willow", "x", -22, -14, 30);
  makeKerb("nh_kerb_willow_n", 48, 0.9, new Vector3(8, 0.07, -19.8));
  makeKerb("nh_kerb_willow_s", 48, 0.9, new Vector3(8, 0.07, -24.2));
  makeStreetSign(-15.0, -19.0, "WILLOW AVENUE", "#5a8a4a");

  // Elm Court — short north-south spur at x=22 linking the east end of
  // Birch Lane (z=-10) to Willow Avenue (z=-22). Routes traffic from
  // the main grid down to the Builder's Yard end of town.
  makeRoad("nh_road_elm", 3.5, 14, new Vector3(22, 0.05, -16));
  sideRoadDash("nh_dash_elm", "z", 22, -22, -10);
  makeKerb("nh_kerb_elm_e", 0.9, 14, new Vector3(24.2, 0.07, -16));
  makeKerb("nh_kerb_elm_w", 0.9, 14, new Vector3(19.8, 0.07, -16));
  makeStreetSign(25.0, -10.5, "ELM COURT", "#7a4a3a");

  // Pine Court — short north-south spur at x=-10 linking Birch Lane
  // (z=-10) down to the apartment block / Willow Avenue (z=-22) so the
  // contents-claim apartment is a proper street address rather than
  // sitting on grass.
  makeRoad("nh_road_pine", 3.5, 12, new Vector3(-10, 0.05, -16));
  sideRoadDash("nh_dash_pine", "z", -10, -22, -10);
  makeKerb("nh_kerb_pine_e", 0.9, 12, new Vector3(-7.8, 0.07, -16));
  makeKerb("nh_kerb_pine_w", 0.9, 12, new Vector3(-12.2, 0.07, -16));
  makeStreetSign(-13.0, -10.5, "PINE COURT", "#3a5fb0");

  // Extra suburban houses lining the new streets — these use the full
  // makeSuburbanHouse recipe so the grid reads as a real neighbourhood
  // rather than scattered boxes.
  // Maple Crescent (north side, facing south onto the street). The
  // centre Z is chosen so foundation/eaves sit clear of the north kerb
  // at z≈22.65 (kerb_maple_n centred at 22.2 with depth 0.9).
  makeSuburbanHouse("nh_maple_a", 12, 25.6, {
    wall: "#e7d6c0", roof: "#7a4a3a", chimney: true, fence: true,
    mailbox: true, sidewalkZ: 22.8, storeys: 1,
  });
  makeSuburbanHouse("nh_maple_b", 22, 25.6, {
    wall: "#cfe1f0", roof: "#3a5fb0", chimney: true, fence: true,
    mailbox: true, sidewalkZ: 22.8, storeys: 2,
    fenceColor: "#e7d8c0",
  });
  makeSuburbanHouse("nh_maple_c", 30, 25.6, {
    wall: "#f0d6b0", roof: "#5a6a7c", chimney: true, fence: true,
    mailbox: true, sidewalkZ: 22.8, storeys: 1,
  });
  // (The previous "Maple back row" silhouettes used to sit on z=17.6 but
  // that band overlaps both the south kerb of Maple Crescent and the
  // back of the residential zone 1 houses at z=14, so the row has been
  // removed in favour of clean grass between the two streets.)

  // Birch Lane (north side, facing south). Houses are now placed clear
  // of the north kerb (kerb_birch_n covers z≈-7.35..-8.25) so the
  // foundation and front step sit on grass / sidewalk rather than the
  // road surface.
  makeSuburbanHouse("nh_birch_a", -22, -5.0, {
    wall: "#e7d6c0", roof: "#5a4a3a", chimney: true, fence: true,
    mailbox: true, sidewalkZ: -7.2, storeys: 1,
  });
  makeSuburbanHouse("nh_birch_b", 12, -5.0, {
    wall: "#f0d6b0", roof: "#7a4a3a", chimney: true, fence: true,
    mailbox: true, sidewalkZ: -7.2, storeys: 1,
  });

  // Oak Drive (east side, facing west — built as a custom rotated frame).
  // ox is chosen so the foundation (width 4.6) starts east of the east
  // kerb (kerb_oak_e covers x≈34.75..35.65) — the front step lands on
  // the sidewalk rather than overlapping the kerb stripe.
  for (const [oz, owall, oroof] of [
    [16, "#cfe1f0", "#3a5fb0"],
    [6, "#f0e6d2", "#5a6a7c"],
    [-2, "#e7c8a0", "#7a4a3a"],
  ] as Array<[number, string, string]>) {
    const ox = 38.2;
    makeBox(`nh_oak_found_${oz}`, 4.6, 0.4, 4.0, new Vector3(ox, 0.2, oz), "#9a8f7a");
    makeBox(`nh_oak_walls_${oz}`, 4.2, 2.6, 3.6, new Vector3(ox, 1.7, oz), owall);
    makeGableRoof(`nh_oak_roof_${oz}`, 4.0, 3.6, ox, oz, 3.0, oroof, "#f4f0e6");
    makeChimney(ox - 1.0, oz - 0.5, 3.4, "#7a4a3a");
    // Door + windows face west toward the street.
    makeBox(`nh_oak_door_${oz}`, 0.16, 1.7, 0.95, new Vector3(ox - 2.15, 0.85, oz), "#5a3a22");
    makeBox(`nh_oak_step_${oz}`, 0.5, 0.16, 1.4, new Vector3(ox - 2.4, 0.5, oz), "#cfc8b4");
    makeMullionedWindow(`nh_oak_winN_${oz}`, ox - 2.1, 1.7, oz - 1.2, 0.85, 0.85, "west");
    makeMullionedWindow(`nh_oak_winS_${oz}`, ox - 2.1, 1.7, oz + 1.2, 0.85, 0.85, "west");
    makeFrontPath(`nh_oak_path_${oz}`, ox - 2.6, oz, 35.5, oz);
    makeMailbox(35.6, oz - 1.6);
  }

  // ----- Zava Insurance Claims Office (central anchor) -----
  // The office sits just north-west of the roundabout so the front door
  // faces the central crossroads.
  const officeRoot = new TransformNode("nh_office_root", scene);
  officeRoot.parent = root;
  // Shifted slightly west (was -7) so the right-hand wall clears the
  // central north-south asphalt (which spans x=-2.5..2.5). Keeps the
  // front door facing the roundabout for the customer walk-in path.
  officeRoot.position = new Vector3(-10, 0, 8);

  const officeBase = MeshBuilder.CreateBox(
    "nh_office_base",
    { width: 12, height: 6.0, depth: 8 },
    scene,
  );
  officeBase.position = new Vector3(0, 3.0, 0);
  officeBase.material = mat("officeBase", "#efe0c8");
  officeBase.parent = officeRoot;

  // Floor-divider band between the two storeys — a thin trim that visually
  // separates ground floor (door + sign) from the upper floor windows.
  const officeBand = MeshBuilder.CreateBox(
    "nh_office_band",
    { width: 12.2, height: 0.2, depth: 8.2 },
    scene,
  );
  officeBand.position = new Vector3(0, 3.0, 0);
  officeBand.material = mat("officeBand", "#d8c9a2");
  officeBand.parent = officeRoot;

  // Pitched (gable) roof — replaces the previous flat slab so the office
  // reads as a small two-storey building rather than a shoebox. Ridge runs
  // along the Z (front-to-back) axis so the gable face is visible from the
  // street side.
  makeGableRoof("nh_office_roof", 12, 8, 0, 0, 6.0, "#3a5fb0", "#cfd6e6");
  // makeGableRoof attaches to scene root, so reparent its created meshes
  // (eave slab + 4 layers + ridge) under the officeRoot transform so the
  // roof moves with the rest of the office.
  for (const n of [
    "nh_office_roof_eaveSlab",
    "nh_office_roof_layer_0",
    "nh_office_roof_layer_1",
    "nh_office_roof_layer_2",
    "nh_office_roof_layer_3",
    "nh_office_roof_ridge",
  ]) {
    const m = scene.getMeshByName(n);
    if (m) m.parent = officeRoot;
  }

  // Office sign
  const officeSign = MeshBuilder.CreateBox(
    "nh_office_sign",
    { width: 8, height: 1.4, depth: 0.2 },
    scene,
  );
  officeSign.position = new Vector3(0, 2.55, -4.05);
  officeSign.parent = officeRoot;

  const signTex = new DynamicTexture(
    "nh_office_sign_tex",
    { width: 1024, height: 200 },
    scene,
    false,
  );
  const sctx = signTex.getContext() as CanvasRenderingContext2D;
  sctx.fillStyle = "#2a3a5c";
  sctx.fillRect(0, 0, 1024, 200);
  sctx.fillStyle = "#ffb347";
  sctx.fillRect(20, 30, 140, 140);
  sctx.fillStyle = "#1c2230";
  sctx.font = "bold 110px sans-serif";
  sctx.textBaseline = "middle";
  sctx.fillText("Z", 70, 105);
  sctx.fillStyle = "#ffffff";
  sctx.font = "bold 90px sans-serif";
  sctx.fillText("ZAVA INSURANCE", 200, 110);
  signTex.update();

  const signMat = new StandardMaterial("nh_office_sign_mat", scene);
  signMat.diffuseTexture = signTex;
  signMat.emissiveColor = new Color3(0.4, 0.4, 0.4);
  signMat.specularColor = new Color3(0, 0, 0);
  officeSign.material = signMat;

  // Front door
  const door = MeshBuilder.CreateBox(
    "nh_office_door",
    { width: 1.6, height: 2.4, depth: 0.18 },
    scene,
  );
  door.position = new Vector3(0, 1.2, -4.02);
  door.material = mat("officeDoor", "#7a4f2a");
  door.parent = officeRoot;

  // Office windows — upper storey (front face) sits above the floor band.
  // The ground floor face is taken up by the entrance + signage so windows
  // there would overlap the sign.
  const winMat = mat("officeWin", "#cfe7ff");
  for (const wx of [-4.4, -2.2, 2.2, 4.4]) {
    const w = MeshBuilder.CreateBox(
      `nh_office_winU_${wx}`,
      { width: 1.4, height: 1.2, depth: 0.1 },
      scene,
    );
    w.position = new Vector3(wx, 4.6, -4.03);
    w.material = winMat;
    w.parent = officeRoot;
  }
  // Side windows (east + west) on the upper storey so the building doesn't
  // look blank from the roundabout / pathway sides.
  for (const wz of [-2.2, 0, 2.2]) {
    const wE = MeshBuilder.CreateBox(
      `nh_office_winE_${wz}`,
      { width: 0.1, height: 1.2, depth: 1.2 },
      scene,
    );
    wE.position = new Vector3(6.03, 4.6, wz);
    wE.material = winMat;
    wE.parent = officeRoot;
    const wW = MeshBuilder.CreateBox(
      `nh_office_winW_${wz}`,
      { width: 0.1, height: 1.2, depth: 1.2 },
      scene,
    );
    wW.position = new Vector3(-6.03, 4.6, wz);
    wW.material = winMat;
    wW.parent = officeRoot;
  }

  // Small pathway from the office door to the roundabout
  const path = MeshBuilder.CreateBox(
    "nh_office_path",
    { width: 1.6, height: 0.05, depth: 6 },
    scene,
  );
  path.position = new Vector3(-10, 0.08, 4.5);
  path.material = mat("path", "#d8c9a2");
  attach(path);

  // Office label
  makeLabel(-10, 13, "Zava Insurance Claims Office", "#2a3a5c");

  // ----- Captures: scenery meshes referenced by incident animations -----
  // These are populated as each zone is built below, then handed to the
  // ambient controller at the very end so each scenario can replay its
  // "story of the accident" animation when started.
  let homePuddle: Mesh | null = null;
  let homeKitchenSource: Vector3 | null = null;
  let motorLeadCar: Mesh[] = [];
  let motorRearCar: Mesh[] = [];
  let motorContact: Vector3 | null = null;
  let cafeSmokeMeshes: Mesh[] = [];
  let cafeFlickerAt: Vector3 | null = null;
  let travelSuitcase: Mesh | null = null;
  let travelTrolleyTop: Vector3 | null = null;
  let travelLostRest: Vector3 | null = null;
  let lifeHomeCenter: Vector3 | null = null;

  // ----- Zone 1: Residential Street — Home Insurance (burst pipe) -----
  // North-east quadrant
  {
    const zx = 16;
    const zz = 14;

    // House 1 (the burst-pipe house) — replaces the diamond-roof box with
    // a full suburban look: foundation, mullioned windows, chimney,
    // pitched gable roof, picket fence, front path.
    makeBox("nh_home_h1_found", 5.4, 0.4, 4.4, new Vector3(zx, 0.2, zz), "#9a8f7a");
    makeBox("nh_home_h1_base", 5, 2.6, 4, new Vector3(zx, 1.7, zz), "#e7c8a0");
    makeBox(
      "nh_home_h1_trim",
      5.2,
      0.18,
      4.2,
      new Vector3(zx, 2.91, zz),
      "#f4f0e6",
    );
    makeGableRoof("nh_home_h1_roof", 4.8, 4, zx, zz, 3.0, "#b04a3a", "#f4f0e6");
    makeChimney(zx + 1.4, zz + 0.6, 3.4, "#a23a2c");
    makeBox("nh_home_h1_door", 0.95, 1.7, 0.16, new Vector3(zx, 0.85, zz - 2.05), "#5a3a22");
    makeBox("nh_home_h1_step", 1.4, 0.16, 0.5, new Vector3(zx, 0.5, zz - 2.3), "#cfc8b4");
    makeMullionedWindow("nh_home_h1_winL", zx - 1.55, 1.7, zz - 2.0, 1.0, 0.85, "south");
    makeMullionedWindow("nh_home_h1_winR", zx + 1.55, 1.7, zz - 2.0, 1.0, 0.85, "south");
    makeMullionedWindow("nh_home_h1_winE", zx + 2.5, 1.7, zz, 0.9, 0.85, "east");
    // Garden / driveway
    makeBox("nh_home_h1_drive", 2.4, 0.05, 3, new Vector3(zx, 0.06, zz - 4), "#b8b0a0");
    makeFrontPath("nh_home_h1_path", zx, zz - 2.6, zx, zz - 5.4);
    makePicketFence(zx - 3.0, zx - 1.2, zz - 5.6);
    makePicketFence(zx + 1.2, zx + 3.0, zz - 5.6);
    makeMailbox(zx + 2.6, zz - 5.3);
    // Plumber van out front
    makeBox("nh_van_body", 2.6, 1.2, 1.4, new Vector3(zx + 3.6, 0.7, zz - 4.5), "#3a8fd6");
    makeBox("nh_van_roof", 2.4, 0.6, 1.3, new Vector3(zx + 3.2, 1.55, zz - 4.5), "#3a8fd6");
    makeBox("nh_van_window", 1.0, 0.5, 1.3, new Vector3(zx + 4.3, 1.05, zz - 4.5), "#cfe7ff");
    // Water puddle
    const puddle = makeBox("nh_puddle", 1.6, 0.05, 1.0, new Vector3(zx - 0.5, 0.07, zz - 3.5), "#6cb8e8");
    homePuddle = puddle;
    // Source of the burst — a point inside the kitchen wall, just under
    // the south window, where the water visibly spurts upward.
    homeKitchenSource = new Vector3(zx - 0.5, 1.6, zz - 1.8);

    // Neighbouring house — also gets a real gable roof + chimney.
    makeBox("nh_home_h2_found", 4.6, 0.4, 4.0, new Vector3(zx + 8, 0.2, zz), "#9a8f7a");
    makeBox("nh_home_h2_base", 4.2, 2.4, 3.6, new Vector3(zx + 8, 1.6, zz), "#f0d6b0");
    makeBox(
      "nh_home_h2_trim",
      4.4,
      0.18,
      3.8,
      new Vector3(zx + 8, 2.71, zz),
      "#f4f0e6",
    );
    makeGableRoof("nh_home_h2_roof", 4.0, 3.6, zx + 8, zz, 2.8, "#7a4a3a", "#e7d8c0");
    makeChimney(zx + 9.2, zz + 0.5, 3.2, "#7a4a3a");
    makeBox("nh_home_h2_door", 0.85, 1.6, 0.16, new Vector3(zx + 8, 0.8, zz - 1.85), "#5a3a22");
    makeBox("nh_home_h2_step", 1.3, 0.16, 0.5, new Vector3(zx + 8, 0.5, zz - 2.1), "#cfc8b4");
    makeMullionedWindow("nh_home_h2_winL", zx + 6.8, 1.7, zz - 1.8, 0.9, 0.8, "south");
    makeMullionedWindow("nh_home_h2_winR", zx + 9.2, 1.7, zz - 1.8, 0.9, 0.8, "south");
    makeFrontPath("nh_home_h2_path", zx + 8, zz - 2.4, zx + 8, zz - 5.0);
    makePicketFence(zx + 5.4, zx + 7.4, zz - 5.6, 0, "#e7d8c0");
    makePicketFence(zx + 8.6, zx + 10.6, zz - 5.6, 0, "#e7d8c0");

    // Trees
    makeTree(zx - 3.5, zz + 2);
    makeTree(zx + 5.5, zz + 2.5);
    makeTree(zx + 11, zz - 2);

    // Customer (Michael)
    makePerson(zx - 1, zz - 5, "customerHome", { x: -7, z: -4 });

    // Water-extraction & drying gear staged out front — supports the
    // emergency make-safe story (scenario 3, supplier coordination step).
    makeBox("nh_dry_van_body", 2.4, 1.2, 1.3, new Vector3(zx - 5, 0.7, zz - 4.5), "#e8e8e8");
    makeBox("nh_dry_van_cab", 1.2, 0.9, 1.25, new Vector3(zx - 6, 1.45, zz - 4.5), "#cfcfcf");
    makeBox("nh_dry_van_stripe", 2.5, 0.18, 1.32, new Vector3(zx - 5, 0.85, zz - 4.5), "#3a8fd6");
    // Floor blower / dehumidifier sitting in the driveway
    makeBox("nh_dry_blower", 0.7, 0.55, 0.7, new Vector3(zx + 0.6, 0.32, zz - 3.2), "#ffd166");
    makeBox("nh_dry_blower_grill", 0.5, 0.4, 0.05, new Vector3(zx + 0.6, 0.35, zz - 2.85), "#3a3a3a");

    // Builder rebuild kit: scaffolding hugging the side of the house, a
    // skip on the verge for the ripped-out cabinetry, and a cement mixer
    // for the new floor base — straight from the construction-pack vibe.
    makeScaffold(zx + 2.6, zz, 2.4, 4.4);
    makeSkip(zx - 4.5, zz + 1.5);
    makeCementMixer(zx + 4, zz + 2.5);
    // A pair of cones marking the work area on the kerb
    makeCone(zx - 2.6, zz - 4.6);
    makeCone(zx - 1.4, zz - 4.6);

    // Incident marker over house 1
    makeIncidentMarker(zx, 5.2, zz, "water");

    // Route from house to office front door
    makePathLine(
      "nh_path_home",
      { x: zx - 2, z: zz - 4 },
      { x: -7, z: -4 },
    );

    makeLabel(zx + 4, zz + 4, "Residential — Home Claims (Michael)", "#3a8fd6");
  }

  // ----- Zone 2: Main Road / Intersection — Motor Insurance -----
  // East side, on the main road
  {
    const zx = 22;
    const zz = 0;

    // Two cars touching bumpers
    const car1Body = makeBox("nh_car1_body", 2.6, 0.8, 1.4, new Vector3(zx, 0.55, zz - 0.8), "#c44a3a");
    const car1Top = makeBox("nh_car1_top", 1.6, 0.6, 1.2, new Vector3(zx - 0.2, 1.25, zz - 0.8), "#a23a2c");
    const car1Win = makeBox("nh_car1_win", 1.4, 0.4, 1.25, new Vector3(zx - 0.2, 1.25, zz - 0.8), "#cfe7ff");

    const car2Body = makeBox("nh_car2_body", 2.6, 0.8, 1.4, new Vector3(zx + 3, 0.55, zz - 0.8), "#3a6dc4");
    const car2Top = makeBox("nh_car2_top", 1.6, 0.6, 1.2, new Vector3(zx + 3.2, 1.25, zz - 0.8), "#2a55a0");
    const car2Win = makeBox("nh_car2_win", 1.4, 0.4, 1.25, new Vector3(zx + 3.2, 1.25, zz - 0.8), "#cfe7ff");

    motorLeadCar = [car1Body, car1Top, car1Win];
    motorRearCar = [car2Body, car2Top, car2Win];
    motorContact = new Vector3(zx + 1.4, 1.0, zz - 0.8);

    // Hazard triangle (small red pyramid via rotated box)
    makeBox("nh_hazard", 0.4, 0.5, 0.05, new Vector3(zx + 1.4, 0.3, zz - 1.8), "#e84b3a");

    // Tow truck approaching
    makeBox("nh_tow_body", 3.0, 1.0, 1.4, new Vector3(zx + 8, 0.65, zz - 0.8), "#ffd166");
    makeBox("nh_tow_cab", 1.4, 0.8, 1.3, new Vector3(zx + 7, 1.55, zz - 0.8), "#ffb347");
    makeBox("nh_tow_hook", 1.4, 0.2, 0.2, new Vector3(zx + 9.6, 0.7, zz - 0.8), "#3a3a3a");

    // Driver standing nearby (Aisha)
    makePerson(zx + 1.2, zz + 1.2, "customerMotor", { x: -7, z: -4 });

    // Northside Smash Repairs garage — supports the supplier coordination
    // step in scenario 1 (motor collision).
    const gx = zx + 4;
    const gz = zz + 8;
    makeBox("nh_garage_base", 6.0, 2.6, 4.4, new Vector3(gx, 1.3, gz), "#d8d2c0");
    makeBox("nh_garage_roof", 6.4, 0.4, 4.8, new Vector3(gx, 2.7, gz), "#3a3a3a");
    // Roller door
    makeBox("nh_garage_door", 2.6, 2.0, 0.12, new Vector3(gx - 1.2, 1.0, gz - 2.25), "#9aa0a8");
    // Garage sign
    const garageSign = MeshBuilder.CreateBox(
      "nh_garage_sign",
      { width: 4.6, height: 0.6, depth: 0.1 },
      scene,
    );
    garageSign.position = new Vector3(gx + 0.6, 3.0, gz - 2.25);
    const gtex = new DynamicTexture(
      "nh_garage_sign_tex",
      { width: 512, height: 96 },
      scene,
      false,
    );
    const gctx = gtex.getContext() as CanvasRenderingContext2D;
    gctx.fillStyle = "#1c2230";
    gctx.fillRect(0, 0, 512, 96);
    gctx.fillStyle = "#ffd166";
    gctx.font = "bold 38px sans-serif";
    gctx.textBaseline = "middle";
    gctx.textAlign = "center";
    gctx.fillText("NORTHSIDE SMASH REPAIRS", 256, 50);
    gtex.update();
    const gmat = new StandardMaterial("nh_garage_sign_mat", scene);
    gmat.diffuseTexture = gtex;
    gmat.emissiveColor = new Color3(0.55, 0.55, 0.55);
    gmat.specularColor = new Color3(0, 0, 0);
    garageSign.material = gmat;
    attach(garageSign);
    // Courtesy / rental car waiting on the forecourt
    makeBox("nh_rental_body", 2.4, 0.7, 1.3, new Vector3(gx - 3.2, 0.5, gz + 1.5), "#5fa657");
    makeBox("nh_rental_top", 1.4, 0.55, 1.2, new Vector3(gx - 3.2, 1.1, gz + 1.5), "#4a8a4a");
    makeBox("nh_rental_win", 1.2, 0.4, 1.25, new Vector3(gx - 3.2, 1.1, gz + 1.5), "#cfe7ff");
    makeBox("nh_rental_label", 1.2, 0.3, 0.06, new Vector3(gx - 3.2, 1.65, gz + 0.85), "#ffd166");
    // Wheels so the rental reads as a car instead of a floating block.
    for (const [dx, dz] of [
      [0.85, 0.6],
      [-0.85, 0.6],
      [0.85, -0.6],
      [-0.85, -0.6],
    ] as Array<[number, number]>) {
      makeBox(
        `nh_rental_wheel_${dx}_${dz}`,
        0.25,
        0.45,
        0.45,
        new Vector3(gx - 3.2 + dx, 0.22, gz + 1.5 + dz),
        "#1c2230",
      );
    }

    // Incident marker
    makeIncidentMarker(zx + 1.5, 3.4, zz - 0.8, "car");

    // Path from collision to office
    makePathLine(
      "nh_path_motor",
      { x: zx, z: zz + 1 },
      { x: -6, z: -2 },
    );

    makeLabel(zx + 3, zz + 4, "Main Road — Motor Claims (Aisha)", "#c44a3a");
  }

  // ----- Zone 3: High Street — Small Business Insurance (café fire) -----
  // South-west quadrant
  {
    const zx = -18;
    const zz = -14;

    // Row of three shop fronts
    const shops: Array<[string, string]> = [
      ["#e7c8a0", "BAKERY"],
      ["#cfe1f0", "TOM'S CAFÉ"],
      ["#d8d2c0", "BOOKS"],
    ];
    for (let i = 0; i < shops.length; i++) {
      const [color, label] = shops[i];
      const sx = zx + i * 4.4;
      makeBox(`nh_shop_base_${i}`, 4.0, 2.6, 3.6, new Vector3(sx, 1.3, zz), color);
      makeBox(`nh_shop_awning_${i}`, 4.2, 0.2, 1.0, new Vector3(sx, 2.3, zz - 2.0), "#3a5fb0");
      makeBox(`nh_shop_door_${i}`, 0.9, 1.6, 0.12, new Vector3(sx, 0.8, zz - 1.85), "#5a3a22");
      makeBox(`nh_shop_win_${i}`, 2.6, 1.0, 0.1, new Vector3(sx, 1.7, zz - 1.85), "#cfe7ff");

      // Sign text
      const sign = MeshBuilder.CreateBox(
        `nh_shop_sign_${i}`,
        { width: 3.6, height: 0.5, depth: 0.08 },
        scene,
      );
      sign.position = new Vector3(sx, 2.7, zz - 1.85);
      const tex = new DynamicTexture(
        `nh_shop_sign_tex_${i}`,
        { width: 512, height: 96 },
        scene,
        false,
      );
      const c = tex.getContext() as CanvasRenderingContext2D;
      c.fillStyle = "#1c2230";
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = "#ffd166";
      c.font = "bold 56px sans-serif";
      c.textBaseline = "middle";
      c.textAlign = "center";
      c.fillText(label, 256, 50);
      tex.update();
      const m = new StandardMaterial(`nh_shop_sign_mat_${i}`, scene);
      m.diffuseTexture = tex;
      m.emissiveColor = new Color3(0.5, 0.5, 0.5);
      m.specularColor = new Color3(0, 0, 0);
      sign.material = m;
      attach(sign);
    }

    // Smoke wisps over Tom's café (middle shop)
    const cafeX = zx + 4.4;
    const smokeMeshes: Mesh[] = [];
    for (const [dx, dy, sz] of [
      [-0.4, 4.4, 1.0],
      [0.6, 5.0, 1.2],
      [-0.2, 5.6, 0.9],
    ] as Array<[number, number, number]>) {
      const wisp = makeBox(
        `nh_smoke_${dx}_${dy}`,
        sz,
        sz * 0.9,
        sz,
        new Vector3(cafeX + dx, dy, zz),
        "#9aa0a8",
      );
      smokeMeshes.push(wisp);
    }
    cafeSmokeMeshes = smokeMeshes;
    cafeFlickerAt = new Vector3(cafeX, 1.0, zz - 1.79);

    // "Closed" sign
    makeBox("nh_closed_sign", 0.9, 0.4, 0.06, new Vector3(cafeX, 1.4, zz - 1.95), "#c44a3a");

    // Fire truck nearby
    makeBox("nh_fire_body", 3.6, 1.2, 1.6, new Vector3(zx + 4.4, 0.7, zz - 5), "#e84b3a");
    makeBox("nh_fire_cab", 1.4, 1.0, 1.5, new Vector3(zx + 3.0, 1.7, zz - 5), "#c44a3a");
    makeBox("nh_fire_light", 0.4, 0.25, 0.4, new Vector3(zx + 3.0, 2.35, zz - 5), "#3a8fd6");
    makeBox("nh_fire_ladder", 3.0, 0.15, 0.3, new Vector3(zx + 4.6, 1.95, zz - 5), "#b8b0a0");

    // Customer (Tom)
    makePerson(cafeX - 1.5, zz - 4.5, "customerBusiness", { x: -7, z: -4 });

    // Cordon cones around the cafe entrance — fire scene under investigation
    makeCone(cafeX - 2.4, zz - 3.4);
    makeCone(cafeX - 0.8, zz - 3.4);
    makeCone(cafeX + 0.8, zz - 3.4);
    makeCone(cafeX + 2.4, zz - 3.4);
    // Builder rebuild props for the cafe (scenario 4): a small crane lifting
    // ceiling materials, a skip for fire-damaged joinery, and a stack of
    // timber for the rebuild.
    makeCrane(cafeX - 12, zz + 2);
    makeSkip(cafeX - 6, zz - 4.5);
    makeTimberStack(cafeX + 2.5, zz - 4.5);
    makeBarrier(cafeX, zz - 4.0);

    // Forensic electrician van — supports scenario 4 (cause investigation)
    makeBox("nh_elec_body", 2.6, 1.2, 1.3, new Vector3(cafeX + 5.5, 0.7, zz - 5), "#2a55a0");
    makeBox("nh_elec_cab", 1.2, 0.9, 1.25, new Vector3(cafeX + 6.5, 1.45, zz - 5), "#1f3f78");
    makeBox("nh_elec_stripe", 2.7, 0.18, 1.32, new Vector3(cafeX + 5.5, 0.85, zz - 5), "#ffd166");

    // Incident marker
    makeIncidentMarker(cafeX, 3.4, zz, "fire");

    // Path from cafe to office
    makePathLine(
      "nh_path_business",
      { x: cafeX, z: zz - 4 },
      { x: -7, z: -4 },
    );

    makeLabel(zx + 4, zz - 5.5, "High Street — Business Claims (Tom)", "#e07a2c");
  }

  // ----- Zone 4: Travel Hub — Travel Insurance (lost luggage) -----
  // Far north-west corner — pushed all the way west onto the open grass
  // beside the back-left skyline tower, so the blue terminal stands clear
  // of the Zava Insurance office and reads as the western "edge" of the
  // neighbourhood. Sits west of Cedar Way (kerb at x≈-28.65).
  {
    const zx = -32;
    const zz = 18;

    // Small terminal building
    makeBox("nh_term_base", 8, 3.0, 5, new Vector3(zx, 1.5, zz), "#cfe1f0");
    makeBox("nh_term_roof", 8.4, 0.4, 5.4, new Vector3(zx, 3.2, zz), "#3a5fb0");
    makeBox("nh_term_win", 6.0, 1.4, 0.1, new Vector3(zx, 1.8, zz - 2.55), "#cfe7ff");
    makeBox("nh_term_door", 1.6, 1.8, 0.15, new Vector3(zx + 2.5, 0.9, zz - 2.55), "#3a5fb0");

    // Terminal sign
    const tsign = MeshBuilder.CreateBox(
      "nh_term_sign",
      { width: 6, height: 0.7, depth: 0.1 },
      scene,
    );
    tsign.position = new Vector3(zx, 3.55, zz - 2.6);
    const ttex = new DynamicTexture(
      "nh_term_sign_tex",
      { width: 512, height: 96 },
      scene,
      false,
    );
    const tc = ttex.getContext() as CanvasRenderingContext2D;
    tc.fillStyle = "#1c2230";
    tc.fillRect(0, 0, 512, 96);
    tc.fillStyle = "#ffffff";
    tc.font = "bold 54px sans-serif";
    tc.textBaseline = "middle";
    tc.textAlign = "center";
    tc.fillText("✈  TRAVEL HUB", 256, 50);
    ttex.update();
    const tmat = new StandardMaterial("nh_term_sign_mat", scene);
    tmat.diffuseTexture = ttex;
    tmat.emissiveColor = new Color3(0.5, 0.5, 0.5);
    tmat.specularColor = new Color3(0, 0, 0);
    tsign.material = tmat;
    attach(tsign);

    // Tarmac
    makeBox("nh_tarmac", 12, 0.05, 5, new Vector3(zx + 1, 0.07, zz + 4), "#5a5d65");
    // Stripe
    makeBox("nh_tarmac_stripe", 8, 0.02, 0.2, new Vector3(zx + 1, 0.1, zz + 4), "#f4e8a8");

    // Tiny plane parked
    makeBox("nh_plane_body", 4.0, 0.7, 0.9, new Vector3(zx + 1, 0.55, zz + 4), "#ffffff");
    makeBox("nh_plane_tail", 0.6, 1.0, 0.2, new Vector3(zx - 0.8, 1.0, zz + 4), "#3a5fb0");
    makeBox("nh_plane_wing", 0.8, 0.15, 3.2, new Vector3(zx + 1, 0.7, zz + 4), "#dcdcdc");

    // Luggage trolley with one missing suitcase
    makeBox("nh_lug_trolley", 2.4, 0.3, 1.0, new Vector3(zx - 2, 0.25, zz + 1.5), "#7a7a7a");
    makeBox("nh_lug_case1", 0.8, 0.5, 0.6, new Vector3(zx - 2.6, 0.7, zz + 1.5), "#b03a6f");
    makeBox("nh_lug_case2", 0.8, 0.5, 0.6, new Vector3(zx - 1.4, 0.7, zz + 1.5), "#3a6dc4");
    // (third spot intentionally empty)

    // Lone suitcase further away — the missing one's mate
    const lostCase = makeBox("nh_lug_lost", 0.7, 0.4, 0.5, new Vector3(zx + 5, 0.3, zz + 2), "#5a8a4a");
    travelSuitcase = lostCase;
    // Trolley top is the position the suitcase "starts on" before
    // tumbling off in the incident animation.
    travelTrolleyTop = new Vector3(zx - 2, 1.0, zz + 1.5);
    travelLostRest = new Vector3(zx + 5, 0.3, zz + 2);

    // Worried traveller (Grace) on phone
    makePerson(zx - 1, zz + 0.5, "customerTravel", { x: -7, z: -4 });

    makeIncidentMarker(zx - 2, 2.4, zz + 1.5, "luggage");

    // Path from travel hub to office
    makePathLine(
      "nh_path_travel",
      { x: zx + 2, z: zz - 1 },
      { x: -7, z: 4 },
    );

    // Pushed south-east of the relocated travel terminal so the label
    // sits on open grass between the hub and the main road, instead of
    // running off the western edge of the map.
    makeLabel(zx + 2, zz - 12, "Travel Hub — Travel Claims (Grace)", "#3a5fb0");
  }

  // ----- Zone 5: Quiet Suburb Home — Life Insurance -----
  // South-east quadrant — handled with calm tone
  {
    const zx = 16;
    const zz = -16;
    lifeHomeCenter = new Vector3(zx, 0.1, zz);

    // Calm house, set apart — full suburban detail with a slate gable
    // roof, a chimney, mullioned windows, and a soft front path.
    makeBox("nh_life_found", 5.0, 0.4, 4.4, new Vector3(zx, 0.2, zz), "#9a8f7a");
    makeBox("nh_life_base", 4.6, 2.6, 4, new Vector3(zx, 1.7, zz), "#f0e6d2");
    makeBox(
      "nh_life_trim",
      4.8,
      0.18,
      4.2,
      new Vector3(zx, 2.91, zz),
      "#fff8e6",
    );
    makeGableRoof("nh_life_roof", 4.6, 4, zx, zz, 3.0, "#5a6a7c", "#dcd0bc");
    makeChimney(zx - 1.4, zz + 0.5, 3.4, "#7a6a5c");
    makeBox("nh_life_door", 0.95, 1.7, 0.16, new Vector3(zx, 0.85, zz - 2.05), "#3a3a3a");
    makeBox("nh_life_step", 1.4, 0.16, 0.5, new Vector3(zx, 0.5, zz - 2.3), "#cfc8b4");
    makeMullionedWindow("nh_life_winL", zx - 1.55, 1.7, zz - 2.0, 1.0, 0.85, "south");
    makeMullionedWindow("nh_life_winR", zx + 1.55, 1.7, zz - 2.0, 1.0, 0.85, "south");
    makeMullionedWindow("nh_life_winE", zx + 2.3, 1.7, zz, 0.9, 0.85, "east");

    // Driveway with parked family car
    makeBox("nh_life_drive", 2.6, 0.05, 4, new Vector3(zx - 3.5, 0.07, zz - 1), "#b8b0a0");
    makeBox("nh_life_car_body", 2.4, 0.7, 1.3, new Vector3(zx - 3.5, 0.5, zz - 1), "#5a6a7c");
    makeBox("nh_life_car_top", 1.4, 0.55, 1.2, new Vector3(zx - 3.5, 1.1, zz - 1), "#3a4a5c");
    makeBox("nh_life_car_win", 1.2, 0.4, 1.25, new Vector3(zx - 3.5, 1.1, zz - 1), "#cfe7ff");
    for (const [dx, dz] of [
      [0.85, 0.6],
      [-0.85, 0.6],
      [0.85, -0.6],
      [-0.85, -0.6],
    ] as Array<[number, number]>) {
      makeBox(
        `nh_life_car_wheel_${dx}_${dz}`,
        0.25,
        0.45,
        0.45,
        new Vector3(zx - 3.5 + dx, 0.22, zz - 1 + dz),
        "#1c2230",
      );
    }

    // Garden — flowerbed (no alarm symbols)
    makeBox("nh_life_bed", 3.0, 0.1, 0.6, new Vector3(zx, 0.12, zz + 2.4), "#7a4f2a");
    for (let i = -1; i <= 1; i++) {
      makeBox(
        `nh_life_flower_${i}`,
        0.3,
        0.4,
        0.3,
        new Vector3(zx + i * 1.0, 0.35, zz + 2.4),
        i === 0 ? "#f4a3c7" : "#ffd166",
      );
    }

    // Trees nearby
    makeTree(zx + 4, zz - 3);
    makeTree(zx - 6, zz + 3, 0.9);

    // A small condolence wreath at the door — gentle, no alarm symbols.
    makeBox("nh_life_wreath_outer", 0.7, 0.7, 0.08, new Vector3(zx, 1.6, zz - 2.1), "#5fa657");
    makeBox("nh_life_wreath_inner", 0.4, 0.4, 0.06, new Vector3(zx, 1.6, zz - 2.08), "#fff8e6");
    makeBox("nh_life_wreath_ribbon", 0.18, 0.55, 0.06, new Vector3(zx, 1.25, zz - 2.08), "#c2566f");

    // Beneficiary (Robert) walking calmly down the path
    makePerson(zx - 2.5, zz - 4, "customerLife", { x: -7, z: -4 });

    // Soft heart marker (gentle)
    makeIncidentMarker(zx, 4.6, zz, "heart");

    // Path from family home to office (calm, soft tone)
    makePathLine(
      "nh_path_life",
      { x: zx - 2, z: zz - 3 },
      { x: -6, z: 4 },
      "#e8d6cf",
    );

    makeLabel(zx, zz + 5, "Family Home — Life Claims (Robert)", "#c2566f");
  }

  // ----- Zone 6: Apartment Block — Contents / Suspected Theft -----
  // South side — featured incident from scenario 2 (Jordan Pierce). The
  // claim is under fraud review, so the visual stays calm: a small
  // apartment block with a forced front door, police tape, and an
  // investigator's magnifier marker rather than alarm symbols.
  {
    // Relocated to the far left edge of the map so the foreground reads
    // cleanly into the central roundabout / Zava Insurance office without
    // being blocked by a tall apartment block. The block now sits in the
    // south-west corner just south of the downtown mid-rise cluster.
    const zx = -32;
    const zz = -28;

    // Three-storey apartment block
    makeBox("nh_apt_base", 7.0, 7.5, 5.0, new Vector3(zx, 3.75, zz), "#cfbfa8");
    makeBox("nh_apt_roof", 7.4, 0.4, 5.4, new Vector3(zx, 7.7, zz), "#5a4a3a");
    // Entry stoop
    makeBox("nh_apt_stoop", 2.6, 0.2, 1.4, new Vector3(zx, 0.2, zz - 2.85), "#b8b0a0");

    // Windows in a 3x3 grid on the front face
    const aptWin = mat("aptWin", "#cfe7ff");
    for (let row = 0; row < 3; row++) {
      for (let col = -1; col <= 1; col++) {
        const w = MeshBuilder.CreateBox(
          `nh_apt_win_${row}_${col}`,
          { width: 1.0, height: 0.8, depth: 0.1 },
          scene,
        );
        w.position = new Vector3(zx + col * 2.2, 1.6 + row * 2.2, zz - 2.55);
        w.material = aptWin;
        attach(w);
      }
    }

    // Forced / ajar front door (the alleged break-in point)
    const door = MeshBuilder.CreateBox(
      "nh_apt_door",
      { width: 1.0, height: 1.8, depth: 0.16 },
      scene,
    );
    door.position = new Vector3(zx, 0.95, zz - 2.55);
    door.rotation.y = -0.35; // ajar
    door.material = mat("aptDoor", "#5a3a22");
    attach(door);
    // Splintered door frame highlight
    makeBox("nh_apt_door_frame", 0.18, 1.9, 0.18, new Vector3(zx + 0.55, 0.95, zz - 2.55), "#3a2a18");

    // "POLICE" tape across the doorway (two thin strips)
    makeBox("nh_apt_tape1", 2.0, 0.12, 0.04, new Vector3(zx, 1.5, zz - 2.45), "#ffd166");
    makeBox("nh_apt_tape2", 2.0, 0.12, 0.04, new Vector3(zx, 0.9, zz - 2.45), "#ffd166");

    // A small police evidence marker / cone on the stoop
    makeBox("nh_apt_evidence", 0.3, 0.5, 0.3, new Vector3(zx + 1.2, 0.27, zz - 2.85), "#3a6dc4");

    // Investigator's car parked out front (plain sedan)
    makeBox("nh_inv_body", 2.4, 0.7, 1.3, new Vector3(zx + 5, 0.5, zz - 3.5), "#2a3a5c");
    makeBox("nh_inv_top", 1.4, 0.55, 1.2, new Vector3(zx + 5, 1.1, zz - 3.5), "#1c2230");
    makeBox("nh_inv_win", 1.2, 0.4, 1.25, new Vector3(zx + 5, 1.1, zz - 3.5), "#cfe7ff");
    for (const [dx, dz] of [
      [0.85, 0.6],
      [-0.85, 0.6],
      [0.85, -0.6],
      [-0.85, -0.6],
    ] as Array<[number, number]>) {
      makeBox(
        `nh_inv_wheel_${dx}_${dz}`,
        0.25,
        0.45,
        0.45,
        new Vector3(zx + 5 + dx, 0.22, zz - 3.5 + dz),
        "#1c2230",
      );
    }

    // Claimant (Jordan) standing on the path with arms out — body language
    // is left to the viewer's imagination; he's just a small voxel figure.
    makePerson(zx - 1.5, zz - 4, "customerContents", { x: -7, z: -4 });

    // Trees / planter beside the building
    makeTree(zx - 5, zz - 1, 0.9);
    makeTree(zx + 5.5, zz + 2, 0.9);

    // Investigator marker (magnifier) — calm, not alarming
    makeIncidentMarker(zx, 9.2, zz, "fraud");

    // Path from apartment to office (broken / dashed already; this zone
    // is "under review" so the path goes via the central road).
    makePathLine(
      "nh_path_apt",
      { x: zx + 2, z: zz - 3 },
      { x: -6, z: -4 },
    );

    makeLabel(zx, zz - 6, "Apartment Block — Contents Claim (under review)", "#5c4a8a");
  }

  // ----- Voxel-city downtown strip -----
  // A small cluster of mid-rise voxel buildings on the western edge so the
  // neighbourhood reads as more than just suburbs. Style is inspired by
  // generic MagicaVoxel city packs: chunky flat-roofed buildings with
  // banded windows. Geometry is original / procedural.
  const makeMidRise = (
    cx: number,
    cz: number,
    storeys: number,
    baseColor: string,
    bandColor: string,
    width = 5.0,
    depth = 4.0,
  ): void => {
    const storeyH = 1.6;
    const totalH = storeys * storeyH;
    // Main shaft
    const shaft = MeshBuilder.CreateBox(
      `nh_dt_shaft_${cx}_${cz}`,
      { width, height: totalH, depth },
      scene,
    );
    shaft.position = new Vector3(cx, totalH / 2, cz);
    shaft.material = mat(`dtBase_${baseColor}`, baseColor);
    attach(shaft);
    // Window bands on the front face (south)
    const bandMat = mat(`dtBand_${bandColor}`, bandColor);
    for (let s = 0; s < storeys; s++) {
      const y = s * storeyH + 1.0;
      const band = MeshBuilder.CreateBox(
        `nh_dt_band_${cx}_${cz}_${s}`,
        { width: width - 0.6, height: 0.5, depth: 0.08 },
        scene,
      );
      band.position = new Vector3(cx, y, cz - depth / 2 - 0.04);
      band.material = bandMat;
      attach(band);
      // East / west window bands too
      const bandE = MeshBuilder.CreateBox(
        `nh_dt_bandE_${cx}_${cz}_${s}`,
        { width: 0.08, height: 0.5, depth: depth - 0.6 },
        scene,
      );
      bandE.position = new Vector3(cx + width / 2 + 0.04, y, cz);
      bandE.material = bandMat;
      attach(bandE);
      const bandW = MeshBuilder.CreateBox(
        `nh_dt_bandW_${cx}_${cz}_${s}`,
        { width: 0.08, height: 0.5, depth: depth - 0.6 },
        scene,
      );
      bandW.position = new Vector3(cx - width / 2 - 0.04, y, cz);
      bandW.material = bandMat;
      attach(bandW);
    }
    // Roof parapet
    makeBox(
      `nh_dt_parapet_${cx}_${cz}`,
      width + 0.2,
      0.3,
      depth + 0.2,
      new Vector3(cx, totalH + 0.15, cz),
      "#5a5d65",
    );
    // Roof HVAC box
    makeBox(
      `nh_dt_hvac_${cx}_${cz}`,
      1.4,
      0.5,
      1.0,
      new Vector3(cx - 1.0, totalH + 0.55, cz + 0.6),
      "#9aa0a8",
    );
    // Ground-floor entrance
    makeBox(
      `nh_dt_door_${cx}_${cz}`,
      1.2,
      1.4,
      0.12,
      new Vector3(cx, 0.7, cz - depth / 2 - 0.06),
      "#1c2230",
    );
  };

  // Place the downtown strip in the south-west outer area, off the main road.
  // The two tallest blocks have been relocated to the far back-left and far
  // back-right corners so they read as "downtown skyline" silhouettes
  // instead of standing in front of (and visually blocking) the lower
  // suburban buildings nearer the camera.
  makeMidRise(-26, -18, 4, "#e7c8a0", "#a23a2c", 4.6, 4.0);
  makeMidRise(-20, -22, 3, "#cfe1f0", "#1c2230", 5.4, 4.4);
  // Far back-right corner skyline tower
  makeMidRise(36, 30, 5, "#cfd6dc", "#3a5fb0", 5.0, 4.2);
  // Far back-left corner skyline tower
  makeMidRise(-36, 30, 6, "#dcdcdc", "#2a3a5c", 4.4, 4.0);
  // A tiny park bench in front of the downtown strip
  makeBox("nh_dt_bench", 1.6, 0.15, 0.4, new Vector3(-28, 0.45, -12), "#7a4f2a");
  makeBox("nh_dt_bench_back", 1.6, 0.5, 0.1, new Vector3(-28, 0.7, -12.18), "#7a4f2a");
  makeTree(-30, -12, 0.85);
  makeTree(-24, -14, 0.85);

  // ----- Builder's Yard -----
  // A small construction-supplies depot on the eastern edge — visually
  // ties the construction-pack-style props together and reinforces the
  // "claims lead to repairs" narrative.
  {
    const yx = 32;
    const yz = -18;
    // Fenced yard pad
    makeBox("nh_yard_pad", 12, 0.05, 9, new Vector3(yx, 0.06, yz), "#b8b0a0");
    // Storage shed
    makeBox("nh_yard_shed", 4.5, 2.6, 3.5, new Vector3(yx + 3, 1.3, yz - 2.5), "#e07a2c");
    makeBox("nh_yard_shed_roof", 4.7, 0.3, 3.7, new Vector3(yx + 3, 2.75, yz - 2.5), "#1c2230");
    makeBox("nh_yard_shed_door", 1.2, 1.6, 0.12, new Vector3(yx + 3, 0.8, yz - 4.3), "#3a3a3a");
    // Yard contents
    makeTimberStack(yx - 3.5, yz);
    makeTimberStack(yx - 3.5, yz + 1.5);
    makeBrickPile(yx, yz + 2.5);
    makeBrickPile(yx + 1.5, yz + 2.5);
    makeCementMixer(yx - 2.5, yz - 2.5);
    makeBuilderTruck(yx + 0.5, yz - 1);
    // Cones at the gate
    makeCone(yx - 6, yz + 4);
    makeCone(yx - 5, yz + 4);
    // Yard label
    makeLabel(yx, yz - 5.5, "Builder's Yard", "#e07a2c");
  }

  // ----- Greenspaces: parks, playground, and a small river -----
  // Fills out the empty grass so the neighbourhood feels lived-in rather
  // than vacant between zones. Each piece is purely decorative.
  const makeParkPad = (cx: number, cz: number, w: number, d: number): void => {
    const pad = MeshBuilder.CreateBox(
      `nh_park_pad_${cx}_${cz}`,
      { width: w, height: 0.06, depth: d },
      scene,
    );
    pad.position = new Vector3(cx, 0.04, cz);
    pad.material = mat("parkPad", "#7faf5c");
    attach(pad);
  };
  const makeBench = (cx: number, cz: number): void => {
    makeBox(`nh_bench_seat_${cx}_${cz}`, 1.6, 0.15, 0.4, new Vector3(cx, 0.45, cz), "#7a4f2a");
    makeBox(`nh_bench_back_${cx}_${cz}`, 1.6, 0.5, 0.1, new Vector3(cx, 0.7, cz - 0.18), "#7a4f2a");
  };
  const makePondPatch = (cx: number, cz: number, w: number, d: number): void => {
    const pond = MeshBuilder.CreateBox(
      `nh_pond_${cx}_${cz}`,
      { width: w, height: 0.05, depth: d },
      scene,
    );
    pond.position = new Vector3(cx, 0.05, cz);
    pond.material = mat("pondWater", "#5fa8d6");
    attach(pond);
  };
  const makeSwingSet = (cx: number, cz: number): void => {
    makeBox(`nh_swing_postL_${cx}_${cz}`, 0.18, 1.6, 0.18, new Vector3(cx - 0.9, 0.8, cz), "#7a4a3a");
    makeBox(`nh_swing_postR_${cx}_${cz}`, 0.18, 1.6, 0.18, new Vector3(cx + 0.9, 0.8, cz), "#7a4a3a");
    makeBox(`nh_swing_top_${cx}_${cz}`, 2.0, 0.16, 0.18, new Vector3(cx, 1.55, cz), "#7a4a3a");
    makeBox(`nh_swing_seatA_${cx}_${cz}`, 0.5, 0.1, 0.25, new Vector3(cx - 0.45, 0.55, cz), "#c44a3a");
    makeBox(`nh_swing_seatB_${cx}_${cz}`, 0.5, 0.1, 0.25, new Vector3(cx + 0.45, 0.55, cz), "#3a8fd6");
  };
  const makeSlide = (cx: number, cz: number): void => {
    // Ladder + platform + slope
    makeBox(`nh_slide_lad_${cx}_${cz}`, 0.5, 1.4, 0.2, new Vector3(cx - 0.9, 0.7, cz), "#cfc8b4");
    makeBox(`nh_slide_pad_${cx}_${cz}`, 1.2, 0.18, 1.0, new Vector3(cx - 0.4, 1.45, cz), "#ffd166");
    const slope = MeshBuilder.CreateBox(
      `nh_slide_slope_${cx}_${cz}`,
      { width: 0.7, height: 0.12, depth: 1.8 },
      scene,
    );
    slope.position = new Vector3(cx + 0.6, 0.95, cz);
    slope.rotation.x = -0.55;
    slope.material = mat("slideSlope", "#3a8fd6");
    attach(slope);
  };
  const makeSandbox = (cx: number, cz: number): void => {
    makeBox(`nh_sand_${cx}_${cz}`, 2.4, 0.08, 2.4, new Vector3(cx, 0.06, cz), "#e8d8a0");
    makeBox(`nh_sand_rimN_${cx}_${cz}`, 2.6, 0.18, 0.18, new Vector3(cx, 0.13, cz - 1.2), "#7a4a3a");
    makeBox(`nh_sand_rimS_${cx}_${cz}`, 2.6, 0.18, 0.18, new Vector3(cx, 0.13, cz + 1.2), "#7a4a3a");
    makeBox(`nh_sand_rimE_${cx}_${cz}`, 0.18, 0.18, 2.6, new Vector3(cx + 1.2, 0.13, cz), "#7a4a3a");
    makeBox(`nh_sand_rimW_${cx}_${cz}`, 0.18, 0.18, 2.6, new Vector3(cx - 1.2, 0.13, cz), "#7a4a3a");
  };

  // North-east corner park — fills the empty grass behind the residential zone
  {
    const px = 32;
    const pz = 32;
    makeParkPad(px, pz, 12, 10);
    makePondPatch(px - 2, pz + 1, 4.0, 2.6);
    makeTree(px + 3, pz - 2, 0.95);
    makeTree(px + 4.5, pz + 3, 0.85);
    makeTree(px - 4, pz - 3, 0.9);
    makeBench(px + 1.5, pz - 3.6);
    makeLabel(px, pz + 6, "Lakeside Park", "#3a8fd6");
  }

  // South-central playground — between Pine Court and Elm Court on Willow Ave
  {
    const px = 6;
    const pz = -28;
    makeParkPad(px, pz, 12, 7);
    makeSwingSet(px - 3.5, pz);
    makeSlide(px + 0.5, pz);
    makeSandbox(px + 4, pz);
    makeBench(px - 1, pz + 2.6);
    makeTree(px - 5.5, pz + 2.5, 0.8);
    makeTree(px + 5.5, pz - 2.5, 0.8);
    makeLabel(px, pz - 4.5, "Willow Playground", "#5a8a4a");
  }

  // North-back river — winding strip along the back of the map between the
  // travel hub and the Maple Crescent skyline. Pure scenery; no road
  // crossings (it sits behind the houses).
  {
    const riverY = 0.05;
    const segments: Array<[number, number, number, number]> = [
      // [cx, cz, width, depth]
      [-6, 33, 14, 1.8],
      [4, 34, 8, 1.8],
      [12, 33, 10, 1.8],
      [20, 32, 8, 1.8],
      [27, 33, 6, 1.8],
    ];
    for (const [cx, cz, w, d] of segments) {
      const seg = MeshBuilder.CreateBox(
        `nh_river_${cx}_${cz}`,
        { width: w, height: 0.05, depth: d },
        scene,
      );
      seg.position = new Vector3(cx, riverY, cz);
      seg.material = mat("riverWater", "#4a9bd0");
      attach(seg);
      // Sandy bank on the north edge
      const bank = MeshBuilder.CreateBox(
        `nh_river_bank_${cx}_${cz}`,
        { width: w + 0.4, height: 0.07, depth: 0.5 },
        scene,
      );
      bank.position = new Vector3(cx, 0.06, cz + d / 2 + 0.2);
      bank.material = mat("riverBank", "#d8c896");
      attach(bank);
    }
    // A tiny voxel footbridge over the river
    makeBox("nh_bridge_deck", 1.6, 0.15, 3.0, new Vector3(8, 0.25, 33), "#a07a4a");
    makeBox("nh_bridge_railL", 1.6, 0.4, 0.1, new Vector3(8, 0.55, 31.6), "#7a4f2a");
    makeBox("nh_bridge_railR", 1.6, 0.4, 0.1, new Vector3(8, 0.55, 34.4), "#7a4f2a");
    makeLabel(0, 31, "Zava Riverwalk", "#3a5fb0");
  }

  // Small western pocket park — fills empty grass between the relocated
  // mid-rises and Cedar Way.
  {
    const px = -32;
    const pz = -2;
    makeParkPad(px, pz, 8, 8);
    makeTree(px - 2, pz - 2, 0.9);
    makeTree(px + 2, pz + 2, 0.9);
    makeTree(px + 2.5, pz - 2.5, 0.85);
    makeBench(px, pz);
    makeLabel(px, pz + 5, "Cedar Pocket Park", "#5a8a4a");
  }

  // ----- Roadworks -----
  // A short stretch of barriers + cones along the eastern road, hinting
  // that work is ongoing across the neighbourhood.
  for (const rz of [-8, -5]) {
    makeBarrier(28, rz);
  }
  makeCone(26, -3);
  makeCone(26, -1);
  makeCone(26, 1);

  // ----- Background filler: a few generic suburban houses -----
  // These now use the full suburban-house recipe so they don't read as
  // "fake" boxes. Each gets a foundation, mullioned windows, gable roof,
  // chimney, picket fence, and a front path. Positions chosen so they
  // line a side street or sit on an unused verge — clear of the other
  // zones and the new streets above.
  const fillers: Array<{
    cx: number;
    cz: number;
    wall: string;
    roof: string;
    storeys?: 1 | 2;
    sidewalkZ: number;
    fenceColor?: string;
  }> = [
    // West side, between Cedar Way and the main road.
    { cx: -22, cz: 6, wall: "#e7c8a0", roof: "#7a4a3a", sidewalkZ: 4.4 },
    // West side, south of the main road. Centre Z is well clear of the
    // main south kerb (z≈-3.4) so the foundation no longer sits in the
    // road asphalt.
    { cx: -22, cz: -5.5, wall: "#f0d6b0", roof: "#5a6a7c", sidewalkZ: -3.6 },
    // North-east, on Maple Crescent (a two-storey home). Centre Z lifted
    // so the foundation sits clear of the north kerb at z≈22.65.
    { cx: 4, cz: 25.6, wall: "#cfe1f0", roof: "#3a5fb0", sidewalkZ: 22.8,
      storeys: 2, fenceColor: "#e7d8c0" },
  ];
  for (const f of fillers) {
    makeSuburbanHouse(`nh_filler_${f.cx}_${f.cz}`, f.cx, f.cz, {
      wall: f.wall,
      roof: f.roof,
      storeys: f.storeys,
      chimney: true,
      fence: true,
      mailbox: true,
      sidewalkZ: f.sidewalkZ,
      fenceColor: f.fenceColor,
    });
  }

  // ----- Streetlights & post boxes along the main road -----
  const lampMat = mat("lamp", "#3a3a3a");
  const lampHead = mat("lampHead", "#fff5d6");
  const lampPositions: Array<[number, number]> = [
    [-12, 3],
    [12, 3],
    [-12, -3],
    [12, -3],
    [-26, 3],
    [26, 3],
    [-26, -3],
    [26, -3],
  ];
  for (const [lx, lz] of lampPositions) {
    const pole = MeshBuilder.CreateBox(
      `nh_lamp_${lx}_${lz}`,
      { width: 0.18, height: 2.6, depth: 0.18 },
      scene,
    );
    pole.position = new Vector3(lx, 1.3, lz);
    pole.material = lampMat;
    attach(pole);
    const head = MeshBuilder.CreateBox(
      `nh_lamphead_${lx}_${lz}`,
      { width: 0.5, height: 0.4, depth: 0.5 },
      scene,
    );
    head.position = new Vector3(lx, 2.7, lz);
    head.material = lampHead;
    attach(head);
  }

  // A few extra trees along the edges of the streets
  for (const [tx, tz] of [
    [-9, 5],
    [9, 5],
    [-9, -5],
    [9, -5],
    [-17, 4],
    [17, 4],
    [-17, -4],
    [17, -4],
    [-3, 14],
    [3, 14],
    [-3, -14],
    [3, -14],
  ] as Array<[number, number]>) {
    makeTree(tx, tz, 0.85);
  }

  // Decorative customer trail: a few people on streets heading to office -----
  const office = { x: -7, z: -4 };
  makePerson(0, -10, "intakeOfficer", office);
  makePerson(8, -2, "supplierCoord", office);
  makePerson(-3, 6, "claimsAssessor", office);
  makePerson(-2, -3, "lossAdjuster", office);
  // Extra figures along the new side streets to make the suburb feel lived-in.
  makePerson(18, 20, "commsSpecialist", office);
  makePerson(26, 16, "settlementOfficer", office);
  makePerson(-12, -19, "fraudInvestigator", office);
  makePerson(30, 6, "teamLeader", office);

  const zones: IncidentZones = {
    // Office front door is the end of the path that leaves the office.
    officeDoor: new Vector3(office.x, 0, office.z),
    // Each zone anchor is the spot where the customer voxel character
    // begins their walk toward the office. These match the (zx, zz) used
    // when placing the incident scenery (offset slightly so the spawn
    // sits on the kerb rather than inside a house).
    home: new Vector3(16 - 2, 0, 14 - 4),
    motor: new Vector3(22 + 1.5, 0, 0 - 2),
    business: new Vector3(-18 + 1, 0, -14 + 2),
    travel: new Vector3(-32 + 8, 0, 18 - 4),
    life: new Vector3(16 - 1, 0, -16 + 2),
  };

  // ----- Ambient life: cars, pedestrians, pets, and incident animations -----
  // Mirrors the "always animated" feel of the office scene, where staff and
  // customers are constantly moving around. Routes are picked to avoid the
  // static incident scenery (parked cars, smashed bumpers, plumber van etc.).
  const ambient = new NeighbourhoodAmbient(scene, root);

  // Cars looping along the side streets. Each route gets a different
  // vehicle type so the neighbourhood reads as a real mixed-traffic
  // street rather than a row of identical sedans.
  // Maple Crescent (z=20) — runs east-west; lanes at z=19 (eastbound) and z=21 (westbound).
  ambient.addCar(
    "maple_e",
    [
      [8, 19],
      [32, 19],
    ],
    { type: "jeep", bodyColor: "#5fa657", topColor: "#3a7a3a", speed: 4.5 },
  );
  ambient.addCar(
    "maple_w",
    [
      [32, 21],
      [8, 21],
    ],
    { type: "mini", bodyColor: "#c188d4", topColor: "#3a3a3a", speed: 4.0 },
  );
  // Birch Lane (z=-10) — east-west. Eastbound lane only to keep clear of the
  // apartment block / café approach.
  ambient.addCar(
    "birch_e",
    [
      [-26, -11],
      [6, -11],
    ],
    { type: "sedan", bodyColor: "#ffd166", topColor: "#c4a14a", speed: 4.2 },
  );
  // Oak Drive (x=33) — north-south, avoiding the motor incident at x=22.
  ambient.addCar(
    "oak_n",
    [
      [34, -4],
      [34, 20],
    ],
    { type: "jeep", bodyColor: "#3a8fd6", topColor: "#1f5fa0", speed: 4.0 },
  );
  // Cedar Way (x=-26) — north-south on the west side.
  ambient.addCar(
    "cedar_s",
    [
      [-27, 18],
      [-27, -1],
    ],
    { type: "mini", bodyColor: "#e84b3a", topColor: "#1c1c1c", speed: 4.0 },
  );

  // Bicycles and scooters share the quieter lanes for a bit of light traffic.
  ambient.addCar(
    "maple_bike",
    [
      [10, 20],
      [30, 20],
    ],
    { type: "bicycle", bodyColor: "#2b6cb0", topColor: "#f08a3a", speed: 2.6 },
  );
  ambient.addCar(
    "vert_scooter",
    [
      [3, 8],
      [3, -8],
    ],
    { type: "scooter", bodyColor: "#e84b3a", topColor: "#f8d34a", speed: 3.2 },
  );
  ambient.addCar(
    "birch_bike_w",
    [
      [6, -9],
      [-26, -9],
    ],
    { type: "bicycle", bodyColor: "#4a8a4a", topColor: "#ffd166", speed: 2.4 },
  );

  // Wandering pedestrians on sidewalks. Routes hug the kerbs so the
  // walkers stay clear of the road centres and the static personas.
  ambient.addPedestrian(
    "main_n_walker",
    "customerContents",
    [
      [-30, 3.4],
      [-10, 3.4],
      [-10, 3.4],
      [-30, 3.4],
    ],
    1.5,
  );
  ambient.addPedestrian(
    "main_s_walker",
    "customerHome",
    [
      [10, -3.4],
      [30, -3.4],
      [30, -3.4],
      [10, -3.4],
    ],
    1.4,
  );
  ambient.addPedestrian(
    "maple_walker",
    "customerBusiness",
    [
      [10, 17.4],
      [30, 17.4],
    ],
    1.3,
  );
  ambient.addPedestrian(
    "vert_walker",
    "customerTravel",
    [
      [3.4, 14],
      [3.4, 28],
      [3.4, 28],
      [3.4, 14],
    ],
    1.4,
  );

  // Friendly pets bumbling around grass patches well clear of the roads
  // and incident scenery (corners of the map are mostly empty grass). A
  // mix of dogs, cats, and a rabbit so the neighbourhood has more life.
  ambient.addPet(
    "nw_dog",
    { cx: -30, cz: 28, radius: 3.0 },
    { type: "dog", furColor: "#c8a878" },
  );
  ambient.addPet(
    "se_cat",
    { cx: 30, cz: -28, radius: 3.0 },
    { type: "cat", furColor: "#3a3a3a" },
  );
  ambient.addPet(
    "ne_dog",
    { cx: 30, cz: 30, radius: 2.5 },
    { type: "dog", furColor: "#e7c8a0" },
  );
  ambient.addPet(
    "sw_rabbit",
    { cx: -30, cz: -26, radius: 2.5 },
    { type: "rabbit", furColor: "#bfa68a" },
  );
  ambient.addPet(
    "n_cat",
    { cx: -8, cz: 30, radius: 2.5 },
    { type: "cat", furColor: "#e0a060" },
  );

  // Birds gliding overhead in lazy loops above the roads.
  ambient.addBird(
    "bird_loop_n",
    [
      [-28, 26],
      [28, 26],
      [28, 8],
      [-28, 8],
    ],
    { bodyColor: "#3a4a52", wingColor: "#1c2a32", altitude: 8, speed: 6.0 },
  );
  ambient.addBird(
    "bird_loop_s",
    [
      [28, -26],
      [-28, -26],
      [-28, -6],
      [28, -6],
    ],
    { bodyColor: "#c44a3a", wingColor: "#7a2a20", altitude: 7, speed: 5.5 },
  );
  ambient.addBird(
    "bird_high",
    [
      [-20, -10],
      [20, 10],
      [-20, 18],
      [20, -18],
    ],
    { bodyColor: "#f4d36a", wingColor: "#b89a3a", altitude: 10, speed: 7.0 },
  );

  // Register per-scenario incident animations.
  if (homePuddle && homeKitchenSource) {
    ambient.registerIncident(
      "home",
      makeBurstPipeIncident(scene, root, homePuddle, homeKitchenSource),
    );
  }
  if (motorLeadCar.length && motorRearCar.length && motorContact) {
    ambient.registerIncident(
      "motor",
      makeRearEndIncident(scene, root, motorLeadCar, motorRearCar, motorContact),
    );
  }
  if (cafeSmokeMeshes.length && cafeFlickerAt) {
    ambient.registerIncident(
      "business",
      makeSmokeIncident(scene, root, cafeSmokeMeshes, cafeFlickerAt),
    );
  }
  if (travelSuitcase && travelTrolleyTop && travelLostRest) {
    ambient.registerIncident(
      "travel",
      makeLuggageIncident(root, travelSuitcase, travelTrolleyTop, travelLostRest),
    );
  }
  if (lifeHomeCenter) {
    ambient.registerIncident(
      "life",
      makeCalmGlowIncident(scene, root, lifeHomeCenter),
    );
  }

  return {
    root,
    zones,
    update: (dt) => ambient.update(dt),
    playIncident: (id) => ambient.playIncident(id),
    clearIncident: () => ambient.clearIncident(),
  };
}

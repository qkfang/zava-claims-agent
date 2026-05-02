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

/**
 * Build the voxel "Claims Neighbourhood" scene as described in
 * `storybook/theme_neighhood.md`.
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
 * The Zava Claims Office sits at the centre as the visual anchor. Roads
 * connect every zone to the office door so customers can be seen "heading
 * to the office".
 *
 * The function is intentionally side-effect-only: it adds meshes to the
 * provided `scene`. All pieces are parented to a single root TransformNode
 * (returned) so callers can dispose them as a unit if needed.
 */
export function buildNeighbourhood(scene: Scene): TransformNode {
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

  // Dashed center lines along the horizontal road
  for (let x = -38; x <= 38; x += 4) {
    if (Math.abs(x) < 4) continue; // skip intersection
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

  const makeRoof = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    color: string,
  ): Mesh => {
    // A simple pitched roof made from a rotated box for a pleasing voxel look.
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position = pos;
    m.rotation.z = Math.PI / 4;
    m.material = mat(name, color);
    attach(m);
    return m;
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
  // them; the office scene has the live agent simulation. Here they're just
  // tiny decorative figures heading towards the office.
  const makePerson = (
    x: number,
    z: number,
    shirt: string,
    pants = "#3a4b6a",
  ): void => {
    makeBox(
      `nh_person_head_${x}_${z}`,
      0.45,
      0.45,
      0.45,
      new Vector3(x, 1.45, z),
      "#f0c8a0",
    );
    makeBox(
      `nh_person_body_${x}_${z}`,
      0.5,
      0.7,
      0.35,
      new Vector3(x, 0.95, z),
      shirt,
    );
    makeBox(
      `nh_person_legs_${x}_${z}`,
      0.5,
      0.55,
      0.35,
      new Vector3(x, 0.3, z),
      pants,
    );
  };

  // Incident marker — a floating "!" bubble above an incident.
  const makeIncidentMarker = (
    x: number,
    y: number,
    z: number,
    icon: "water" | "car" | "fire" | "luggage" | "heart",
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

  // ----- Zava Claims Office (central anchor) -----
  // The office sits just north-west of the roundabout so the front door
  // faces the central crossroads.
  const officeRoot = new TransformNode("nh_office_root", scene);
  officeRoot.parent = root;
  officeRoot.position = new Vector3(-7, 0, 8);

  const officeBase = MeshBuilder.CreateBox(
    "nh_office_base",
    { width: 12, height: 4.2, depth: 8 },
    scene,
  );
  officeBase.position = new Vector3(0, 2.1, 0);
  officeBase.material = mat("officeBase", "#efe0c8");
  officeBase.parent = officeRoot;

  const officeRoof = MeshBuilder.CreateBox(
    "nh_office_roof",
    { width: 12.8, height: 0.6, depth: 8.8 },
    scene,
  );
  officeRoof.position = new Vector3(0, 4.5, 0);
  officeRoof.material = mat("officeRoof", "#3a5fb0");
  officeRoof.parent = officeRoot;

  // Office sign
  const officeSign = MeshBuilder.CreateBox(
    "nh_office_sign",
    { width: 8, height: 1.4, depth: 0.2 },
    scene,
  );
  officeSign.position = new Vector3(0, 3.6, -4.05);
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
  sctx.fillText("ZAVA CLAIMS OFFICE", 200, 110);
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

  // Office windows
  const winMat = mat("officeWin", "#cfe7ff");
  for (const wx of [-4, -2, 2, 4]) {
    const w = MeshBuilder.CreateBox(
      `nh_office_win_${wx}`,
      { width: 1.2, height: 1.0, depth: 0.1 },
      scene,
    );
    w.position = new Vector3(wx, 2.6, -4.03);
    w.material = winMat;
    w.parent = officeRoot;
  }

  // Small pathway from the office door to the roundabout
  const path = MeshBuilder.CreateBox(
    "nh_office_path",
    { width: 1.6, height: 0.05, depth: 6 },
    scene,
  );
  path.position = new Vector3(-7, 0.08, 4.5);
  path.material = mat("path", "#d8c9a2");
  attach(path);

  // Office label
  makeLabel(-7, 13, "Zava Claims Office", "#2a3a5c");

  // ----- Zone 1: Residential Street — Home Insurance (burst pipe) -----
  // North-east quadrant
  {
    const zx = 16;
    const zz = 14;

    // House 1 (the burst-pipe house)
    makeBox("nh_home_h1_base", 5, 2.6, 4, new Vector3(zx, 1.3, zz), "#e7c8a0");
    makeRoof("nh_home_h1_roof", 4.8, 2.4, 4.2, new Vector3(zx, 3.1, zz), "#b04a3a");
    makeBox("nh_home_h1_door", 0.9, 1.6, 0.15, new Vector3(zx, 0.8, zz - 2.05), "#5a3a22");
    makeBox("nh_home_h1_win1", 1.0, 0.8, 0.1, new Vector3(zx - 1.5, 1.6, zz - 2.05), "#cfe7ff");
    makeBox("nh_home_h1_win2", 1.0, 0.8, 0.1, new Vector3(zx + 1.5, 1.6, zz - 2.05), "#cfe7ff");
    // Garden / driveway
    makeBox("nh_home_h1_drive", 2.4, 0.05, 3, new Vector3(zx, 0.06, zz - 4), "#b8b0a0");
    // Plumber van out front
    makeBox("nh_van_body", 2.6, 1.2, 1.4, new Vector3(zx + 3.6, 0.7, zz - 4.5), "#3a8fd6");
    makeBox("nh_van_roof", 2.4, 0.6, 1.3, new Vector3(zx + 3.2, 1.55, zz - 4.5), "#3a8fd6");
    makeBox("nh_van_window", 1.0, 0.5, 1.3, new Vector3(zx + 4.3, 1.05, zz - 4.5), "#cfe7ff");
    // Water puddle
    makeBox("nh_puddle", 1.6, 0.05, 1.0, new Vector3(zx - 0.5, 0.07, zz - 3.5), "#6cb8e8");

    // Neighbouring house
    makeBox("nh_home_h2_base", 4.2, 2.4, 3.6, new Vector3(zx + 8, 1.2, zz), "#f0d6b0");
    makeRoof("nh_home_h2_roof", 4.0, 2.2, 3.8, new Vector3(zx + 8, 2.9, zz), "#7a4a3a");
    makeBox("nh_home_h2_door", 0.8, 1.5, 0.15, new Vector3(zx + 8, 0.75, zz - 1.85), "#5a3a22");

    // Trees
    makeTree(zx - 3.5, zz + 2);
    makeTree(zx + 5.5, zz + 2.5);
    makeTree(zx + 11, zz - 2);

    // Customer (Michael)
    makePerson(zx - 1, zz - 5, "#d6a35c");

    // Incident marker over house 1
    makeIncidentMarker(zx, 5.2, zz, "water");

    makeLabel(zx + 4, zz + 4, "Residential — Home Claims", "#3a8fd6");
  }

  // ----- Zone 2: Main Road / Intersection — Motor Insurance -----
  // East side, on the main road
  {
    const zx = 22;
    const zz = 0;

    // Two cars touching bumpers
    makeBox("nh_car1_body", 2.6, 0.8, 1.4, new Vector3(zx, 0.55, zz - 0.8), "#c44a3a");
    makeBox("nh_car1_top", 1.6, 0.6, 1.2, new Vector3(zx - 0.2, 1.25, zz - 0.8), "#a23a2c");
    makeBox("nh_car1_win", 1.4, 0.4, 1.25, new Vector3(zx - 0.2, 1.25, zz - 0.8), "#cfe7ff");

    makeBox("nh_car2_body", 2.6, 0.8, 1.4, new Vector3(zx + 3, 0.55, zz - 0.8), "#3a6dc4");
    makeBox("nh_car2_top", 1.6, 0.6, 1.2, new Vector3(zx + 3.2, 1.25, zz - 0.8), "#2a55a0");
    makeBox("nh_car2_win", 1.4, 0.4, 1.25, new Vector3(zx + 3.2, 1.25, zz - 0.8), "#cfe7ff");

    // Hazard triangle (small red pyramid via rotated box)
    makeBox("nh_hazard", 0.4, 0.5, 0.05, new Vector3(zx + 1.4, 0.3, zz - 1.8), "#e84b3a");

    // Tow truck approaching
    makeBox("nh_tow_body", 3.0, 1.0, 1.4, new Vector3(zx + 8, 0.65, zz - 0.8), "#ffd166");
    makeBox("nh_tow_cab", 1.4, 0.8, 1.3, new Vector3(zx + 7, 1.55, zz - 0.8), "#ffb347");
    makeBox("nh_tow_hook", 1.4, 0.2, 0.2, new Vector3(zx + 9.6, 0.7, zz - 0.8), "#3a3a3a");

    // Driver standing nearby (Aisha)
    makePerson(zx + 1.2, zz + 1.2, "#b03a6f");

    // Incident marker
    makeIncidentMarker(zx + 1.5, 3.4, zz - 0.8, "car");

    makeLabel(zx + 3, zz + 4, "Main Road — Motor Claims", "#c44a3a");
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
    for (const [dx, dy, sz] of [
      [-0.4, 4.4, 1.0],
      [0.6, 5.0, 1.2],
      [-0.2, 5.6, 0.9],
    ] as Array<[number, number, number]>) {
      makeBox(
        `nh_smoke_${dx}_${dy}`,
        sz,
        sz * 0.9,
        sz,
        new Vector3(cafeX + dx, dy, zz),
        "#9aa0a8",
      );
    }

    // "Closed" sign
    makeBox("nh_closed_sign", 0.9, 0.4, 0.06, new Vector3(cafeX, 1.4, zz - 1.95), "#c44a3a");

    // Fire truck nearby
    makeBox("nh_fire_body", 3.6, 1.2, 1.6, new Vector3(zx + 4.4, 0.7, zz - 5), "#e84b3a");
    makeBox("nh_fire_cab", 1.4, 1.0, 1.5, new Vector3(zx + 3.0, 1.7, zz - 5), "#c44a3a");
    makeBox("nh_fire_light", 0.4, 0.25, 0.4, new Vector3(zx + 3.0, 2.35, zz - 5), "#3a8fd6");
    makeBox("nh_fire_ladder", 3.0, 0.15, 0.3, new Vector3(zx + 4.6, 1.95, zz - 5), "#b8b0a0");

    // Customer (Tom)
    makePerson(cafeX - 1.5, zz - 4.5, "#5a8a4a");

    // Incident marker
    makeIncidentMarker(cafeX, 3.4, zz, "fire");

    makeLabel(zx + 4, zz - 5.5, "High Street — Business Claims", "#e07a2c");
  }

  // ----- Zone 4: Travel Hub — Travel Insurance (lost luggage) -----
  // North-west quadrant
  {
    const zx = -20;
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
    makeBox("nh_lug_lost", 0.7, 0.4, 0.5, new Vector3(zx + 5, 0.3, zz + 2), "#5a8a4a");

    // Worried traveller (Grace) on phone
    makePerson(zx - 1, zz + 0.5, "#e07a2c");

    makeIncidentMarker(zx - 2, 2.4, zz + 1.5, "luggage");

    makeLabel(zx, zz - 5, "Travel Hub — Travel Claims", "#3a5fb0");
  }

  // ----- Zone 5: Quiet Suburb Home — Life Insurance -----
  // South-east quadrant — handled with calm tone
  {
    const zx = 16;
    const zz = -16;

    // Calm house, set apart
    makeBox("nh_life_base", 4.6, 2.6, 4, new Vector3(zx, 1.3, zz), "#f0e6d2");
    makeRoof("nh_life_roof", 4.6, 2.2, 4.2, new Vector3(zx, 3.0, zz), "#5a6a7c");
    makeBox("nh_life_door", 0.9, 1.6, 0.15, new Vector3(zx, 0.8, zz - 2.05), "#3a3a3a");
    makeBox("nh_life_win1", 1.0, 0.8, 0.1, new Vector3(zx - 1.5, 1.6, zz - 2.05), "#cfe7ff");
    makeBox("nh_life_win2", 1.0, 0.8, 0.1, new Vector3(zx + 1.5, 1.6, zz - 2.05), "#cfe7ff");

    // Driveway with parked family car
    makeBox("nh_life_drive", 2.6, 0.05, 4, new Vector3(zx - 3.5, 0.07, zz - 1), "#b8b0a0");
    makeBox("nh_life_car_body", 2.4, 0.7, 1.3, new Vector3(zx - 3.5, 0.5, zz - 1), "#5a6a7c");
    makeBox("nh_life_car_top", 1.4, 0.55, 1.2, new Vector3(zx - 3.5, 1.1, zz - 1), "#3a4a5c");
    makeBox("nh_life_car_win", 1.2, 0.4, 1.25, new Vector3(zx - 3.5, 1.1, zz - 1), "#cfe7ff");

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

    // Soft heart marker (gentle)
    makeIncidentMarker(zx, 4.6, zz, "heart");

    makeLabel(zx, zz + 5, "Family Home — Life Claims", "#c2566f");
  }

  // ----- Background filler: a few generic suburban houses -----
  for (const [hx, hz, color, roof] of [
    [-30, 6, "#e7c8a0", "#7a4a3a"],
    [-30, -2, "#f0d6b0", "#b04a3a"],
    [30, 10, "#e7d6c0", "#5a6a7c"],
    [30, -8, "#f0e0c8", "#7a4a3a"],
    [-12, -22, "#e7c8a0", "#b04a3a"],
    [10, 22, "#f0d6b0", "#5a6a7c"],
  ] as Array<[number, number, string, string]>) {
    makeBox(`nh_filler_base_${hx}_${hz}`, 3.6, 2.2, 3.2, new Vector3(hx, 1.1, hz), color);
    makeRoof(`nh_filler_roof_${hx}_${hz}`, 3.4, 2.0, 3.4, new Vector3(hx, 2.6, hz), roof);
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

  // ----- Decorative customer trail: a few people on streets heading to office -----
  makePerson(0, -10, "#3a8fd6");
  makePerson(8, -2, "#c44a3a");
  makePerson(-3, 6, "#5a8a4a");
  makePerson(-2, -3, "#b03a6f");

  return root;
}

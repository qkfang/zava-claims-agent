import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

/**
 * Anchor points used by the simulation. Coordinates are in scene units.
 *
 * Layout (bird's-eye, X right / Z forward) — full-floor footprint
 * (40 × 26 units, x∈[-20, 20], z∈[-11, 15]):
 *
 *   z = +15 ┌─────────────────────────────────────────────────────────┐
 *           │ Identity wall │ Filing cabinets │ Meeting Room │ Kitchen │  back wall
 *           │ Team Leader   │                 │              │ Café    │  back-mid
 *           ├──────┬─────────────────────────────────────────┬─────────┤
 *           │ Coll │ Claims Assessor │ Loss Adj. │ Fraud Inv │ Café    │  middle row
 *           │ ab   ├─────────────────────────────────────────┤         │
 *           │ Zone │ Supplier Coord. │ Settlement │ Cust Comm│         │  front row
 *           ├──────┴─────────────────────────────────────────┴─────────┤
 *   intake │ Intake │  Lobby + Welcome Counters (Quick / Help / Policy)│
 *           │        │                  Reception                      │
 *   z = -11 └─────────────────────────────────────────────────────────┘
 *           x = -20                                              x = +20
 */
export interface OfficeLayout {
  /** World position where customers spawn outside the door. */
  spawnPoint: Vector3;
  /** Just inside the entrance — used as a routing anchor. */
  entrancePoint: Vector3;
  /** Where customers queue/drop their claim at reception. */
  receptionPoint: Vector3;
  /** Where customers go after handing in their claim, then despawn. */
  exitPoint: Vector3;
  /** Reception desk where the Claims Intake Officer stands. */
  intakeDeskPoint: Vector3;
  /** Cubicle desk for the Claims Assessor. */
  assessorDeskPoint: Vector3;
  /** Cubicle desk for the Loss Adjuster. */
  lossAdjusterDeskPoint: Vector3;
  /** Cubicle desk for the Fraud Investigator. */
  fraudDeskPoint: Vector3;
  /** Cubicle desk for the Supplier Coordinator. */
  supplierDeskPoint: Vector3;
  /** Cubicle desk for the Settlement Officer. */
  settlementDeskPoint: Vector3;
  /** Cubicle desk for the Customer Communications Specialist. */
  communicationsDeskPoint: Vector3;
  /** Office desk for the Claims Team Leader. */
  teamLeaderDeskPoint: Vector3;
  /** Shared inbox tray on the intake desk where customers drop folders. */
  inboxPoint: Vector3;
  /** Shelf where filed/closed claims rest (in the comms department). */
  archivePoint: Vector3;
}

interface MaterialFactory {
  (name: string, hex: string): StandardMaterial;
}

/**
 * Build the isometric voxel office. All meshes are static; the function
 * returns the layout reference points used by the agent simulation.
 */
export function buildOffice(scene: Scene): OfficeLayout {
  const mat: MaterialFactory = (name, hex) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    return m;
  };

  // ----- Floor & exterior ground -----
  // Full-floor footprint: the office spans x∈[-20, 20], z∈[-11, 15] (40 × 26
  // units). The exterior ground extends well beyond it so the diorama edges
  // don't cut off when the camera pans.
  const ground = MeshBuilder.CreateBox(
    "ground",
    { width: 80, depth: 80, height: 0.4 },
    scene,
  );
  ground.position.y = -0.2;
  ground.material = mat("ground", "#2f3a52");

  // Main office floor — light tile
  const floor = MeshBuilder.CreateBox(
    "floor",
    { width: 40, depth: 26, height: 0.2 },
    scene,
  );
  floor.position = new Vector3(0, 0.0, 2);
  floor.material = mat("floor", "#cfc6b4");

  // Tile grid lines (subtle stripes baked in via thin overlay boxes)
  const tileLine = mat("tileLine", "#a89e8a");
  for (let i = -19; i <= 19; i += 2) {
    const lineX = MeshBuilder.CreateBox(
      `tileX_${i}`,
      { width: 0.04, height: 0.01, depth: 26 },
      scene,
    );
    lineX.position = new Vector3(i, 0.11, 2);
    lineX.material = tileLine;
  }
  for (let i = -10; i <= 14; i += 2) {
    const lineZ = MeshBuilder.CreateBox(
      `tileZ_${i}`,
      { width: 40, height: 0.01, depth: 0.04 },
      scene,
    );
    lineZ.position = new Vector3(0, 0.11, i);
    lineZ.material = tileLine;
  }

  // Lobby wood floor — wider "claims lobby" with welcome counters
  const lobbyFloor = MeshBuilder.CreateBox(
    "lobbyFloor",
    { width: 16, height: 0.06, depth: 6.5 },
    scene,
  );
  lobbyFloor.position = new Vector3(-6, 0.13, -7);
  lobbyFloor.material = mat("lobbyFloor", "#c79e6e");

  // Decorative break-room wood floor (back-right) so the kitchen feels distinct
  const kitchenFloor = MeshBuilder.CreateBox(
    "kitchenFloor",
    { width: 8.5, height: 0.06, depth: 7.0 },
    scene,
  );
  kitchenFloor.position = new Vector3(17, 0.13, 10);
  kitchenFloor.material = mat("kitchenFloor", "#d8b884");

  // Café accent floor (right side, mid)
  const cafeFloor = MeshBuilder.CreateBox(
    "cafeFloor",
    { width: 7, height: 0.06, depth: 5.5 },
    scene,
  );
  cafeFloor.position = new Vector3(17.5, 0.13, 0);
  cafeFloor.material = mat("cafeFloor", "#b88a64");

  // Collaboration zone accent floor (left side, mid)
  const collabFloor = MeshBuilder.CreateBox(
    "collabFloor",
    { width: 4.5, height: 0.06, depth: 6 },
    scene,
  );
  collabFloor.position = new Vector3(-17.5, 0.13, 2);
  collabFloor.material = mat("collabFloor", "#3a4a6e");

  // ----- Walls -----
  const wallMat = mat("wall", "#efe0c8");
  const trimMat = mat("trim", "#cdb497");

  const makeWall = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
  ): Mesh => {
    const wall = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    wall.position = pos;
    wall.material = wallMat;
    return wall;
  };

  // Outer walls — back, left, right (sized to the new full-floor footprint)
  makeWall("backWall", 40, 4.6, 0.3, new Vector3(0, 2.3, 15.0));
  makeWall("leftWall", 0.3, 4.6, 26, new Vector3(-20.0, 2.3, 2));
  makeWall("rightWall", 0.3, 4.6, 26, new Vector3(20.0, 2.3, 2));
  // Front low walls flanking the entrance gap (so we can see inside)
  makeWall("frontLeft", 18, 1.4, 0.3, new Vector3(-11.0, 0.7, -11));
  makeWall("frontRight", 18, 1.4, 0.3, new Vector3(11.0, 0.7, -11));

  // Bottom trim along outer walls
  const trimBack = MeshBuilder.CreateBox(
    "trimBack",
    { width: 40, height: 0.3, depth: 0.4 },
    scene,
  );
  trimBack.position = new Vector3(0, 0.25, 14.85);
  trimBack.material = trimMat;

  // ----- "CLAIMS DEPARTMENT" identity wall (back-left) -----
  const identityPanel = MeshBuilder.CreateBox(
    "identityPanel",
    { width: 7.5, height: 3.2, depth: 0.12 },
    scene,
  );
  identityPanel.position = new Vector3(-13, 2.3, 14.78);
  identityPanel.material = mat("identityPanel", "#2a3a5c");

  drawSignTexture(scene, identityPanel, 1024, 440, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 1024, 440);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 110px sans-serif";
    ctx.fillText("CLAIMS", 50, 140);
    ctx.fillText("DEPARTMENT", 50, 250);
    ctx.font = "28px sans-serif";
    ctx.fillStyle = "#cfd8ee";
    const values = ["Integrity", "Focus", "Collaboration", "Empathy", "Results"];
    const colW = 1024 / values.length;
    for (let i = 0; i < values.length; i++) {
      // small icon circle
      ctx.beginPath();
      ctx.arc(60 + i * colW + 30, 360, 22, 0, Math.PI * 2);
      ctx.fillStyle = "#6ec1ff";
      ctx.fill();
      ctx.fillStyle = "#cfd8ee";
      ctx.fillText(values[i], 60 + i * colW + 70, 370);
    }
  });

  // ----- "OUR PROCESS" board (right wall) -----
  const processPanel = MeshBuilder.CreateBox(
    "processPanel",
    { width: 0.12, height: 2.6, depth: 3.4 },
    scene,
  );
  processPanel.position = new Vector3(19.78, 2.4, 6);
  processPanel.material = mat("processPanel", "#f4ecdb");

  drawSignTexture(scene, processPanel, 512, 400, (ctx) => {
    ctx.fillStyle = "#f4ecdb";
    ctx.fillRect(0, 0, 512, 400);
    ctx.fillStyle = "#1c2230";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("OUR PROCESS", 30, 70);
    ctx.font = "bold 38px sans-serif";
    const steps = ["1  Report", "2  Assess", "3  Investigate", "4  Resolve", "5  Close"];
    for (let i = 0; i < steps.length; i++) {
      ctx.fillStyle = "#3a5fb0";
      ctx.fillRect(30, 110 + i * 55, 18, 38);
      ctx.fillStyle = "#1c2230";
      ctx.fillText(steps[i], 60, 142 + i * 55);
    }
  });

  // ----- "WELCOME" sign on the reception desk side panel -----
  const welcomeSign = MeshBuilder.CreateBox(
    "welcomeSign",
    { width: 2.6, height: 0.7, depth: 0.08 },
    scene,
  );
  welcomeSign.position = new Vector3(-12.5, 0.55, -5.4);
  welcomeSign.material = mat("welcomeSign", "#3a5fb0");
  drawSignTexture(scene, welcomeSign, 512, 160, (ctx) => {
    ctx.fillStyle = "#3a5fb0";
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 90px sans-serif";
    ctx.fillText("WELCOME", 60, 110);
  });

  // ----- "We're here to help" entrance sign -----
  const helpSign = MeshBuilder.CreateBox(
    "helpSign",
    { width: 2.0, height: 1.2, depth: 0.08 },
    scene,
  );
  helpSign.position = new Vector3(4.5, 1.0, -10.85);
  helpSign.material = mat("helpSign", "#f4ecdb");
  drawSignTexture(scene, helpSign, 320, 200, (ctx) => {
    ctx.fillStyle = "#f4ecdb";
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = "#1c2230";
    ctx.font = "bold 36px sans-serif";
    ctx.fillText("We're here", 40, 80);
    ctx.fillText("to help.", 40, 130);
  });

  // ----- Back-wall windows -----
  const windowMat = mat("window", "#cfe7ff");
  const windowFrame = mat("windowFrame", "#f6e9d4");
  for (let i = 0; i < 4; i++) {
    const x = -3 + i * 4.2;
    const frame = MeshBuilder.CreateBox(
      `winFrame_${i}`,
      { width: 3.2, height: 2.6, depth: 0.1 },
      scene,
    );
    frame.position = new Vector3(x, 2.7, 14.84);
    frame.material = windowFrame;
    const glass = MeshBuilder.CreateBox(
      `winGlass_${i}`,
      { width: 2.8, height: 2.2, depth: 0.05 },
      scene,
    );
    glass.position = new Vector3(x, 2.7, 14.79);
    glass.material = windowMat;
  }

  // ----- Front entrance (double doors) -----
  const doorFrame = mat("doorFrame", "#7a8aa6");
  const leftDoor = MeshBuilder.CreateBox(
    "leftDoor",
    { width: 1.0, height: 2.4, depth: 0.15 },
    scene,
  );
  leftDoor.position = new Vector3(-0.55, 1.2, -11);
  leftDoor.material = doorFrame;
  const rightDoor = leftDoor.clone("rightDoor");
  rightDoor.position.x = 0.55;
  for (const d of [leftDoor, rightDoor]) {
    const glass = MeshBuilder.CreateBox(
      `${d.name}_glass`,
      { width: 0.8, height: 1.6, depth: 0.05 },
      scene,
    );
    glass.position = new Vector3(d.position.x, 1.4, -10.93);
    glass.material = windowMat;
  }
  // Welcome mat
  const mat1 = MeshBuilder.CreateBox(
    "welcomeMat",
    { width: 2.4, height: 0.04, depth: 1.2 },
    scene,
  );
  mat1.position = new Vector3(0, 0.13, -9.6);
  mat1.material = mat("welcomeMat", "#3a3a44");

  // ----- Reception / Welcome lobby furniture (front-left) -----
  // Reception desk (curved-look L)
  const recDeskMat = mat("recDesk", "#a06a4c");
  const recDeskTop = mat("recDeskTop", "#d4b596");
  const recBase = MeshBuilder.CreateBox(
    "recDeskBase",
    { width: 4.5, height: 1.0, depth: 1.4 },
    scene,
  );
  recBase.position = new Vector3(-10.2, 0.5, -7.4);
  recBase.material = recDeskMat;
  const recTop = MeshBuilder.CreateBox(
    "recDeskTop",
    { width: 4.7, height: 0.15, depth: 1.6 },
    scene,
  );
  recTop.position = new Vector3(-10.2, 1.07, -7.4);
  recTop.material = recDeskTop;
  // Inbox tray on reception desk
  const tray = MeshBuilder.CreateBox(
    "inboxTray",
    { width: 0.8, height: 0.1, depth: 0.5 },
    scene,
  );
  tray.position = new Vector3(-9.0, 1.18, -7.4);
  tray.material = mat("tray", "#3a3a44");
  const trayLabel = MeshBuilder.CreateBox(
    "inboxLabel",
    { width: 0.4, height: 0.02, depth: 0.2 },
    scene,
  );
  trayLabel.position = new Vector3(-9.0, 1.24, -7.25);
  trayLabel.material = mat("trayLabel", "#ffb347");
  // Reception monitor
  buildMonitor(scene, mat, new Vector3(-11.0, 1.07, -7.7), 0);

  // Coffee table + sofas in lobby
  const sofaMat = mat("sofa", "#3a5fb0");
  const sofa1Seat = MeshBuilder.CreateBox(
    "sofa1Seat",
    { width: 1.2, height: 0.5, depth: 1.2 },
    scene,
  );
  sofa1Seat.position = new Vector3(-12, 0.4, -9);
  sofa1Seat.material = sofaMat;
  const sofa2Seat = sofa1Seat.clone("sofa2Seat");
  sofa2Seat.position = new Vector3(-9.0, 0.4, -9);
  const cTableTop = MeshBuilder.CreateBox(
    "cTableTop",
    { width: 1.6, height: 0.1, depth: 0.8 },
    scene,
  );
  cTableTop.position = new Vector3(-10.5, 0.45, -9.0);
  cTableTop.material = mat("cTable", "#a06a4c");
  const cTableLeg = MeshBuilder.CreateBox(
    "cTableLeg",
    { width: 1.4, height: 0.4, depth: 0.6 },
    scene,
  );
  cTableLeg.position = new Vector3(-10.5, 0.2, -9.0);
  cTableLeg.material = mat("cTableLeg", "#7d4f33");

  // Lobby plants
  buildPlant(scene, mat, new Vector3(-13.5, 0, -8.5));
  buildPlant(scene, mat, new Vector3(-7.5, 0, -9.5));

  // ----- Department grid -----
  // We arrange 7 numbered cubicles in a 2-row grid plus a Team Leader
  // open office and a Meeting Room across the back of the floor.
  //
  // Front row (z ~ -2): Supplier Coordinator | Settlement Officer | Customer Comms
  // Mid   row (z ~ +5): Claims Assessor      | Loss Adjuster      | Fraud Investigator
  // Back area:           Team Leader (left)              Meeting Room (right)
  // Reception/Intake stays on the front-left (already built above).

  // ----- Cubicles (front and middle rows) -----
  type CubicleSpec = {
    label: string;
    color: string;
    cx: number;
    cz: number;
    facing: "front" | "back"; // which side the staff sit
    sign: string;
  };
  const cubicles: CubicleSpec[] = [
    // Front row
    { label: "supplier", color: "#6ec1ff", cx: -6, cz: -2, facing: "front", sign: "SUPPLIER COORDINATOR" },
    { label: "settlement", color: "#6ec1ff", cx: 0, cz: -2, facing: "front", sign: "SETTLEMENT OFFICER" },
    { label: "communications", color: "#6ec1ff", cx: 6, cz: -2, facing: "front", sign: "CUSTOMER COMMUNICATIONS" },
    // Middle row (facing forward toward the customer flow)
    { label: "assessor", color: "#6ec1ff", cx: -6, cz: 5, facing: "front", sign: "CLAIMS ASSESSOR" },
    { label: "lossAdjuster", color: "#6ec1ff", cx: 0, cz: 5, facing: "front", sign: "LOSS ADJUSTER" },
    { label: "fraud", color: "#6ec1ff", cx: 6, cz: 5, facing: "front", sign: "FRAUD INVESTIGATOR" },
  ];
  for (const c of cubicles) {
    buildCubicle(scene, mat, c.label, c.cx, c.cz, c.sign);
  }

  // ----- Claims Intake cubicle (front-left next to reception lobby) -----
  buildCubicle(scene, mat, "intake", -11.5, 0.5, "CLAIMS INTAKE OFFICER");

  // ----- Team Leader open office (back-left, behind the assessor row) -----
  buildTeamLeaderOffice(scene, mat, new Vector3(-9.5, 0, 9.5));

  // ----- Meeting Room (back-right glass room) -----
  buildMeetingRoom(scene, mat, new Vector3(7.5, 0, 9.5));

  // ----- Filing cabinets / archive shelves (along the new back wall) -----
  for (let col = 0; col < 4; col++) {
    const x = -3.6 + col * 1.4;
    const cab = MeshBuilder.CreateBox(
      `cabinet_${col}`,
      { width: 1.2, height: 1.6, depth: 0.7 },
      scene,
    );
    cab.position = new Vector3(x, 0.8, 13.7);
    cab.material = mat("cabinet", "#3b4d72");
    for (let s = 0; s < 3; s++) {
      const drawer = MeshBuilder.CreateBox(
        `drawer_${col}_${s}`,
        { width: 1.0, height: 0.4, depth: 0.05 },
        scene,
      );
      drawer.position = new Vector3(x, 0.4 + s * 0.5, 13.34);
      drawer.material = mat("drawerFront", "#26334d");
    }
  }
  // Plants on top of cabinets
  for (let col = 0; col < 4; col += 2) {
    buildPlant(scene, mat, new Vector3(-3.6 + col * 1.4, 1.6, 13.7));
  }

  // ----- Water cooler near the identity wall (back-left corner) -----
  const cooler = MeshBuilder.CreateBox(
    "cooler",
    { width: 0.6, height: 1.4, depth: 0.6 },
    scene,
  );
  cooler.position = new Vector3(-18.5, 0.7, 13);
  cooler.material = mat("cooler", "#bcd7ee");
  const coolerTop = MeshBuilder.CreateBox(
    "coolerTop",
    { width: 0.5, height: 0.5, depth: 0.5 },
    scene,
  );
  coolerTop.position = new Vector3(-18.5, 1.65, 13);
  coolerTop.material = mat("coolerTop", "#7fb6e3");

  // Printer station tucked into the right-side service alley
  const printer = MeshBuilder.CreateBox(
    "printer",
    { width: 1.0, height: 0.7, depth: 0.7 },
    scene,
  );
  printer.position = new Vector3(13.0, 0.45, 5.5);
  printer.material = mat("printer", "#3a3a44");
  const printerTop = MeshBuilder.CreateBox(
    "printerTop",
    { width: 0.9, height: 0.1, depth: 0.6 },
    scene,
  );
  printerTop.position = new Vector3(13.0, 0.85, 5.5);
  printerTop.material = mat("printerTop", "#22252e");

  // ----- "Fun" sections in the newly opened floor space -----
  // Welcome counters in the claims lobby (a row of customer-facing service
  // counters between the entrance and the reception/intake desk).
  buildLobbyCounter(scene, mat, "QUICK INTAKE", -2.5, -6.4, "#3a5fb0");
  buildLobbyCounter(scene, mat, "CLAIMS HELP", 1.5, -6.4, "#2e8a6e");
  buildLobbyCounter(scene, mat, "POLICY DESK", 5.5, -6.4, "#a06a4c");

  // Kitchen / break room (back-right)
  buildKitchen(scene, mat, new Vector3(17, 0, 10));

  // Café / coffee corner (right side, mid)
  buildCafe(scene, mat, new Vector3(17.5, 0, 0));

  // Collaboration / huddle zone (left side, mid)
  buildCollabZone(scene, mat, new Vector3(-17.5, 0, 2));

  // Decorative plants in walkways
  buildPlant(scene, mat, new Vector3(-3.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(3.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(-3.0, 0, 1.8));
  buildPlant(scene, mat, new Vector3(3.0, 0, 1.8));
  buildPlant(scene, mat, new Vector3(13.0, 0, 0));
  buildPlant(scene, mat, new Vector3(13.5, 0, 13));
  buildPlant(scene, mat, new Vector3(-13.5, 0, 13));
  buildPlant(scene, mat, new Vector3(18.5, 0, 13.5));
  buildPlant(scene, mat, new Vector3(-18.5, 0, -8));
  buildPlant(scene, mat, new Vector3(18.5, 0, -8));

  return {
    spawnPoint: new Vector3(0, 0, -14),
    entrancePoint: new Vector3(0, 0, -9.5),
    receptionPoint: new Vector3(-9.0, 0, -6.5),
    exitPoint: new Vector3(0, 0, -14),
    intakeDeskPoint: new Vector3(-11.5, 0, -0.4),
    assessorDeskPoint: new Vector3(-6, 0, 4.4),
    lossAdjusterDeskPoint: new Vector3(0, 0, 4.4),
    fraudDeskPoint: new Vector3(6, 0, 4.4),
    supplierDeskPoint: new Vector3(-6, 0, -2.6),
    settlementDeskPoint: new Vector3(0, 0, -2.6),
    communicationsDeskPoint: new Vector3(6, 0, -2.6),
    teamLeaderDeskPoint: new Vector3(-9.5, 0, 9.0),
    inboxPoint: new Vector3(-9.0, 1.25, -7.4),
    archivePoint: new Vector3(8.0, 1.4, -1.0),
  };
}

// ===== Helpers =====

/** Bake text/graphics onto the front face of a sign mesh via a DynamicTexture. */
function drawSignTexture(
  scene: Scene,
  mesh: Mesh,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  const tex = new DynamicTexture(`tex_${mesh.name}`, { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx);
  tex.update(false);
  const m = new StandardMaterial(`signMat_${mesh.name}`, scene);
  m.diffuseTexture = tex;
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  m.emissiveColor = new Color3(0.18, 0.18, 0.18);
  mesh.material = m;
}

/** Build a single labelled cubicle: low partition walls, desk, monitor, chair, sign. */
function buildCubicle(
  scene: Scene,
  mat: MaterialFactory,
  label: string,
  cx: number,
  cz: number,
  signText: string,
): void {
  const cubicleWallMat = mat(`cub_${label}`, "#d8c7a7");
  const deskMat = mat(`desk_${label}`, "#bca78a");
  const chairMat = mat(`chair_${label}`, "#1c2230");

  // Partition walls (low) — back, left, right
  const back = MeshBuilder.CreateBox(
    `cubBack_${label}`,
    { width: 4.0, height: 1.3, depth: 0.15 },
    scene,
  );
  back.position = new Vector3(cx, 0.65, cz + 1.4);
  back.material = cubicleWallMat;
  const left = MeshBuilder.CreateBox(
    `cubLeft_${label}`,
    { width: 0.15, height: 1.3, depth: 3.0 },
    scene,
  );
  left.position = new Vector3(cx - 1.95, 0.65, cz);
  left.material = cubicleWallMat;
  const right = left.clone(`cubRight_${label}`);
  right.position.x = cx + 1.95;

  // Sign on the back partition
  const sign = MeshBuilder.CreateBox(
    `cubSign_${label}`,
    { width: 3.6, height: 0.6, depth: 0.05 },
    scene,
  );
  sign.position = new Vector3(cx, 1.1, cz + 1.32);
  drawSignTexture(scene, sign, 768, 128, (ctx) => {
    ctx.fillStyle = "#3a5fb0";
    ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(signText, 384, 70);
  });

  // Desk against the back partition
  const desk = MeshBuilder.CreateBox(
    `desk_${label}`,
    { width: 3.2, height: 0.12, depth: 1.2 },
    scene,
  );
  desk.position = new Vector3(cx, 0.85, cz + 0.6);
  desk.material = deskMat;
  for (const lx of [-1.3, 1.3]) {
    const leg = MeshBuilder.CreateBox(
      `deskLeg_${label}_${lx}`,
      { width: 0.12, height: 0.85, depth: 1.0 },
      scene,
    );
    leg.position = new Vector3(cx + lx, 0.42, cz + 0.6);
    leg.material = deskMat;
  }

  // Monitor on desk
  buildMonitor(scene, mat, new Vector3(cx - 0.6, 0.92, cz + 0.5), 0);
  // Phone
  const phone = MeshBuilder.CreateBox(
    `phone_${label}`,
    { width: 0.35, height: 0.12, depth: 0.25 },
    scene,
  );
  phone.position = new Vector3(cx + 0.9, 0.97, cz + 0.7);
  phone.material = mat(`phoneMat_${label}`, "#1a1f2c");

  // Document tray
  const docTray = MeshBuilder.CreateBox(
    `docTray_${label}`,
    { width: 0.6, height: 0.06, depth: 0.4 },
    scene,
  );
  docTray.position = new Vector3(cx + 1.1, 0.95, cz + 0.3);
  docTray.material = mat(`docTrayMat_${label}`, "#f4ecdb");

  // Chair (in front of desk)
  const chairSeat = MeshBuilder.CreateBox(
    `chairSeat_${label}`,
    { width: 0.65, height: 0.12, depth: 0.65 },
    scene,
  );
  chairSeat.position = new Vector3(cx, 0.55, cz - 0.4);
  chairSeat.material = chairMat;
  const chairBack = MeshBuilder.CreateBox(
    `chairBack_${label}`,
    { width: 0.65, height: 0.8, depth: 0.12 },
    scene,
  );
  chairBack.position = new Vector3(cx, 1.0, cz - 0.7);
  chairBack.material = chairMat;
}

/** Build a small monitor (base + stem + screen) at the given desk position. */
function buildMonitor(
  scene: Scene,
  mat: MaterialFactory,
  base: Vector3,
  rotY: number,
): void {
  const tag = `${base.x.toFixed(1)}_${base.z.toFixed(1)}`;
  const monBase = MeshBuilder.CreateBox(
    `monBase_${tag}`,
    { width: 0.4, height: 0.08, depth: 0.25 },
    scene,
  );
  monBase.position = new Vector3(base.x, base.y + 0.05, base.z);
  monBase.rotation.y = rotY;
  monBase.material = mat(`monBaseMat_${tag}`, "#1a1f2c");
  const stem = MeshBuilder.CreateBox(
    `monStem_${tag}`,
    { width: 0.08, height: 0.25, depth: 0.08 },
    scene,
  );
  stem.position = new Vector3(base.x, base.y + 0.22, base.z);
  stem.rotation.y = rotY;
  stem.material = mat(`monStemMat_${tag}`, "#1a1f2c");
  const monitor = MeshBuilder.CreateBox(
    `mon_${tag}`,
    { width: 0.95, height: 0.55, depth: 0.08 },
    scene,
  );
  monitor.position = new Vector3(base.x, base.y + 0.55, base.z);
  monitor.rotation.y = rotY;
  monitor.material = mat(`monMat_${tag}`, "#1a1f2c");
  const screen = MeshBuilder.CreateBox(
    `screen_${tag}`,
    { width: 0.85, height: 0.45, depth: 0.02 },
    scene,
  );
  screen.position = new Vector3(
    base.x + Math.sin(rotY) * 0.05,
    base.y + 0.55,
    base.z + Math.cos(rotY) * 0.05,
  );
  screen.rotation.y = rotY;
  screen.material = mat(`screenMat_${tag}`, "#bcd7ee");
}

/** A pot with cube of leaves on top — used liberally to break up the floor. */
function buildPlant(
  scene: Scene,
  mat: MaterialFactory,
  pos: Vector3,
): void {
  const tag = `${pos.x.toFixed(1)}_${pos.z.toFixed(1)}_${pos.y.toFixed(1)}`;
  const pot = MeshBuilder.CreateBox(
    `plantPot_${tag}`,
    { width: 0.55, height: 0.45, depth: 0.55 },
    scene,
  );
  pot.position = new Vector3(pos.x, pos.y + 0.22, pos.z);
  pot.material = mat(`plantPotMat_${tag}`, "#6a4a36");
  const leaves = MeshBuilder.CreateBox(
    `plantLeaves_${tag}`,
    { width: 0.95, height: 0.8, depth: 0.95 },
    scene,
  );
  leaves.position = new Vector3(pos.x, pos.y + 0.85, pos.z);
  leaves.material = mat(`plantLeavesMat_${tag}`, "#3f7a44");
}

/** Team Leader open office: large desk, big chair, "TEAM LEADER" sign. */
function buildTeamLeaderOffice(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  // Floor accent (dark wood)
  const accent = MeshBuilder.CreateBox(
    "tlFloor",
    { width: 6.5, height: 0.05, depth: 5.0 },
    scene,
  );
  accent.position = new Vector3(origin.x, 0.13, origin.z);
  accent.material = mat("tlFloor", "#3a2a20");

  // Glass partition (low) at the front
  const partition = MeshBuilder.CreateBox(
    "tlPart",
    { width: 6.5, height: 1.4, depth: 0.1 },
    scene,
  );
  partition.position = new Vector3(origin.x, 0.7, origin.z - 2.4);
  partition.material = mat("tlPartMat", "#cfe7ff");
  // Frame
  const partFrame = MeshBuilder.CreateBox(
    "tlPartFrame",
    { width: 6.5, height: 0.1, depth: 0.12 },
    scene,
  );
  partFrame.position = new Vector3(origin.x, 1.4, origin.z - 2.4);
  partFrame.material = mat("tlPartFrame", "#2a3a5c");

  // Sign above
  const sign = MeshBuilder.CreateBox(
    "tlSign",
    { width: 3.0, height: 0.5, depth: 0.05 },
    scene,
  );
  sign.position = new Vector3(origin.x, 1.9, origin.z - 2.4);
  drawSignTexture(scene, sign, 512, 96, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 50px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TEAM LEADER", 256, 50);
  });

  // Executive desk
  const desk = MeshBuilder.CreateBox(
    "tlDesk",
    { width: 3.4, height: 0.15, depth: 1.3 },
    scene,
  );
  desk.position = new Vector3(origin.x, 0.85, origin.z + 0.4);
  desk.material = mat("tlDeskMat", "#a06a4c");
  const deskBase = MeshBuilder.CreateBox(
    "tlDeskBase",
    { width: 3.2, height: 0.85, depth: 1.1 },
    scene,
  );
  deskBase.position = new Vector3(origin.x, 0.43, origin.z + 0.4);
  deskBase.material = mat("tlDeskBaseMat", "#7d4f33");

  // Monitor + executive chair
  buildMonitor(scene, mat, new Vector3(origin.x - 0.7, 0.93, origin.z + 0.3), 0);
  const chairSeat = MeshBuilder.CreateBox(
    "tlChair",
    { width: 0.75, height: 0.12, depth: 0.7 },
    scene,
  );
  chairSeat.position = new Vector3(origin.x, 0.55, origin.z + 1.3);
  chairSeat.material = mat("tlChairMat", "#1c2230");
  const chairBack = MeshBuilder.CreateBox(
    "tlChairBack",
    { width: 0.75, height: 1.0, depth: 0.15 },
    scene,
  );
  chairBack.position = new Vector3(origin.x, 1.05, origin.z + 1.6);
  chairBack.material = mat("tlChairBackMat", "#1c2230");

  // Bookshelf behind
  const shelf = MeshBuilder.CreateBox(
    "tlShelf",
    { width: 2.6, height: 1.6, depth: 0.4 },
    scene,
  );
  shelf.position = new Vector3(origin.x + 1.5, 0.8, origin.z + 2.6);
  shelf.material = mat("tlShelfMat", "#3a2a20");
  for (let s = 0; s < 3; s++) {
    const stripe = MeshBuilder.CreateBox(
      `tlShelfStripe_${s}`,
      { width: 2.62, height: 0.05, depth: 0.42 },
      scene,
    );
    stripe.position = new Vector3(origin.x + 1.5, 0.4 + s * 0.5, origin.z + 2.6);
    stripe.material = mat("tlShelfStripeMat", "#cdb497");
  }
}

/** Glass-walled meeting room with a long table and chairs. */
function buildMeetingRoom(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  const glass = mat("mrGlass", "#cfe7ff");
  const frame = mat("mrFrame", "#2a3a5c");

  // Glass walls (3 sides — back is the office wall)
  const front = MeshBuilder.CreateBox(
    "mrFront",
    { width: 7.0, height: 2.4, depth: 0.1 },
    scene,
  );
  front.position = new Vector3(origin.x, 1.2, origin.z - 2.5);
  front.material = glass;
  const left = MeshBuilder.CreateBox(
    "mrLeft",
    { width: 0.1, height: 2.4, depth: 5.0 },
    scene,
  );
  left.position = new Vector3(origin.x - 3.5, 1.2, origin.z);
  left.material = glass;

  // Frames
  const frontFrame = MeshBuilder.CreateBox(
    "mrFrontFrame",
    { width: 7.0, height: 0.12, depth: 0.14 },
    scene,
  );
  frontFrame.position = new Vector3(origin.x, 2.4, origin.z - 2.5);
  frontFrame.material = frame;
  const leftFrame = MeshBuilder.CreateBox(
    "mrLeftFrame",
    { width: 0.14, height: 0.12, depth: 5.0 },
    scene,
  );
  leftFrame.position = new Vector3(origin.x - 3.5, 2.4, origin.z);
  leftFrame.material = frame;

  // Sign above
  const sign = MeshBuilder.CreateBox(
    "mrSign",
    { width: 3.2, height: 0.55, depth: 0.06 },
    scene,
  );
  sign.position = new Vector3(origin.x, 2.95, origin.z - 2.5);
  drawSignTexture(scene, sign, 512, 96, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 50px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MEETING ROOM", 256, 50);
  });

  // Conference table
  const table = MeshBuilder.CreateBox(
    "mrTable",
    { width: 4.5, height: 0.15, depth: 1.6 },
    scene,
  );
  table.position = new Vector3(origin.x, 0.85, origin.z + 0.5);
  table.material = mat("mrTableMat", "#bca78a");
  const tableBase = MeshBuilder.CreateBox(
    "mrTableBase",
    { width: 4.0, height: 0.85, depth: 0.5 },
    scene,
  );
  tableBase.position = new Vector3(origin.x, 0.43, origin.z + 0.5);
  tableBase.material = mat("mrTableBaseMat", "#7d4f33");

  // Chairs around the table
  for (const cz of [-0.4, 1.4]) {
    for (const cx of [-1.5, 0, 1.5]) {
      const seat = MeshBuilder.CreateBox(
        `mrChair_${cx}_${cz}`,
        { width: 0.55, height: 0.1, depth: 0.55 },
        scene,
      );
      seat.position = new Vector3(origin.x + cx, 0.55, origin.z + cz);
      seat.material = mat("mrChairMat", "#1c2230");
      const back = MeshBuilder.CreateBox(
        `mrChairBack_${cx}_${cz}`,
        { width: 0.55, height: 0.65, depth: 0.1 },
        scene,
      );
      back.position = new Vector3(
        origin.x + cx,
        0.93,
        origin.z + cz + (cz > 0 ? 0.25 : -0.25),
      );
      back.material = mat("mrChairBackMat", "#1c2230");
    }
  }

  // Wall-mounted display on back wall
  const tv = MeshBuilder.CreateBox(
    "mrTV",
    { width: 3.0, height: 1.6, depth: 0.08 },
    scene,
  );
  tv.position = new Vector3(origin.x, 1.8, origin.z + 2.45);
  drawSignTexture(scene, tv, 512, 280, (ctx) => {
    ctx.fillStyle = "#1a1f2c";
    ctx.fillRect(0, 0, 512, 280);
    // Bar chart
    const bars = [70, 120, 90, 160, 110, 200];
    const barW = 50;
    for (let i = 0; i < bars.length; i++) {
      ctx.fillStyle = "#6ec1ff";
      ctx.fillRect(40 + i * (barW + 16), 240 - bars[i], barW, bars[i]);
    }
    ctx.strokeStyle = "#cfd8ee";
    ctx.beginPath();
    ctx.moveTo(20, 250);
    ctx.lineTo(500, 250);
    ctx.stroke();
  });
}

/**
 * Customer-facing welcome counter: a coloured base + light top with a small
 * raised badge sign. Used to populate the lobby with multiple service points.
 */
function buildLobbyCounter(
  scene: Scene,
  mat: MaterialFactory,
  signText: string,
  cx: number,
  cz: number,
  accentHex: string,
): void {
  const tag = signText.replace(/\s+/g, "_").toLowerCase();
  // Base
  const base = MeshBuilder.CreateBox(
    `lc_base_${tag}`,
    { width: 3.0, height: 1.05, depth: 1.1 },
    scene,
  );
  base.position = new Vector3(cx, 0.525, cz);
  base.material = mat(`lc_baseMat_${tag}`, accentHex);

  // Top counter surface (slightly oversize for an overhang)
  const top = MeshBuilder.CreateBox(
    `lc_top_${tag}`,
    { width: 3.2, height: 0.12, depth: 1.3 },
    scene,
  );
  top.position = new Vector3(cx, 1.11, cz);
  top.material = mat(`lc_topMat_${tag}`, "#f4ecdb");

  // Front kick-plate accent stripe
  const stripe = MeshBuilder.CreateBox(
    `lc_stripe_${tag}`,
    { width: 3.0, height: 0.08, depth: 0.05 },
    scene,
  );
  stripe.position = new Vector3(cx, 0.18, cz - 0.55);
  stripe.material = mat(`lc_stripeMat_${tag}`, "#ffffff");

  // Standing badge sign on the counter top
  const sign = MeshBuilder.CreateBox(
    `lc_sign_${tag}`,
    { width: 1.6, height: 0.55, depth: 0.06 },
    scene,
  );
  sign.position = new Vector3(cx, 1.45, cz + 0.4);
  drawSignTexture(scene, sign, 512, 180, (ctx) => {
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 512, 180);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(signText, 256, 95);
  });

  // A small monitor and a clipboard tray on the counter
  buildMonitor(scene, mat, new Vector3(cx - 0.7, 1.17, cz - 0.1), 0);
  const tray = MeshBuilder.CreateBox(
    `lc_tray_${tag}`,
    { width: 0.55, height: 0.06, depth: 0.4 },
    scene,
  );
  tray.position = new Vector3(cx + 0.7, 1.2, cz - 0.1);
  tray.material = mat(`lc_trayMat_${tag}`, "#2a3a5c");

  // Stool on the staff side (behind the counter)
  const stool = MeshBuilder.CreateBox(
    `lc_stool_${tag}`,
    { width: 0.5, height: 0.1, depth: 0.5 },
    scene,
  );
  stool.position = new Vector3(cx, 0.7, cz + 0.95);
  stool.material = mat(`lc_stoolMat_${tag}`, "#1c2230");
}

/**
 * Kitchen / break-room: counter run with sink + stove markings, fridge,
 * microwave, and a small dining set with stools. Sits on the back-right
 * accent floor.
 */
function buildKitchen(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  const cabMat = mat("kitCab", "#3a5fb0");
  const counterMat = mat("kitCounter", "#e8e1cf");

  // Long counter run along the back of the kitchen zone
  const counterBase = MeshBuilder.CreateBox(
    "kitCounterBase",
    { width: 7.5, height: 0.95, depth: 1.0 },
    scene,
  );
  counterBase.position = new Vector3(origin.x, 0.475, origin.z + 2.5);
  counterBase.material = cabMat;
  const counterTop = MeshBuilder.CreateBox(
    "kitCounterTop",
    { width: 7.7, height: 0.12, depth: 1.15 },
    scene,
  );
  counterTop.position = new Vector3(origin.x, 1.01, origin.z + 2.5);
  counterTop.material = counterMat;

  // Sink basin (dark inset on the counter top)
  const sink = MeshBuilder.CreateBox(
    "kitSink",
    { width: 1.1, height: 0.05, depth: 0.7 },
    scene,
  );
  sink.position = new Vector3(origin.x - 1.8, 1.085, origin.z + 2.5);
  sink.material = mat("kitSinkMat", "#7a8aa6");
  // Faucet
  const faucet = MeshBuilder.CreateBox(
    "kitFaucet",
    { width: 0.08, height: 0.35, depth: 0.08 },
    scene,
  );
  faucet.position = new Vector3(origin.x - 1.8, 1.28, origin.z + 2.85);
  faucet.material = mat("kitFaucetMat", "#cdd5e0");

  // Stove (4 burners as small dark squares)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const burner = MeshBuilder.CreateBox(
        `kitBurner_${r}_${c}`,
        { width: 0.32, height: 0.04, depth: 0.32 },
        scene,
      );
      burner.position = new Vector3(
        origin.x + 0.7 + c * 0.45,
        1.085,
        origin.z + 2.3 + r * 0.45,
      );
      burner.material = mat("kitBurnerMat", "#1c2230");
    }
  }

  // Microwave on top of the counter
  const micro = MeshBuilder.CreateBox(
    "kitMicro",
    { width: 1.2, height: 0.6, depth: 0.7 },
    scene,
  );
  micro.position = new Vector3(origin.x + 2.8, 1.4, origin.z + 2.55);
  micro.material = mat("kitMicroMat", "#22252e");
  const microDoor = MeshBuilder.CreateBox(
    "kitMicroDoor",
    { width: 0.85, height: 0.45, depth: 0.05 },
    scene,
  );
  microDoor.position = new Vector3(origin.x + 2.7, 1.4, origin.z + 2.18);
  microDoor.material = mat("kitMicroDoorMat", "#6ec1ff");

  // Fridge (tall, on the right end of the run)
  const fridge = MeshBuilder.CreateBox(
    "kitFridge",
    { width: 1.4, height: 2.4, depth: 1.0 },
    scene,
  );
  fridge.position = new Vector3(origin.x + 4.4, 1.2, origin.z + 2.5);
  fridge.material = mat("kitFridgeMat", "#e1e6ec");
  const fridgeSeam = MeshBuilder.CreateBox(
    "kitFridgeSeam",
    { width: 1.42, height: 0.04, depth: 1.02 },
    scene,
  );
  fridgeSeam.position = new Vector3(origin.x + 4.4, 1.6, origin.z + 2.5);
  fridgeSeam.material = mat("kitFridgeSeamMat", "#a8b0bd");
  const fridgeHandle = MeshBuilder.CreateBox(
    "kitFridgeHandle",
    { width: 0.06, height: 1.6, depth: 0.06 },
    scene,
  );
  fridgeHandle.position = new Vector3(origin.x + 3.8, 1.4, origin.z + 1.95);
  fridgeHandle.material = mat("kitFridgeHandleMat", "#7a8aa6");

  // Wall sign
  const sign = MeshBuilder.CreateBox(
    "kitSign",
    { width: 2.6, height: 0.55, depth: 0.06 },
    scene,
  );
  sign.position = new Vector3(origin.x - 2.2, 2.4, origin.z + 3.05);
  drawSignTexture(scene, sign, 512, 110, (ctx) => {
    ctx.fillStyle = "#2e8a6e";
    ctx.fillRect(0, 0, 512, 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BREAK ROOM", 256, 60);
  });

  // Dining bar (high counter) with stools — front of the kitchen zone
  const barTop = MeshBuilder.CreateBox(
    "kitBarTop",
    { width: 4.4, height: 0.12, depth: 0.9 },
    scene,
  );
  barTop.position = new Vector3(origin.x - 1.4, 1.01, origin.z - 1.5);
  barTop.material = mat("kitBarTopMat", "#a06a4c");
  const barBase = MeshBuilder.CreateBox(
    "kitBarBase",
    { width: 4.0, height: 0.9, depth: 0.4 },
    scene,
  );
  barBase.position = new Vector3(origin.x - 1.4, 0.45, origin.z - 1.55);
  barBase.material = mat("kitBarBaseMat", "#7d4f33");
  for (const sx of [-2.6, -1.4, -0.2]) {
    const stoolTop = MeshBuilder.CreateBox(
      `kitStool_${sx}`,
      { width: 0.45, height: 0.1, depth: 0.45 },
      scene,
    );
    stoolTop.position = new Vector3(origin.x + sx, 0.85, origin.z - 2.2);
    stoolTop.material = mat("kitStoolTopMat", "#1c2230");
    const stoolStem = MeshBuilder.CreateBox(
      `kitStoolStem_${sx}`,
      { width: 0.1, height: 0.8, depth: 0.1 },
      scene,
    );
    stoolStem.position = new Vector3(origin.x + sx, 0.4, origin.z - 2.2);
    stoolStem.material = mat("kitStoolStemMat", "#7a8aa6");
  }

  // A coffee machine on the bar
  const coffee = MeshBuilder.CreateBox(
    "kitCoffee",
    { width: 0.5, height: 0.55, depth: 0.45 },
    scene,
  );
  coffee.position = new Vector3(origin.x + 1.6, 1.34, origin.z - 1.5);
  coffee.material = mat("kitCoffeeMat", "#1a1f2c");
  const coffeeTop = MeshBuilder.CreateBox(
    "kitCoffeeTop",
    { width: 0.45, height: 0.1, depth: 0.4 },
    scene,
  );
  coffeeTop.position = new Vector3(origin.x + 1.6, 1.66, origin.z - 1.5);
  coffeeTop.material = mat("kitCoffeeTopMat", "#6ec1ff");
}

/**
 * Café / coffee corner: two small bistro tables with stools and a tall plant,
 * tucked along the right-side accent floor.
 */
function buildCafe(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  const tableTopMat = mat("cafeTableTop", "#a06a4c");
  const tableLegMat = mat("cafeTableLeg", "#7d4f33");
  const stoolMat = mat("cafeStool", "#3a5fb0");

  for (const tz of [-1.6, 1.6]) {
    const top = MeshBuilder.CreateBox(
      `cafeTop_${tz}`,
      { width: 1.3, height: 0.1, depth: 1.3 },
      scene,
    );
    top.position = new Vector3(origin.x, 0.95, origin.z + tz);
    top.material = tableTopMat;
    const leg = MeshBuilder.CreateBox(
      `cafeLeg_${tz}`,
      { width: 0.18, height: 0.85, depth: 0.18 },
      scene,
    );
    leg.position = new Vector3(origin.x, 0.475, origin.z + tz);
    leg.material = tableLegMat;
    const base = MeshBuilder.CreateBox(
      `cafeBase_${tz}`,
      { width: 0.6, height: 0.05, depth: 0.6 },
      scene,
    );
    base.position = new Vector3(origin.x, 0.07, origin.z + tz);
    base.material = tableLegMat;
    // Two stools per table
    for (const sx of [-0.95, 0.95]) {
      const stoolTop = MeshBuilder.CreateBox(
        `cafeStoolTop_${tz}_${sx}`,
        { width: 0.45, height: 0.1, depth: 0.45 },
        scene,
      );
      stoolTop.position = new Vector3(origin.x + sx, 0.6, origin.z + tz);
      stoolTop.material = stoolMat;
      const stoolStem = MeshBuilder.CreateBox(
        `cafeStoolStem_${tz}_${sx}`,
        { width: 0.1, height: 0.55, depth: 0.1 },
        scene,
      );
      stoolStem.position = new Vector3(origin.x + sx, 0.28, origin.z + tz);
      stoolStem.material = mat("cafeStoolStemMat", "#7a8aa6");
    }
    // Coffee cup decoration
    const cup = MeshBuilder.CreateBox(
      `cafeCup_${tz}`,
      { width: 0.18, height: 0.18, depth: 0.18 },
      scene,
    );
    cup.position = new Vector3(origin.x + 0.2, 1.09, origin.z + tz);
    cup.material = mat("cafeCupMat", "#ffffff");
  }

  // Café sign on the right wall
  const sign = MeshBuilder.CreateBox(
    "cafeSign",
    { width: 0.08, height: 0.6, depth: 2.4 },
    scene,
  );
  sign.position = new Vector3(origin.x + 2.4, 2.5, origin.z);
  drawSignTexture(scene, sign, 384, 96, (ctx) => {
    ctx.fillStyle = "#a06a4c";
    ctx.fillRect(0, 0, 384, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CAFÉ", 192, 50);
  });

  // Tall corner plant
  buildPlant(scene, mat, new Vector3(origin.x + 1.8, 0, origin.z - 2.5));
}

/**
 * Collaboration / huddle zone: two facing sofas, a low table, and a
 * whiteboard, on the left-side accent floor. Encourages quick stand-ups
 * between cubicle rows.
 */
function buildCollabZone(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  const sofaMat = mat("collabSofa", "#6ec1ff");
  const tableTop = mat("collabTableTop", "#bca78a");
  const tableLeg = mat("collabTableLeg", "#7d4f33");

  // Two facing sofas
  const sofaA = MeshBuilder.CreateBox(
    "collabSofaA",
    { width: 1.6, height: 0.55, depth: 0.9 },
    scene,
  );
  sofaA.position = new Vector3(origin.x, 0.4, origin.z - 1.3);
  sofaA.material = sofaMat;
  const sofaABack = MeshBuilder.CreateBox(
    "collabSofaABack",
    { width: 1.6, height: 0.7, depth: 0.2 },
    scene,
  );
  sofaABack.position = new Vector3(origin.x, 0.85, origin.z - 1.7);
  sofaABack.material = sofaMat;

  const sofaB = MeshBuilder.CreateBox(
    "collabSofaB",
    { width: 1.6, height: 0.55, depth: 0.9 },
    scene,
  );
  sofaB.position = new Vector3(origin.x, 0.4, origin.z + 1.3);
  sofaB.material = sofaMat;
  const sofaBBack = MeshBuilder.CreateBox(
    "collabSofaBBack",
    { width: 1.6, height: 0.7, depth: 0.2 },
    scene,
  );
  sofaBBack.position = new Vector3(origin.x, 0.85, origin.z + 1.7);
  sofaBBack.material = sofaMat;

  // Low table between them
  const table = MeshBuilder.CreateBox(
    "collabTable",
    { width: 1.2, height: 0.1, depth: 0.7 },
    scene,
  );
  table.position = new Vector3(origin.x, 0.45, origin.z);
  table.material = tableTop;
  const tableBase = MeshBuilder.CreateBox(
    "collabTableBase",
    { width: 1.0, height: 0.4, depth: 0.55 },
    scene,
  );
  tableBase.position = new Vector3(origin.x, 0.2, origin.z);
  tableBase.material = tableLeg;

  // Whiteboard mounted on the left wall
  const wbFrame = MeshBuilder.CreateBox(
    "collabWBFrame",
    { width: 0.08, height: 1.7, depth: 2.6 },
    scene,
  );
  wbFrame.position = new Vector3(origin.x - 2.4, 1.6, origin.z);
  wbFrame.material = mat("collabWBFrameMat", "#2a3a5c");
  const wb = MeshBuilder.CreateBox(
    "collabWB",
    { width: 0.04, height: 1.5, depth: 2.4 },
    scene,
  );
  wb.position = new Vector3(origin.x - 2.36, 1.6, origin.z);
  wb.material = mat("collabWBMat", "#f4ecdb");

  // Title sign above the whiteboard
  const sign = MeshBuilder.CreateBox(
    "collabSign",
    { width: 0.08, height: 0.5, depth: 2.4 },
    scene,
  );
  sign.position = new Vector3(origin.x - 2.4, 2.7, origin.z);
  drawSignTexture(scene, sign, 384, 80, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 384, 80);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HUDDLE ZONE", 192, 42);
  });
}

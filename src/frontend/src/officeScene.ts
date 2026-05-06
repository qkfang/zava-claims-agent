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
import { NeighbourhoodAmbient } from "./neighbourhoodAmbient";
import { VoxelCharacter } from "./voxelCharacter";

/**
 * Anchor points used by the simulation. Coordinates are in scene units.
 *
 * Layout (bird's-eye, X right / Z forward) — doubled full-floor footprint
 * (60 × 40 units, x∈[-30, 30], z∈[-15, 25]):
 *
 *   z = +25 ┌────────────────────────────────────────────────────────────────┐
 *           │ IT / Cloud Infra Room │   MEETING ROOMS (A + B)  │ Kitchen     │
 *           ├───────────────────────┴──────────────────────────┴─────────────┤
 *           │ Team Leader   │ Assessor │ Loss Adj. │ Fraud Inv │ Coffee Area │  back row
 *           │ (exec office) │  Dept    │   Dept    │   Dept    │ (Café)      │
 *           ├───────────────┼──────────┼───────────┼───────────┼─────────────┤
 *           │ Intake Dept   │ Supplier │ Settlement│ Cust Comm │ Play Area   │  front row
 *           │               │  Coord   │  Officer  │  Dept     │ (ping-pong) │
 *           ├───────────────┴──────────┴───────────┴───────────┴─────────────┤
 *           │  Welcome counters  +  Reception  +  Customer Waiting Area      │
 *   z = -15 └────────────────────────────────────────────────────────────────┘
 *           x = -30                                                     x = +30
 *
 * Each numbered department is its own zone, separated from neighbours by
 * tall office-screen partitions and a coloured floor accent. Cubicle
 * centres are spaced 10 units apart (front row at x = -21, -11, -1, +9 ;
 * back row at x = -11, -1, +9 with the Team Leader executive office at
 * x = -21, z = 10) so each booth has clear breathing room. The dedicated
 * Meeting Rooms section sits centre-back at z ≈ 19.5 between the back-row
 * cubicles and the filing cabinets.
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
  // Doubled full-floor footprint: the office spans x∈[-30, 30], z∈[-15, 25]
  // (60 × 40 units). The exterior ground is a grass-land that extends well
  // beyond the office so the diorama edges don't cut off when the camera
  // pans, and is decorated with trees, flowers, a fountain, and benches by
  // `buildExteriorLandscape` further down.
  const ground = MeshBuilder.CreateBox(
    "ground",
    { width: 110, depth: 110, height: 0.4 },
    scene,
  );
  ground.position.y = -0.2;
  ground.material = mat("ground", "#6aa84f");

  // Decorate the grass land surrounding the office with trees, flower
  // patches, a fountain, benches, lampposts and a stone path leading to
  // the entrance.
  buildExteriorLandscape(scene, mat);

  // Spawn moving voxel cars that loop through the new outdoor car park
  // on the right-hand side of the office. Self-contained: the ambient
  // instance ticks itself off the scene's render observable.
  buildOfficeAmbient(scene);

  // Main office floor — light tile
  const floor = MeshBuilder.CreateBox(
    "floor",
    { width: 60, depth: 40, height: 0.2 },
    scene,
  );
  floor.position = new Vector3(0, 0.0, 5);
  floor.material = mat("floor", "#cfc6b4");

  // Tile grid lines (subtle stripes baked in via thin overlay boxes)
  const tileLine = mat("tileLine", "#a89e8a");
  for (let i = -29; i <= 29; i += 2) {
    const lineX = MeshBuilder.CreateBox(
      `tileX_${i}`,
      { width: 0.04, height: 0.01, depth: 40 },
      scene,
    );
    lineX.position = new Vector3(i, 0.11, 5);
    lineX.material = tileLine;
  }
  for (let i = -14; i <= 24; i += 2) {
    const lineZ = MeshBuilder.CreateBox(
      `tileZ_${i}`,
      { width: 60, height: 0.01, depth: 0.04 },
      scene,
    );
    lineZ.position = new Vector3(0, 0.11, i);
    lineZ.material = tileLine;
  }

  // Lobby wood floor — wider "claims lobby" with welcome counters and
  // customer waiting area
  const lobbyFloor = MeshBuilder.CreateBox(
    "lobbyFloor",
    { width: 38, height: 0.06, depth: 8.5 },
    scene,
  );
  lobbyFloor.position = new Vector3(-5, 0.13, -10);
  lobbyFloor.material = mat("lobbyFloor", "#c79e6e");

  // Decorative break-room wood floor (back-right) so the kitchen feels distinct
  const kitchenFloor = MeshBuilder.CreateBox(
    "kitchenFloor",
    { width: 10, height: 0.06, depth: 8.0 },
    scene,
  );
  kitchenFloor.position = new Vector3(24, 0.13, 20);
  kitchenFloor.material = mat("kitchenFloor", "#d8b884");

  // Café / coffee-area accent floor (back-right column)
  const cafeFloor = MeshBuilder.CreateBox(
    "cafeFloor",
    { width: 8, height: 0.06, depth: 6.5 },
    scene,
  );
  cafeFloor.position = new Vector3(26, 0.13, 9);
  cafeFloor.material = mat("cafeFloor", "#b88a64");

  // Play area accent floor (front-right column)
  const playFloor = MeshBuilder.CreateBox(
    "playFloor",
    { width: 10, height: 0.06, depth: 6.0 },
    scene,
  );
  playFloor.position = new Vector3(24, 0.13, 0);
  playFloor.material = mat("playFloor", "#2e5a4a");

  // IT / cloud-infra room accent floor (back-far-left)
  const itFloor = MeshBuilder.CreateBox(
    "itFloor",
    { width: 10, height: 0.06, depth: 8.0 },
    scene,
  );
  itFloor.position = new Vector3(-24, 0.13, 20);
  itFloor.material = mat("itFloor", "#1f2a3f");

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

  // Outer walls — back, left, right (sized to the doubled floor footprint)
  makeWall("backWall", 60, 4.6, 0.3, new Vector3(0, 2.3, 25.0));
  makeWall("leftWall", 0.3, 4.6, 40, new Vector3(-30.0, 2.3, 5));
  makeWall("rightWall", 0.3, 4.6, 40, new Vector3(30.0, 2.3, 5));
  // Front low walls flanking the entrance gap (so we can see inside)
  makeWall("frontLeft", 28, 1.4, 0.3, new Vector3(-16.0, 0.7, -15));
  makeWall("frontRight", 28, 1.4, 0.3, new Vector3(16.0, 0.7, -15));

  // Bottom trim along outer walls
  const trimBack = MeshBuilder.CreateBox(
    "trimBack",
    { width: 60, height: 0.3, depth: 0.4 },
    scene,
  );
  trimBack.position = new Vector3(0, 0.25, 24.85);
  trimBack.material = trimMat;

  // ----- "CLAIMS DEPARTMENT" identity wall (back-mid, between team leader
  // office and the filing cabinets) -----
  const identityPanel = MeshBuilder.CreateBox(
    "identityPanel",
    { width: 8.0, height: 3.2, depth: 0.12 },
    scene,
  );
  identityPanel.position = new Vector3(-13, 2.3, 24.78);
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
  processPanel.position = new Vector3(29.78, 2.4, 14);
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
  welcomeSign.position = new Vector3(-17.5, 0.55, -8.4);
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
  helpSign.position = new Vector3(7.5, 1.0, -14.85);
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
  for (let i = 0; i < 6; i++) {
    const x = 4 + i * 4.2;
    const frame = MeshBuilder.CreateBox(
      `winFrame_${i}`,
      { width: 3.2, height: 2.6, depth: 0.1 },
      scene,
    );
    frame.position = new Vector3(x, 2.7, 24.84);
    frame.material = windowFrame;
    const glass = MeshBuilder.CreateBox(
      `winGlass_${i}`,
      { width: 2.8, height: 2.2, depth: 0.05 },
      scene,
    );
    glass.position = new Vector3(x, 2.7, 24.79);
    glass.material = windowMat;
  }

  // ----- Front entrance (double doors) -----
  // Doors slide horizontally apart when a character (staff or customer)
  // walks within proximity of the entrance, and slide closed again
  // when no-one is nearby. The base x positions below are the closed
  // pose; openOffset is added/subtracted to slide them into the
  // adjacent wall.
  const doorFrame = mat("doorFrame", "#7a8aa6");
  // The entrance gap between the front-left/right walls spans x = -2..+2
  // (4 units wide). Each door is sized to cover half of that gap so the
  // closed doorway has no visible side gaps.
  const leftDoor = MeshBuilder.CreateBox(
    "leftDoor",
    { width: 2.0, height: 2.4, depth: 0.15 },
    scene,
  );
  leftDoor.position = new Vector3(-1.0, 1.2, -15);
  leftDoor.material = doorFrame;
  const rightDoor = leftDoor.clone("rightDoor");
  rightDoor.position.x = 1.0;
  const doorGlassPanes: Mesh[] = [];
  for (const d of [leftDoor, rightDoor]) {
    const glass = MeshBuilder.CreateBox(
      `${d.name}_glass`,
      { width: 1.6, height: 1.6, depth: 0.05 },
      scene,
    );
    glass.material = windowMat;
    // Parent the glass to the door so it slides with the frame, and
    // express its offset in the door's local space (door origin is at
    // y=1.2, z=-15, so y=0.2 places the pane vertically and z=0.07
    // pushes it just outside the front face).
    glass.parent = d;
    glass.position = new Vector3(0, 0.2, 0.07);
    doorGlassPanes.push(glass);
  }

  // Auto-open behaviour: scan voxel character roots once per frame
  // and ease the doors toward open/closed based on the closest
  // character's distance to the entrance. Voxel characters are added
  // to the scene as TransformNodes named "char_*" by VoxelCharacter,
  // so we can detect them generically without coupling to the
  // simulation layer.
  const leftDoorClosedX = -1.0;
  const rightDoorClosedX = 1.0;
  const doorOpenOffset = 1.8; // slide each door ~1.8 units behind the adjacent wall
  const triggerRadius = 3.2; // metres around the entrance
  const doorwayPosition = new Vector3(0, 0, -15);
  let doorOpenAmount = 0; // 0 = closed, 1 = fully open
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    let nearest = Number.POSITIVE_INFINITY;
    for (const node of scene.transformNodes) {
      if (!node.name.startsWith("char_")) continue;
      const p = node.position;
      const dx = p.x - doorwayPosition.x;
      const dz = p.z - doorwayPosition.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearest) nearest = d;
    }
    const target = nearest <= triggerRadius ? 1 : 0;
    // Ease toward target at ~4/sec so the slide feels mechanical
    // rather than instant.
    const rate = 4.0;
    doorOpenAmount += (target - doorOpenAmount) * Math.min(1, dt * rate);
    leftDoor.position.x = leftDoorClosedX - doorOpenOffset * doorOpenAmount;
    rightDoor.position.x = rightDoorClosedX + doorOpenOffset * doorOpenAmount;
  });
  // Welcome mat
  const mat1 = MeshBuilder.CreateBox(
    "welcomeMat",
    { width: 2.4, height: 0.04, depth: 1.2 },
    scene,
  );
  mat1.position = new Vector3(0, 0.13, -13.6);
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
  recBase.position = new Vector3(-15.2, 0.5, -10.4);
  recBase.material = recDeskMat;
  const recTop = MeshBuilder.CreateBox(
    "recDeskTop",
    { width: 4.7, height: 0.15, depth: 1.6 },
    scene,
  );
  recTop.position = new Vector3(-15.2, 1.07, -10.4);
  recTop.material = recDeskTop;
  // Inbox tray on reception desk
  const tray = MeshBuilder.CreateBox(
    "inboxTray",
    { width: 0.8, height: 0.1, depth: 0.5 },
    scene,
  );
  tray.position = new Vector3(-14.0, 1.18, -10.4);
  tray.material = mat("tray", "#3a3a44");
  const trayLabel = MeshBuilder.CreateBox(
    "inboxLabel",
    { width: 0.4, height: 0.02, depth: 0.2 },
    scene,
  );
  trayLabel.position = new Vector3(-14.0, 1.24, -10.25);
  trayLabel.material = mat("trayLabel", "#ffb347");
  // Reception monitor
  buildMonitor(scene, mat, new Vector3(-16.0, 1.07, -10.7), 0);

  // Coffee table + sofas in lobby (Customer Waiting Area)
  const sofaMat = mat("sofa", "#3a5fb0");
  const sofa1Seat = MeshBuilder.CreateBox(
    "sofa1Seat",
    { width: 1.2, height: 0.5, depth: 1.2 },
    scene,
  );
  sofa1Seat.position = new Vector3(-17, 0.4, -12);
  sofa1Seat.material = sofaMat;
  const sofa2Seat = sofa1Seat.clone("sofa2Seat");
  sofa2Seat.position = new Vector3(-14.0, 0.4, -12);
  const cTableTop = MeshBuilder.CreateBox(
    "cTableTop",
    { width: 1.6, height: 0.1, depth: 0.8 },
    scene,
  );
  cTableTop.position = new Vector3(-15.5, 0.45, -12.0);
  cTableTop.material = mat("cTable", "#a06a4c");
  const cTableLeg = MeshBuilder.CreateBox(
    "cTableLeg",
    { width: 1.4, height: 0.4, depth: 0.6 },
    scene,
  );
  cTableLeg.position = new Vector3(-15.5, 0.2, -12.0);
  cTableLeg.material = mat("cTableLeg", "#7d4f33");

  // Additional waiting-area sofas across the front of the lobby
  const sofa3Seat = sofa1Seat.clone("sofa3Seat");
  sofa3Seat.position = new Vector3(2, 0.4, -12);
  const sofa4Seat = sofa1Seat.clone("sofa4Seat");
  sofa4Seat.position = new Vector3(5, 0.4, -12);
  const cTable2Top = MeshBuilder.CreateBox(
    "cTable2Top",
    { width: 1.6, height: 0.1, depth: 0.8 },
    scene,
  );
  cTable2Top.position = new Vector3(3.5, 0.45, -12.0);
  cTable2Top.material = mat("cTable", "#a06a4c");
  const cTable2Leg = MeshBuilder.CreateBox(
    "cTable2Leg",
    { width: 1.4, height: 0.4, depth: 0.6 },
    scene,
  );
  cTable2Leg.position = new Vector3(3.5, 0.2, -12.0);
  cTable2Leg.material = mat("cTableLeg", "#7d4f33");

  // "CUSTOMER WAITING AREA" sign on the front-low wall (right side)
  const waitingSign = MeshBuilder.CreateBox(
    "waitingSign",
    { width: 4.2, height: 0.9, depth: 0.08 },
    scene,
  );
  waitingSign.position = new Vector3(11, 1.1, -14.85);
  drawSignTexture(scene, waitingSign, 640, 140, (ctx) => {
    ctx.fillStyle = "#3a5fb0";
    ctx.fillRect(0, 0, 640, 140);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CUSTOMER WAITING", 320, 56);
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("AREA", 320, 108);
  });

  // Lobby plants
  buildPlant(scene, mat, new Vector3(-18.5, 0, -11.5));
  buildPlant(scene, mat, new Vector3(-12.5, 0, -12.5));
  buildPlant(scene, mat, new Vector3(0.5, 0, -12.5));
  buildPlant(scene, mat, new Vector3(7.5, 0, -12.5));

  // Lobby decor — cushions on sofas, magazines on coffee table, a floor
  // lamp by the corner, a framed photo and a wall clock above reception.
  buildCushion(scene, mat, "lobbyCushion1", new Vector3(-17.3, 0.7, -12.2), "#ffb347");
  buildCushion(scene, mat, "lobbyCushion2", new Vector3(-16.7, 0.7, -11.8), "#e8504c");
  buildCushion(scene, mat, "lobbyCushion3", new Vector3(-14.3, 0.7, -12.2), "#2e8a6e");
  buildCushion(scene, mat, "lobbyCushion4", new Vector3(-13.7, 0.7, -11.8), "#b56fbf");
  buildCushion(scene, mat, "lobbyCushion5", new Vector3(1.7, 0.7, -12.2), "#6ec1ff");
  buildCushion(scene, mat, "lobbyCushion6", new Vector3(2.3, 0.7, -11.8), "#ffb347");
  buildCushion(scene, mat, "lobbyCushion7", new Vector3(4.7, 0.7, -12.2), "#e8504c");
  buildCushion(scene, mat, "lobbyCushion8", new Vector3(5.3, 0.7, -11.8), "#3a5fb0");
  buildMagazines(scene, mat, "lobbyMags", new Vector3(-15.5, 0.51, -12.0));
  buildMagazines(scene, mat, "lobbyMags2", new Vector3(3.5, 0.51, -12.0));
  buildFloorLamp(scene, mat, "lobbyFloorLamp", new Vector3(-19.0, 0, -12.6), "#ffb347");
  buildFloorLamp(scene, mat, "lobbyFloorLamp2", new Vector3(8.5, 0, -12.6), "#6ec1ff");

  // ----- Department grid -----
  // 8 dedicated departments arranged across the doubled floor. Each role
  // gets its own coloured zone, separated from neighbours by tall office
  // screen partitions and a labelled overhead sign.
  //
  // Front row (z = 0): Intake | Supplier Coord | Settlement | Cust Comms
  // Back  row (z = 10): Team Leader | Assessor | Loss Adjuster | Fraud Inv
  // Right side: Play Area | Coffee Area | Kitchen | IT/Cloud Room
  // Front (z < -7): Reception desk + Customer Waiting Area + Welcome counters

  // ----- Department cubicles (front and back rows) -----
  type CubicleSpec = {
    label: string;
    accent: string;
    cx: number;
    cz: number;
    sign: string;
  };
  // Cubicle centres are spaced 10 units apart (was 8) so each booth has
  // visible breathing room between its accent floor and its neighbour's
  // partition wall — keeps the diorama feeling spacious rather than
  // cramped now that we have a dedicated meeting-rooms section.
  const cubicles: CubicleSpec[] = [
    // Sign text is the key role only (no "Officer" / "Coordinator" /
    // "Investigator" suffixes) so the label stays large and legible on
    // the desk sign even from the orbit camera.
    // Front row (z = 0)
    { label: "intake",         accent: "#3a5fb0", cx: -21, cz: 0, sign: "INTAKE" },
    { label: "supplier",       accent: "#2e8a6e", cx: -11, cz: 0, sign: "SUPPLIER" },
    { label: "settlement",     accent: "#a06a4c", cx:  -1, cz: 0, sign: "SETTLEMENT" },
    { label: "communications", accent: "#b56fbf", cx:   9, cz: 0, sign: "COMMS" },
    // Back row (z = 10) — Team Leader gets the executive corner office
    { label: "assessor",     accent: "#6ec1ff", cx: -11, cz: 10, sign: "ASSESSOR" },
    { label: "lossAdjuster", accent: "#ffb347", cx:  -1, cz: 10, sign: "LOSS ADJUSTER" },
    { label: "fraud",        accent: "#e8504c", cx:   9, cz: 10, sign: "FRAUD" },
  ];
  for (const c of cubicles) {
    buildDepartmentZone(scene, mat, c.label, c.cx, c.cz, c.sign, c.accent);
  }

  // ----- Team Leader executive office (back-far-left) -----
  buildTeamLeaderOffice(scene, mat, new Vector3(-21, 0, 10));

  // ----- Meeting Rooms section (back, mid) -----
  // Two glass-walled meeting rooms sit side-by-side along the back of the
  // office, between the back-row cubicles and the filing cabinets. The
  // section is unified by a shared accent floor strip and an overhead
  // "MEETING ROOMS" banner mounted on the back wall.
  buildMeetingRoomSection(scene, mat, new Vector3(2.5, 0, 19.5));

  // ----- Filing cabinets / archive shelves (along the back wall) -----
  for (let col = 0; col < 6; col++) {
    const x = -4.0 + col * 1.4;
    const cab = MeshBuilder.CreateBox(
      `cabinet_${col}`,
      { width: 1.2, height: 1.6, depth: 0.7 },
      scene,
    );
    cab.position = new Vector3(x, 0.8, 23.7);
    cab.material = mat("cabinet", "#3b4d72");
    for (let s = 0; s < 3; s++) {
      const drawer = MeshBuilder.CreateBox(
        `drawer_${col}_${s}`,
        { width: 1.0, height: 0.4, depth: 0.05 },
        scene,
      );
      drawer.position = new Vector3(x, 0.4 + s * 0.5, 23.34);
      drawer.material = mat("drawerFront", "#26334d");
    }
  }
  // Plants on top of cabinets
  for (let col = 0; col < 6; col += 2) {
    buildPlant(scene, mat, new Vector3(-4.0 + col * 1.4, 1.6, 23.7));
  }

  // ----- Water cooler near the identity wall -----
  const cooler = MeshBuilder.CreateBox(
    "cooler",
    { width: 0.6, height: 1.4, depth: 0.6 },
    scene,
  );
  cooler.position = new Vector3(-2.5, 0.7, 23);
  cooler.material = mat("cooler", "#bcd7ee");
  const coolerTop = MeshBuilder.CreateBox(
    "coolerTop",
    { width: 0.5, height: 0.5, depth: 0.5 },
    scene,
  );
  coolerTop.position = new Vector3(-2.5, 1.65, 23);
  coolerTop.material = mat("coolerTop", "#7fb6e3");

  // Printer station tucked alongside the right-hand walkway, between the
  // Fraud Investigation booth and the cafe zone (out of the cubicles
  // since the booths are now spaced further apart).
  const printer = MeshBuilder.CreateBox(
    "printer",
    { width: 1.0, height: 0.7, depth: 0.7 },
    scene,
  );
  printer.position = new Vector3(15.0, 0.45, 10.0);
  printer.material = mat("printer", "#3a3a44");
  const printerTop = MeshBuilder.CreateBox(
    "printerTop",
    { width: 0.9, height: 0.1, depth: 0.6 },
    scene,
  );
  printerTop.position = new Vector3(15.0, 0.85, 10.0);
  printerTop.material = mat("printerTop", "#22252e");

  // ----- Customer-facing welcome counters in the lobby -----
  buildLobbyCounter(scene, mat, "QUICK INTAKE", -7.5, -9.0, "#3a5fb0");
  buildLobbyCounter(scene, mat, "CLAIMS HELP",  -3.5, -9.0, "#2e8a6e");
  buildLobbyCounter(scene, mat, "POLICY DESK",   0.5, -9.0, "#a06a4c");

  // ----- Right-side zones -----
  // Play area (front-right): ping-pong, arcade, beanbags
  buildPlayArea(scene, mat, new Vector3(24, 0, 0));
  // Coffee area (mid-right): bistro tables and pendant lamps
  buildCafe(scene, mat, new Vector3(26, 0, 9));
  // Kitchen / break room (back-right)
  buildKitchen(scene, mat, new Vector3(24, 0, 20));
  // IT / Cloud Infra Room (back-far-left)
  buildITRoom(scene, mat, new Vector3(-24, 0, 20));

  // Wall decor on the (now larger) back wall — clock and framed art near
  // the identity panel.
  buildWallClock(scene, mat, "recClock", new Vector3(-2.5, 3.6, 24.84));
  buildFramedArt(scene, mat, "recArt1", new Vector3(0.5, 3.0, 24.84), 1.6, 1.2, "#3a5fb0");
  buildFramedArt(scene, mat, "recArt2", new Vector3(2.5, 3.0, 24.84), 1.6, 1.2, "#2e8a6e");

  // Decorative plants in walkways — placed in the gaps between cubicles
  // (now 10 units apart) and along the right-side circulation routes.
  buildPlant(scene, mat, new Vector3(-16.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(-6.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(4.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(-16.0, 0, 5.0));
  buildPlant(scene, mat, new Vector3(-6.0, 0, 5.0));
  buildPlant(scene, mat, new Vector3(4.0, 0, 5.0));
  buildPlant(scene, mat, new Vector3(17.0, 0, 4.5));
  buildPlant(scene, mat, new Vector3(17.0, 0, 14.5));
  buildPlant(scene, mat, new Vector3(-17.0, 0, 4.5));
  buildPlant(scene, mat, new Vector3(-17.0, 0, 22.5));
  buildPlant(scene, mat, new Vector3(28.5, 0, -4));
  buildPlant(scene, mat, new Vector3(-28.5, 0, -4));

  return {
    spawnPoint: new Vector3(0, 0, -18),
    entrancePoint: new Vector3(0, 0, -13.5),
    receptionPoint: new Vector3(-13.5, 0, -9.5),
    exitPoint: new Vector3(0, 0, -18),
    intakeDeskPoint: new Vector3(-21, 0, -0.6),
    assessorDeskPoint: new Vector3(-11, 0, 9.4),
    lossAdjusterDeskPoint: new Vector3(-1, 0, 9.4),
    fraudDeskPoint: new Vector3(9, 0, 9.4),
    supplierDeskPoint: new Vector3(-11, 0, -0.6),
    settlementDeskPoint: new Vector3(-1, 0, -0.6),
    communicationsDeskPoint: new Vector3(9, 0, -0.6),
    teamLeaderDeskPoint: new Vector3(-21, 0, 9.5),
    inboxPoint: new Vector3(-14.0, 1.25, -10.4),
    archivePoint: new Vector3(5.0, 1.4, 1.0),
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
  tex.update();
  const m = new StandardMaterial(`signMat_${mesh.name}`, scene);
  m.diffuseTexture = tex;
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  m.emissiveColor = new Color3(0.18, 0.18, 0.18);
  mesh.material = m;
}

/**
 * Build a single labelled department zone: a coloured floor accent, tall
 * "office screen" partitions on three sides, a labelled overhead sign,
 * and a desk with chair and props inside. Each role's accent colour
 * differentiates their zone from neighbouring departments.
 */
function buildDepartmentZone(
  scene: Scene,
  mat: MaterialFactory,
  label: string,
  cx: number,
  cz: number,
  signText: string,
  accentHex: string,
): void {
  // Floor accent under the department zone
  const accent = MeshBuilder.CreateBox(
    `dept_floor_${label}`,
    { width: 6.6, height: 0.05, depth: 5.4 },
    scene,
  );
  accent.position = new Vector3(cx, 0.13, cz + 0.5);
  accent.material = mat(`dept_floorMat_${label}`, accentHex);

  // Build the desk + screens via the cubicle helper
  buildCubicle(scene, mat, label, cx, cz, signText, accentHex);
}

/** Build a single labelled cubicle: tall office-screen partitions, desk,
 *  monitor, chair, and overhead sign. Used by buildDepartmentZone. */
function buildCubicle(
  scene: Scene,
  mat: MaterialFactory,
  label: string,
  cx: number,
  cz: number,
  signText: string,
  accentHex = "#d8c7a7",
): void {
  const cubicleWallMat = mat(`cub_${label}`, "#d8c7a7");
  const accentMat = mat(`cubAccent_${label}`, accentHex);
  const deskMat = mat(`desk_${label}`, "#bca78a");
  const chairMat = mat(`chair_${label}`, "#1c2230");

  // Tall "office screen" partitions — back, left, right (1.8m tall)
  const back = MeshBuilder.CreateBox(
    `cubBack_${label}`,
    { width: 6.0, height: 1.8, depth: 0.15 },
    scene,
  );
  back.position = new Vector3(cx, 0.9, cz + 2.6);
  back.material = cubicleWallMat;
  const left = MeshBuilder.CreateBox(
    `cubLeft_${label}`,
    { width: 0.15, height: 1.8, depth: 5.0 },
    scene,
  );
  left.position = new Vector3(cx - 2.95, 0.9, cz + 0.1);
  left.material = cubicleWallMat;
  const right = left.clone(`cubRight_${label}`);
  right.position.x = cx + 2.95;

  // Coloured stripe along the top of each screen for the dept accent
  const topStripeBack = MeshBuilder.CreateBox(
    `cubBackStripe_${label}`,
    { width: 6.04, height: 0.18, depth: 0.18 },
    scene,
  );
  topStripeBack.position = new Vector3(cx, 1.7, cz + 2.6);
  topStripeBack.material = accentMat;
  const topStripeLeft = MeshBuilder.CreateBox(
    `cubLeftStripe_${label}`,
    { width: 0.18, height: 0.18, depth: 5.04 },
    scene,
  );
  topStripeLeft.position = new Vector3(cx - 2.95, 1.7, cz + 0.1);
  topStripeLeft.material = accentMat;
  const topStripeRight = topStripeLeft.clone(`cubRightStripe_${label}`);
  topStripeRight.position.x = cx + 2.95;

  // Sign mounted ABOVE the back partition (top of partition is at y≈1.8;
  // the sign sits with its bottom edge resting on that lip and reads from
  // a distance). The sign is enlarged and tilted 30° upward so the face
  // angles toward the overhead orbit camera, making the department label
  // far easier to read from a distance.
  const sign = MeshBuilder.CreateBox(
    `cubSign_${label}`,
    { width: 7.2, height: 1.6, depth: 0.08 },
    scene,
  );
  // Tilt the sign's top backward so its front face aims up toward the
  // bird's-eye camera. With a 30° tilt the bottom edge of the sign moves
  // forward and the top edge moves back, so we offset the centre slightly
  // to keep the bottom resting just above the partition lip.
  sign.rotation.x = Math.PI / 6; // 30 degrees
  sign.position = new Vector3(cx, 2.55, cz + 2.4);
  drawSignTexture(scene, sign, 1440, 320, (ctx) => {
    ctx.fillStyle = "#3a5fb0";
    ctx.fillRect(0, 0, 1440, 320);
    ctx.fillStyle = "#ffffff";
    // Auto-fit text so labels of varying length (e.g. "FRAUD" vs
    // "LOSS ADJUSTER") never clip on either side of the sign. Start at a
    // comfortable size and shrink only if the measured text would breach
    // the safe inner width.
    const safeWidth = 1280; // leave 80px padding on each side of 1440
    let fontPx = 150;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `bold ${fontPx}px sans-serif`;
    while (ctx.measureText(signText).width > safeWidth && fontPx > 80) {
      fontPx -= 6;
      ctx.font = `bold ${fontPx}px sans-serif`;
    }
    ctx.fillText(signText, 720, 170);
  });

  // Slim accent strip directly under the sign so the larger sign visually
  // ties back to the cubicle's accent colour. Widened to match the new
  // sign and kept flat on the partition top.
  const signUnderline = MeshBuilder.CreateBox(
    `cubSignAccent_${label}`,
    { width: 7.2, height: 0.08, depth: 0.1 },
    scene,
  );
  signUnderline.position = new Vector3(cx, 1.88, cz + 2.55);
  signUnderline.material = accentMat;

  // Desk against the back partition
  const desk = MeshBuilder.CreateBox(
    `desk_${label}`,
    { width: 3.4, height: 0.12, depth: 1.3 },
    scene,
  );
  desk.position = new Vector3(cx, 0.85, cz + 1.4);
  desk.material = deskMat;
  for (const lx of [-1.4, 1.4]) {
    const leg = MeshBuilder.CreateBox(
      `deskLeg_${label}_${lx}`,
      { width: 0.12, height: 0.85, depth: 1.0 },
      scene,
    );
    leg.position = new Vector3(cx + lx, 0.42, cz + 1.4);
    leg.material = deskMat;
  }

  // Monitor on desk
  buildMonitor(scene, mat, new Vector3(cx - 0.6, 0.92, cz + 1.3), 0);
  // Phone
  const phone = MeshBuilder.CreateBox(
    `phone_${label}`,
    { width: 0.35, height: 0.12, depth: 0.25 },
    scene,
  );
  phone.position = new Vector3(cx + 0.9, 0.97, cz + 1.5);
  phone.material = mat(`phoneMat_${label}`, "#1a1f2c");

  // Document tray
  const docTray = MeshBuilder.CreateBox(
    `docTray_${label}`,
    { width: 0.6, height: 0.06, depth: 0.4 },
    scene,
  );
  docTray.position = new Vector3(cx + 1.1, 0.95, cz + 1.1);
  docTray.material = mat(`docTrayMat_${label}`, "#f4ecdb");

  // Desk lamp, mug, and a small book stack — small voxel desktop props
  // inspired by the voxel-furniture-pack aesthetic. Colours are seeded
  // off the cubicle label so each desk feels a little different.
  const mugColors = ["#e8504c", "#ffb347", "#6ec1ff", "#2e8a6e", "#a06a4c", "#b56fbf"];
  const lampColors = ["#3a5fb0", "#e8504c", "#2e8a6e", "#ffb347", "#a06a4c", "#1a1f2c", "#b56fbf"];
  const seed = label.charCodeAt(0) + label.length;
  buildDeskLamp(
    scene,
    mat,
    `lamp_${label}`,
    new Vector3(cx + 1.35, 0.91, cz + 1.75),
    lampColors[seed % lampColors.length],
  );
  buildMug(
    scene,
    mat,
    `mug_${label}`,
    new Vector3(cx + 0.5, 0.92, cz + 1.65),
    mugColors[seed % mugColors.length],
  );
  buildBookStack(
    scene,
    mat,
    `books_${label}`,
    new Vector3(cx - 1.3, 0.92, cz + 1.65),
  );

  // Chair (in front of desk)
  const chairSeat = MeshBuilder.CreateBox(
    `chairSeat_${label}`,
    { width: 0.65, height: 0.12, depth: 0.65 },
    scene,
  );
  chairSeat.position = new Vector3(cx, 0.55, cz + 0.4);
  chairSeat.material = chairMat;
  const chairBack = MeshBuilder.CreateBox(
    `chairBack_${label}`,
    { width: 0.65, height: 0.8, depth: 0.12 },
    scene,
  );
  chairBack.position = new Vector3(cx, 1.0, cz + 0.1);
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

  // Sign above the front glass partition (faces outward toward the corridor)
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

  // Overhead "TEAM LEADER" sign matching the other department zones so the
  // executive office is clearly labelled from the bird's-eye orbit camera.
  // Mounted at the back of the office, enlarged and tilted 30° upward so the
  // face angles toward the camera, with a slim gold accent strip underneath.
  const accentMat = mat("tlSignAccent", "#c9a14a");
  const overheadSign = MeshBuilder.CreateBox(
    "tlSignOverhead",
    { width: 7.2, height: 1.6, depth: 0.08 },
    scene,
  );
  overheadSign.rotation.x = Math.PI / 6; // 30 degrees
  overheadSign.position = new Vector3(origin.x, 2.55, origin.z + 2.4);
  drawSignTexture(scene, overheadSign, 1440, 320, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 1440, 320);
    ctx.fillStyle = "#ffffff";
    const safeWidth = 1280;
    let fontPx = 150;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `bold ${fontPx}px sans-serif`;
    const label = "TEAM LEADER";
    while (ctx.measureText(label).width > safeWidth && fontPx > 80) {
      fontPx -= 6;
      ctx.font = `bold ${fontPx}px sans-serif`;
    }
    ctx.fillText(label, 720, 170);
  });

  const overheadUnderline = MeshBuilder.CreateBox(
    "tlSignOverheadAccent",
    { width: 7.2, height: 0.08, depth: 0.1 },
    scene,
  );
  overheadUnderline.position = new Vector3(origin.x, 1.88, origin.z + 2.55);
  overheadUnderline.material = accentMat;

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

  // Voxel-pack flair: rug under the desk, desk lamp + mug + books on the
  // executive desk, and a row of coloured books on each shelf level.
  buildRug(scene, mat, "tlRug", new Vector3(origin.x, 0.15, origin.z + 0.6), 4.0, 2.6, "#a06a4c");
  buildDeskLamp(scene, mat, "tlDeskLamp", new Vector3(origin.x + 1.4, 0.93, origin.z + 0.5), "#2a3a5c");
  buildMug(scene, mat, "tlDeskMug", new Vector3(origin.x + 0.8, 0.94, origin.z + 0.6), "#e8504c");
  buildBookStack(scene, mat, "tlDeskBooks", new Vector3(origin.x - 1.3, 0.93, origin.z + 0.6));
  for (let s = 0; s < 3; s++) {
    buildShelfBooks(
      scene,
      mat,
      `tlShelfRow_${s}`,
      new Vector3(origin.x + 1.5, 0.55 + s * 0.5, origin.z + 2.45),
      2.4,
    );
  }
  // Small framed photo on the bookshelf top
  buildFramedArt(
    scene,
    mat,
    "tlFrame",
    new Vector3(origin.x + 0.4, 1.85, origin.z + 2.6),
    0.7,
    0.55,
    "#e8504c",
  );
  buildPlant(scene, mat, new Vector3(origin.x + 2.6, 1.6, origin.z + 2.6));
}

/** Glass-walled meeting room with a long table and chairs. */
/**
 * Build a section of two glass-walled meeting rooms side-by-side along the
 * back of the office, unified by a shared accent floor and an overhead
 * "MEETING ROOMS" banner. Each room has its own conference table, chairs,
 * wall display and pendant lamps. The section is positioned by its
 * mid-point; the two rooms are placed symmetrically to its left and right.
 */
function buildMeetingRoomSection(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  // Shared accent floor under both rooms (slate blue) so the section reads
  // as one unified zone from the bird's-eye camera.
  const sectionFloor = MeshBuilder.CreateBox(
    "mrSectionFloor",
    { width: 16.4, height: 0.05, depth: 5.4 },
    scene,
  );
  sectionFloor.position = new Vector3(origin.x, 0.13, origin.z + 0.2);
  sectionFloor.material = mat("mrSectionFloorMat", "#3b4d72");

  // Overhead "MEETING ROOMS" banner mounted on the back wall, above the
  // shared cabinet line, so the section is clearly labelled from a
  // distance.
  const banner = MeshBuilder.CreateBox(
    "mrSectionBanner",
    { width: 8.0, height: 0.9, depth: 0.08 },
    scene,
  );
  banner.position = new Vector3(origin.x, 4.1, 24.78);
  drawSignTexture(scene, banner, 1024, 140, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 1024, 140);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 78px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MEETING ROOMS", 512, 76);
  });

  // Two rooms 9 units apart, centred on the section origin
  buildMeetingRoom(
    scene,
    mat,
    new Vector3(origin.x - 4.5, 0, origin.z),
    "mrA",
    "MEETING ROOM A",
  );
  buildMeetingRoom(
    scene,
    mat,
    new Vector3(origin.x + 4.5, 0, origin.z),
    "mrB",
    "MEETING ROOM B",
  );
}

function buildMeetingRoom(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
  tag: string = "mr",
  title: string = "MEETING ROOM",
): void {
  const glass = mat(`${tag}Glass`, "#cfe7ff");
  const frame = mat(`${tag}Frame`, "#2a3a5c");

  // Glass walls (3 sides — back is the office wall)
  const front = MeshBuilder.CreateBox(
    `${tag}_front`,
    { width: 7.0, height: 2.4, depth: 0.1 },
    scene,
  );
  front.position = new Vector3(origin.x, 1.2, origin.z - 2.5);
  front.material = glass;
  const left = MeshBuilder.CreateBox(
    `${tag}_left`,
    { width: 0.1, height: 2.4, depth: 5.0 },
    scene,
  );
  left.position = new Vector3(origin.x - 3.5, 1.2, origin.z);
  left.material = glass;
  const right = MeshBuilder.CreateBox(
    `${tag}_right`,
    { width: 0.1, height: 2.4, depth: 5.0 },
    scene,
  );
  right.position = new Vector3(origin.x + 3.5, 1.2, origin.z);
  right.material = glass;

  // Frames
  const frontFrame = MeshBuilder.CreateBox(
    `${tag}_frontFrame`,
    { width: 7.0, height: 0.12, depth: 0.14 },
    scene,
  );
  frontFrame.position = new Vector3(origin.x, 2.4, origin.z - 2.5);
  frontFrame.material = frame;
  const leftFrame = MeshBuilder.CreateBox(
    `${tag}_leftFrame`,
    { width: 0.14, height: 0.12, depth: 5.0 },
    scene,
  );
  leftFrame.position = new Vector3(origin.x - 3.5, 2.4, origin.z);
  leftFrame.material = frame;
  const rightFrame = MeshBuilder.CreateBox(
    `${tag}_rightFrame`,
    { width: 0.14, height: 0.12, depth: 5.0 },
    scene,
  );
  rightFrame.position = new Vector3(origin.x + 3.5, 2.4, origin.z);
  rightFrame.material = frame;

  // Sign above
  const sign = MeshBuilder.CreateBox(
    `${tag}_sign`,
    { width: 3.2, height: 0.55, depth: 0.06 },
    scene,
  );
  sign.position = new Vector3(origin.x, 2.95, origin.z - 2.5);
  drawSignTexture(scene, sign, 512, 96, (ctx) => {
    ctx.fillStyle = "#2a3a5c";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 256, 50);
  });

  // Conference table
  const table = MeshBuilder.CreateBox(
    `${tag}_table`,
    { width: 4.5, height: 0.15, depth: 1.6 },
    scene,
  );
  table.position = new Vector3(origin.x, 0.85, origin.z + 0.5);
  table.material = mat(`${tag}_tableMat`, "#bca78a");
  const tableBase = MeshBuilder.CreateBox(
    `${tag}_tableBase`,
    { width: 4.0, height: 0.85, depth: 0.5 },
    scene,
  );
  tableBase.position = new Vector3(origin.x, 0.43, origin.z + 0.5);
  tableBase.material = mat(`${tag}_tableBaseMat`, "#7d4f33");

  // Chairs around the table
  for (const cz of [-0.4, 1.4]) {
    for (const cx of [-1.5, 0, 1.5]) {
      const seat = MeshBuilder.CreateBox(
        `${tag}_chair_${cx}_${cz}`,
        { width: 0.55, height: 0.1, depth: 0.55 },
        scene,
      );
      seat.position = new Vector3(origin.x + cx, 0.55, origin.z + cz);
      seat.material = mat(`${tag}_chairMat`, "#1c2230");
      const back = MeshBuilder.CreateBox(
        `${tag}_chairBack_${cx}_${cz}`,
        { width: 0.55, height: 0.65, depth: 0.1 },
        scene,
      );
      back.position = new Vector3(
        origin.x + cx,
        0.93,
        origin.z + cz + (cz > 0 ? 0.25 : -0.25),
      );
      back.material = mat(`${tag}_chairBackMat`, "#1c2230");
    }
  }

  // Wall-mounted display on back wall
  const tv = MeshBuilder.CreateBox(
    `${tag}_tv`,
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

  // Voxel-pack flair: pendant lamp above the table, laptops + mugs at each
  // chair, and a centerpiece plant.
  buildPendantLamp(scene, mat, `${tag}_pendantA`, new Vector3(origin.x - 1.0, 3.6, origin.z + 0.5), "#ffb347");
  buildPendantLamp(scene, mat, `${tag}_pendantB`, new Vector3(origin.x + 1.0, 3.6, origin.z + 0.5), "#ffb347");
  const laptopColors = ["#3a5fb0", "#e8504c", "#2e8a6e", "#a06a4c", "#b56fbf", "#1a1f2c"];
  let i = 0;
  for (const cz of [-0.4, 1.4]) {
    for (const cx of [-1.5, 0, 1.5]) {
      buildLaptop(
        scene,
        mat,
        `${tag}_laptop_${cx}_${cz}`,
        new Vector3(origin.x + cx, 0.93, origin.z + cz + (cz > 0 ? -0.2 : 0.2)),
        cz > 0,
        laptopColors[i % laptopColors.length],
      );
      i++;
    }
  }
  buildPlant(scene, mat, new Vector3(origin.x, 0.93, origin.z + 0.5));
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

  // Voxel-pack accents: pendant lamp over the breakfast bar, fruit bowl on
  // the counter, mugs lined up by the coffee machine, and a wall clock.
  buildPendantLamp(scene, mat, "kitPendantA", new Vector3(origin.x - 2.2, 3.4, origin.z - 1.5), "#e8504c");
  buildPendantLamp(scene, mat, "kitPendantB", new Vector3(origin.x - 0.6, 3.4, origin.z - 1.5), "#2e8a6e");
  buildFruitBowl(scene, mat, "kitFruit", new Vector3(origin.x - 0.5, 1.08, origin.z + 2.5));
  for (const mx of [0.9, 1.2, 1.5]) {
    buildMug(scene, mat, `kitMug_${mx}`, new Vector3(origin.x + mx, 1.08, origin.z - 1.4), "#ffffff");
  }
  buildWallClock(scene, mat, "kitClock", new Vector3(origin.x + 1.5, 2.6, origin.z + 3.05));
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
    { width: 0.08, height: 0.6, depth: 3.6 },
    scene,
  );
  sign.position = new Vector3(origin.x + 2.4, 2.5, origin.z);
  drawSignTexture(scene, sign, 768, 96, (ctx) => {
    ctx.fillStyle = "#a06a4c";
    ctx.fillRect(0, 0, 768, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COFFEE AREA", 384, 50);
  });

  // Tall corner plant
  buildPlant(scene, mat, new Vector3(origin.x + 1.8, 0, origin.z - 2.5));

  // Voxel-pack accents: pendant lamps over each table.
  buildPendantLamp(scene, mat, "cafePendantA", new Vector3(origin.x, 3.2, origin.z - 1.6), "#a06a4c");
  buildPendantLamp(scene, mat, "cafePendantB", new Vector3(origin.x, 3.2, origin.z + 1.6), "#a06a4c");
}

/**
 * Play Area: ping-pong table, arcade cabinet, beanbags, and a "PLAY ZONE"
 * sign. Sits on the front-right accent floor — a relaxation space for staff.
 */
function buildPlayArea(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  // Ping-pong table (centre)
  const pingTop = MeshBuilder.CreateBox(
    "playPingTop",
    { width: 2.7, height: 0.1, depth: 1.5 },
    scene,
  );
  pingTop.position = new Vector3(origin.x - 1.5, 0.85, origin.z + 0.5);
  pingTop.material = mat("playPingTopMat", "#2e5a4a");
  // White stripe down the middle (length-wise)
  const pingStripe = MeshBuilder.CreateBox(
    "playPingStripe",
    { width: 2.7, height: 0.02, depth: 0.05 },
    scene,
  );
  pingStripe.position = new Vector3(origin.x - 1.5, 0.91, origin.z + 0.5);
  pingStripe.material = mat("playPingStripeMat", "#ffffff");
  // Net across the middle
  const pingNet = MeshBuilder.CreateBox(
    "playPingNet",
    { width: 0.04, height: 0.18, depth: 1.5 },
    scene,
  );
  pingNet.position = new Vector3(origin.x - 1.5, 0.99, origin.z + 0.5);
  pingNet.material = mat("playPingNetMat", "#1a1f2c");
  // Legs
  for (const [dx, dz] of [
    [-1.2, -0.6],
    [-1.2, 0.6],
    [1.2, -0.6],
    [1.2, 0.6],
  ] as const) {
    const leg = MeshBuilder.CreateBox(
      `playPingLeg_${dx}_${dz}`,
      { width: 0.1, height: 0.85, depth: 0.1 },
      scene,
    );
    leg.position = new Vector3(origin.x - 1.5 + dx, 0.42, origin.z + 0.5 + dz);
    leg.material = mat("playPingLegMat", "#1a1f2c");
  }
  // Two paddles on the table
  for (const px of [-1.0, 1.0]) {
    const paddle = MeshBuilder.CreateBox(
      `playPaddle_${px}`,
      { width: 0.32, height: 0.04, depth: 0.22 },
      scene,
    );
    paddle.position = new Vector3(origin.x - 1.5 + px, 0.92, origin.z + 0.5 + (px > 0 ? -0.4 : 0.4));
    paddle.material = mat("playPaddleMat", "#e8504c");
  }

  // Arcade cabinet (back-right of the zone)
  const arcadeBody = MeshBuilder.CreateBox(
    "playArcade",
    { width: 0.9, height: 1.9, depth: 0.8 },
    scene,
  );
  arcadeBody.position = new Vector3(origin.x + 2.5, 0.95, origin.z + 2.0);
  arcadeBody.material = mat("playArcadeMat", "#1c2230");
  const arcadeScreen = MeshBuilder.CreateBox(
    "playArcadeScreen",
    { width: 0.7, height: 0.55, depth: 0.05 },
    scene,
  );
  arcadeScreen.position = new Vector3(origin.x + 2.5, 1.45, origin.z + 1.6);
  drawSignTexture(scene, arcadeScreen, 256, 200, (ctx) => {
    ctx.fillStyle = "#1a1f2c";
    ctx.fillRect(0, 0, 256, 200);
    // pixel-art "INSERT COIN"
    ctx.fillStyle = "#ffb347";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText("INSERT", 128, 80);
    ctx.fillText("COIN", 128, 120);
    ctx.fillStyle = "#e8504c";
    ctx.fillRect(40, 150, 24, 24);
    ctx.fillStyle = "#6ec1ff";
    ctx.fillRect(72, 150, 24, 24);
    ctx.fillStyle = "#2e8a6e";
    ctx.fillRect(160, 150, 24, 24);
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(192, 150, 24, 24);
  });
  const arcadeJoy = MeshBuilder.CreateBox(
    "playArcadeJoy",
    { width: 0.7, height: 0.18, depth: 0.5 },
    scene,
  );
  arcadeJoy.position = new Vector3(origin.x + 2.5, 1.0, origin.z + 1.6);
  arcadeJoy.material = mat("playArcadeJoyMat", "#3a5fb0");
  const arcadeMarquee = MeshBuilder.CreateBox(
    "playArcadeMarquee",
    { width: 0.95, height: 0.25, depth: 0.05 },
    scene,
  );
  arcadeMarquee.position = new Vector3(origin.x + 2.5, 1.85, origin.z + 1.58);
  drawSignTexture(scene, arcadeMarquee, 256, 64, (ctx) => {
    ctx.fillStyle = "#e8504c";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ARCADE", 128, 32);
  });

  // Beanbags (front of the zone)
  for (const [bx, bz, hex] of [
    [-2.5, -2.0, "#e8504c"],
    [-1.0, -2.2, "#ffb347"],
    [0.5, -2.0, "#6ec1ff"],
  ] as const) {
    const bag = MeshBuilder.CreateBox(
      `playBean_${bx}_${bz}`,
      { width: 0.95, height: 0.55, depth: 0.95 },
      scene,
    );
    bag.position = new Vector3(origin.x + bx, 0.27, origin.z + bz);
    bag.material = mat(`playBeanMat_${bx}_${bz}`, hex);
  }

  // "PLAY AREA" sign on the right wall
  const sign = MeshBuilder.CreateBox(
    "playSign",
    { width: 0.08, height: 0.6, depth: 2.6 },
    scene,
  );
  sign.position = new Vector3(origin.x + 4.9, 2.5, origin.z);
  drawSignTexture(scene, sign, 384, 96, (ctx) => {
    ctx.fillStyle = "#2e5a4a";
    ctx.fillRect(0, 0, 384, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PLAY AREA", 192, 50);
  });

  // Pendant lamp over the table and a corner plant
  buildPendantLamp(scene, mat, "playPendant", new Vector3(origin.x - 1.5, 3.4, origin.z + 0.5), "#ffb347");
  buildPlant(scene, mat, new Vector3(origin.x + 4.0, 0, origin.z - 2.5));
}

/**
 * IT / Cloud Infra Room: glass partition front, rows of server racks with
 * blinking-light decals, a workbench, and a "CLOUD INFRA" sign. Sits on
 * the back-far-left dark accent floor.
 */
function buildITRoom(
  scene: Scene,
  mat: MaterialFactory,
  origin: Vector3,
): void {
  const glass = mat("itGlass", "#cfe7ff");
  const frame = mat("itFrame", "#2a3a5c");

  // Glass partition (front + right side, opens to the office)
  const front = MeshBuilder.CreateBox(
    "itFront",
    { width: 9.6, height: 2.6, depth: 0.1 },
    scene,
  );
  front.position = new Vector3(origin.x, 1.3, origin.z - 3.6);
  front.material = glass;
  const rightWall = MeshBuilder.CreateBox(
    "itRight",
    { width: 0.1, height: 2.6, depth: 7.4 },
    scene,
  );
  rightWall.position = new Vector3(origin.x + 4.8, 1.3, origin.z);
  rightWall.material = glass;

  // Frames
  const frontFrame = MeshBuilder.CreateBox(
    "itFrontFrame",
    { width: 9.6, height: 0.12, depth: 0.14 },
    scene,
  );
  frontFrame.position = new Vector3(origin.x, 2.6, origin.z - 3.6);
  frontFrame.material = frame;
  const rightFrame = MeshBuilder.CreateBox(
    "itRightFrame",
    { width: 0.14, height: 0.12, depth: 7.4 },
    scene,
  );
  rightFrame.position = new Vector3(origin.x + 4.8, 2.6, origin.z);
  rightFrame.material = frame;

  // Sign above
  const sign = MeshBuilder.CreateBox(
    "itSign",
    { width: 4.2, height: 0.6, depth: 0.06 },
    scene,
  );
  sign.position = new Vector3(origin.x, 3.15, origin.z - 3.6);
  drawSignTexture(scene, sign, 640, 110, (ctx) => {
    ctx.fillStyle = "#1f2a3f";
    ctx.fillRect(0, 0, 640, 110);
    ctx.fillStyle = "#6ec1ff";
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("IT / CLOUD INFRA", 320, 60);
  });

  // Server racks — two rows along the back of the room
  const rackBodyMat = mat("itRack", "#1a1f2c");
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const rx = origin.x - 3.6 + col * 1.5;
      const rz = origin.z + 1.0 + row * 1.6;
      const rack = MeshBuilder.CreateBox(
        `itRack_${row}_${col}`,
        { width: 1.1, height: 2.0, depth: 0.9 },
        scene,
      );
      rack.position = new Vector3(rx, 1.0, rz);
      rack.material = rackBodyMat;
      // Indicator-light face
      const face = MeshBuilder.CreateBox(
        `itRackFace_${row}_${col}`,
        { width: 0.95, height: 1.7, depth: 0.05 },
        scene,
      );
      face.position = new Vector3(rx, 1.05, rz - 0.46);
      drawSignTexture(scene, face, 128, 256, (ctx) => {
        ctx.fillStyle = "#0f141d";
        ctx.fillRect(0, 0, 128, 256);
        // Stack of "blade" rows with little LEDs
        const ledColors = ["#2e8a6e", "#6ec1ff", "#ffb347", "#e8504c"];
        for (let r = 0; r < 14; r++) {
          ctx.fillStyle = "#22252e";
          ctx.fillRect(8, 10 + r * 17, 112, 12);
          for (let l = 0; l < 4; l++) {
            ctx.fillStyle = ledColors[(row + col + r + l) % ledColors.length];
            ctx.fillRect(16 + l * 14, 13 + r * 17, 6, 6);
          }
        }
      });
    }
  }

  // Workbench / IT desk along the right interior wall
  const benchTop = MeshBuilder.CreateBox(
    "itBench",
    { width: 3.0, height: 0.12, depth: 1.0 },
    scene,
  );
  benchTop.position = new Vector3(origin.x + 3.0, 0.85, origin.z - 1.6);
  benchTop.material = mat("itBenchMat", "#bca78a");
  const benchBase = MeshBuilder.CreateBox(
    "itBenchBase",
    { width: 2.8, height: 0.85, depth: 0.9 },
    scene,
  );
  benchBase.position = new Vector3(origin.x + 3.0, 0.43, origin.z - 1.6);
  benchBase.material = mat("itBenchBaseMat", "#7d4f33");
  buildMonitor(scene, mat, new Vector3(origin.x + 2.4, 0.92, origin.z - 1.7), 0);
  buildLaptop(scene, mat, "itLaptop", new Vector3(origin.x + 3.6, 0.92, origin.z - 1.5), false, "#3a5fb0");

  // Cool floor lamp + ceiling pendants for atmospheric lighting
  buildPendantLamp(scene, mat, "itPendantA", new Vector3(origin.x - 2.0, 4.2, origin.z + 1.5), "#6ec1ff");
  buildPendantLamp(scene, mat, "itPendantB", new Vector3(origin.x + 1.0, 4.2, origin.z + 1.5), "#6ec1ff");
  buildPendantLamp(scene, mat, "itPendantC", new Vector3(origin.x - 2.0, 4.2, origin.z - 1.5), "#6ec1ff");
  buildPendantLamp(scene, mat, "itPendantD", new Vector3(origin.x + 1.0, 4.2, origin.z - 1.5), "#6ec1ff");
}

// ===== Voxel-pack-inspired prop helpers =====
// These are small, blocky, colourful desktop/decor props built from
// primitives — taking stylistic inspiration from typical voxel furniture
// packs (lamps, mugs, books, cushions, rugs, frames, clocks, pendants).
// All meshes are static and named uniquely.

/** Tiny desk lamp: square base, slim stem, coloured shade. */
function buildDeskLamp(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  shadeHex: string,
): void {
  const base = MeshBuilder.CreateBox(
    `${name}_base`,
    { width: 0.28, height: 0.05, depth: 0.28 },
    scene,
  );
  base.position = new Vector3(pos.x, pos.y + 0.025, pos.z);
  base.material = mat(`${name}_baseMat`, "#22252e");
  const stem = MeshBuilder.CreateBox(
    `${name}_stem`,
    { width: 0.06, height: 0.4, depth: 0.06 },
    scene,
  );
  stem.position = new Vector3(pos.x, pos.y + 0.25, pos.z);
  stem.material = mat(`${name}_stemMat`, "#22252e");
  const shade = MeshBuilder.CreateBox(
    `${name}_shade`,
    { width: 0.34, height: 0.22, depth: 0.34 },
    scene,
  );
  shade.position = new Vector3(pos.x, pos.y + 0.55, pos.z);
  shade.material = mat(`${name}_shadeMat`, shadeHex);
  // A small "bulb glow" cube under the shade
  const glow = MeshBuilder.CreateBox(
    `${name}_glow`,
    { width: 0.18, height: 0.04, depth: 0.18 },
    scene,
  );
  glow.position = new Vector3(pos.x, pos.y + 0.42, pos.z);
  glow.material = mat(`${name}_glowMat`, "#fff4c2");
}

/** Coffee mug: short cube body + a thin handle on the side. */
function buildMug(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  bodyHex: string,
): void {
  const body = MeshBuilder.CreateBox(
    `${name}_body`,
    { width: 0.2, height: 0.22, depth: 0.2 },
    scene,
  );
  body.position = new Vector3(pos.x, pos.y + 0.11, pos.z);
  body.material = mat(`${name}_bodyMat`, bodyHex);
  const handle = MeshBuilder.CreateBox(
    `${name}_handle`,
    { width: 0.05, height: 0.14, depth: 0.05 },
    scene,
  );
  handle.position = new Vector3(pos.x + 0.13, pos.y + 0.13, pos.z);
  handle.material = mat(`${name}_handleMat`, bodyHex);
  const rim = MeshBuilder.CreateBox(
    `${name}_rim`,
    { width: 0.16, height: 0.02, depth: 0.16 },
    scene,
  );
  rim.position = new Vector3(pos.x, pos.y + 0.22, pos.z);
  rim.material = mat(`${name}_rimMat`, "#ffffff");
}

/** A short stack of three differently coloured books on a desk. */
function buildBookStack(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
): void {
  const palette = ["#3a5fb0", "#e8504c", "#2e8a6e", "#ffb347", "#b56fbf", "#a06a4c"];
  const seed = name.length;
  for (let i = 0; i < 3; i++) {
    const book = MeshBuilder.CreateBox(
      `${name}_${i}`,
      { width: 0.5 - i * 0.05, height: 0.08, depth: 0.32 },
      scene,
    );
    book.position = new Vector3(pos.x, pos.y + 0.04 + i * 0.085, pos.z);
    book.material = mat(`${name}_${i}_mat`, palette[(seed + i) % palette.length]);
  }
}

/** A row of upright books along a shelf, alternating colours. */
function buildShelfBooks(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  width: number,
): void {
  const palette = ["#3a5fb0", "#e8504c", "#2e8a6e", "#ffb347", "#b56fbf", "#a06a4c", "#1a1f2c", "#6ec1ff"];
  const count = Math.max(1, Math.floor(width / 0.18));
  const startX = pos.x - width / 2 + 0.1;
  for (let i = 0; i < count; i++) {
    const w = 0.1 + ((i * 7) % 4) * 0.02;
    const h = 0.32 + ((i * 5) % 3) * 0.05;
    const book = MeshBuilder.CreateBox(
      `${name}_${i}`,
      { width: w, height: h, depth: 0.22 },
      scene,
    );
    book.position = new Vector3(startX + i * 0.18, pos.y + h / 2, pos.z);
    book.material = mat(`${name}_${i}_mat`, palette[(i * 3 + name.length) % palette.length]);
  }
}

/** Plush square cushion — a flat soft-coloured cube. */
function buildCushion(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  hex: string,
): void {
  const c = MeshBuilder.CreateBox(
    name,
    { width: 0.5, height: 0.18, depth: 0.5 },
    scene,
  );
  c.position = new Vector3(pos.x, pos.y, pos.z);
  c.material = mat(`${name}_mat`, hex);
}

/** Rectangular rug — a very thin coloured slab with a lighter border. */
function buildRug(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  width: number,
  depth: number,
  hex: string,
): void {
  const rug = MeshBuilder.CreateBox(
    name,
    { width, height: 0.04, depth },
    scene,
  );
  rug.position = new Vector3(pos.x, pos.y, pos.z);
  rug.material = mat(`${name}_mat`, hex);
  const border = MeshBuilder.CreateBox(
    `${name}_border`,
    { width: width - 0.3, height: 0.045, depth: depth - 0.3 },
    scene,
  );
  border.position = new Vector3(pos.x, pos.y + 0.005, pos.z);
  border.material = mat(`${name}_borderMat`, "#ffffff");
}

/** Floor lamp: square base, tall thin stem, a tapered shade on top. */
function buildFloorLamp(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  shadeHex: string,
): void {
  const base = MeshBuilder.CreateBox(
    `${name}_base`,
    { width: 0.5, height: 0.08, depth: 0.5 },
    scene,
  );
  base.position = new Vector3(pos.x, pos.y + 0.04, pos.z);
  base.material = mat(`${name}_baseMat`, "#22252e");
  const stem = MeshBuilder.CreateBox(
    `${name}_stem`,
    { width: 0.08, height: 1.7, depth: 0.08 },
    scene,
  );
  stem.position = new Vector3(pos.x, pos.y + 0.93, pos.z);
  stem.material = mat(`${name}_stemMat`, "#22252e");
  const shade = MeshBuilder.CreateBox(
    `${name}_shade`,
    { width: 0.6, height: 0.55, depth: 0.6 },
    scene,
  );
  shade.position = new Vector3(pos.x, pos.y + 2.05, pos.z);
  shade.material = mat(`${name}_shadeMat`, shadeHex);
  const shadeRim = MeshBuilder.CreateBox(
    `${name}_shadeRim`,
    { width: 0.66, height: 0.06, depth: 0.66 },
    scene,
  );
  shadeRim.position = new Vector3(pos.x, pos.y + 1.78, pos.z);
  shadeRim.material = mat(`${name}_shadeRimMat`, "#22252e");
}

/** Round-ish wall clock: dark frame, light face, four tick marks and hands. */
function buildWallClock(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
): void {
  const frame = MeshBuilder.CreateBox(
    `${name}_frame`,
    { width: 0.85, height: 0.85, depth: 0.06 },
    scene,
  );
  frame.position = new Vector3(pos.x, pos.y, pos.z);
  frame.material = mat(`${name}_frameMat`, "#22252e");
  const face = MeshBuilder.CreateBox(
    `${name}_face`,
    { width: 0.7, height: 0.7, depth: 0.04 },
    scene,
  );
  face.position = new Vector3(pos.x, pos.y, pos.z - 0.04);
  drawSignTexture(scene, face, 256, 256, (ctx) => {
    ctx.fillStyle = "#f4ecdb";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#22252e";
    // Tick marks at 12/3/6/9
    ctx.fillRect(120, 24, 16, 22);
    ctx.fillRect(120, 210, 16, 22);
    ctx.fillRect(24, 120, 22, 16);
    ctx.fillRect(210, 120, 22, 16);
    // Hour and minute hands
    ctx.fillRect(124, 70, 8, 60);
    ctx.fillRect(124, 124, 70, 8);
    // Centre dot
    ctx.beginPath();
    ctx.arc(128, 128, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Wall-mounted framed art: dark frame around a coloured "canvas" panel. */
function buildFramedArt(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  width: number,
  height: number,
  hex: string,
): void {
  const frame = MeshBuilder.CreateBox(
    `${name}_frame`,
    { width, height, depth: 0.06 },
    scene,
  );
  frame.position = new Vector3(pos.x, pos.y, pos.z);
  frame.material = mat(`${name}_frameMat`, "#22252e");
  const canvas = MeshBuilder.CreateBox(
    `${name}_canvas`,
    { width: width - 0.18, height: height - 0.18, depth: 0.04 },
    scene,
  );
  canvas.position = new Vector3(pos.x, pos.y, pos.z - 0.04);
  drawSignTexture(scene, canvas, 256, 192, (ctx) => {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 192);
    grad.addColorStop(0, hex);
    grad.addColorStop(1, "#f4ecdb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 192);
    // Pixel-art mountains
    ctx.fillStyle = "#2a3a5c";
    ctx.beginPath();
    ctx.moveTo(0, 150);
    ctx.lineTo(70, 80);
    ctx.lineTo(120, 120);
    ctx.lineTo(180, 60);
    ctx.lineTo(256, 130);
    ctx.lineTo(256, 192);
    ctx.lineTo(0, 192);
    ctx.closePath();
    ctx.fill();
    // Sun
    ctx.fillStyle = "#ffb347";
    ctx.beginPath();
    ctx.arc(196, 50, 18, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Hanging pendant lamp — cord + shade, ~0.8m drop. */
function buildPendantLamp(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  shadeHex: string,
): void {
  const cord = MeshBuilder.CreateBox(
    `${name}_cord`,
    { width: 0.04, height: 1.0, depth: 0.04 },
    scene,
  );
  cord.position = new Vector3(pos.x, pos.y + 0.5, pos.z);
  cord.material = mat(`${name}_cordMat`, "#22252e");
  const shade = MeshBuilder.CreateBox(
    `${name}_shade`,
    { width: 0.5, height: 0.35, depth: 0.5 },
    scene,
  );
  shade.position = new Vector3(pos.x, pos.y - 0.18, pos.z);
  shade.material = mat(`${name}_shadeMat`, shadeHex);
  const bulb = MeshBuilder.CreateBox(
    `${name}_bulb`,
    { width: 0.22, height: 0.06, depth: 0.22 },
    scene,
  );
  bulb.position = new Vector3(pos.x, pos.y - 0.4, pos.z);
  bulb.material = mat(`${name}_bulbMat`, "#fff4c2");
}

/** Open laptop on a table: dark base + lighter screen tilted up. */
function buildLaptop(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
  facingPositiveZ: boolean,
  bodyHex: string,
): void {
  const dir = facingPositiveZ ? 1 : -1;
  const base = MeshBuilder.CreateBox(
    `${name}_base`,
    { width: 0.6, height: 0.04, depth: 0.4 },
    scene,
  );
  base.position = new Vector3(pos.x, pos.y + 0.02, pos.z);
  base.material = mat(`${name}_baseMat`, bodyHex);
  const screen = MeshBuilder.CreateBox(
    `${name}_screen`,
    { width: 0.6, height: 0.36, depth: 0.04 },
    scene,
  );
  screen.position = new Vector3(pos.x, pos.y + 0.2, pos.z + dir * 0.18);
  screen.material = mat(`${name}_screenMat`, "#1a1f2c");
  const screenFace = MeshBuilder.CreateBox(
    `${name}_screenFace`,
    { width: 0.52, height: 0.3, depth: 0.02 },
    scene,
  );
  screenFace.position = new Vector3(pos.x, pos.y + 0.2, pos.z + dir * 0.2);
  screenFace.material = mat(`${name}_screenFaceMat`, "#6ec1ff");
}

/** A small fruit bowl: shallow bowl + a few coloured fruit cubes inside. */
function buildFruitBowl(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
): void {
  const bowl = MeshBuilder.CreateBox(
    `${name}_bowl`,
    { width: 0.6, height: 0.12, depth: 0.6 },
    scene,
  );
  bowl.position = new Vector3(pos.x, pos.y + 0.06, pos.z);
  bowl.material = mat(`${name}_bowlMat`, "#cdd5e0");
  const fruits = [
    { c: "#e8504c", dx: -0.12, dz: -0.08 },
    { c: "#ffb347", dx: 0.1, dz: -0.05 },
    { c: "#2e8a6e", dx: 0.0, dz: 0.12 },
    { c: "#b56fbf", dx: -0.05, dz: 0.06 },
  ];
  fruits.forEach((f, i) => {
    const fruit = MeshBuilder.CreateBox(
      `${name}_fruit_${i}`,
      { width: 0.16, height: 0.16, depth: 0.16 },
      scene,
    );
    fruit.position = new Vector3(pos.x + f.dx, pos.y + 0.2, pos.z + f.dz);
    fruit.material = mat(`${name}_fruitMat_${i}`, f.c);
  });
}

/** A pair of stacked magazines on a coffee table. */
function buildMagazines(
  scene: Scene,
  mat: MaterialFactory,
  name: string,
  pos: Vector3,
): void {
  const palette = ["#3a5fb0", "#e8504c", "#ffb347"];
  for (let i = 0; i < 2; i++) {
    const m = MeshBuilder.CreateBox(
      `${name}_${i}`,
      { width: 0.55, height: 0.04, depth: 0.36 },
      scene,
    );
    m.position = new Vector3(pos.x + i * 0.05, pos.y + 0.02 + i * 0.045, pos.z + i * 0.04);
    m.material = mat(`${name}_${i}_mat`, palette[i % palette.length]);
  }
}

/**
 * Decorate the grass land surrounding the office with voxel trees, flower
 * patches, a small fountain, benches, lampposts and a stone path that
 * leads from the customer spawn point to the office entrance. All meshes
 * are static and live entirely outside the office walls
 * (x∈[-30, 30], z∈[-15, 25]) so they never overlap interior furniture or
 * agent walking paths.
 */
function buildExteriorLandscape(
  scene: Scene,
  mat: MaterialFactory,
): void {
  const makeBox = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    hex: string,
  ): Mesh => {
    const box = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    box.position = pos;
    box.material = mat(name, hex);
    return box;
  };

  // Voxel tree: brown trunk + leafy cube, with a slight scale knob.
  const makeTree = (x: number, z: number, scale = 1, leafHex = "#3f7a44"): void => {
    const tag = `ext_tree_${x.toFixed(1)}_${z.toFixed(1)}`;
    makeBox(
      `${tag}_trunk`,
      0.45 * scale,
      1.3 * scale,
      0.45 * scale,
      new Vector3(x, 0.65 * scale, z),
      "#7a4f2a",
    );
    makeBox(
      `${tag}_leaves`,
      1.6 * scale,
      1.5 * scale,
      1.6 * scale,
      new Vector3(x, 1.85 * scale, z),
      leafHex,
    );
    // A second smaller cube of leaves on top, gives a chunky voxel canopy.
    makeBox(
      `${tag}_leaves_top`,
      1.0 * scale,
      0.7 * scale,
      1.0 * scale,
      new Vector3(x, 2.85 * scale, z),
      leafHex,
    );
  };

  // A small flower patch: a darker grass square with 3-4 coloured flower
  // cubes on top.
  const makeFlowerPatch = (
    x: number,
    z: number,
    colors: string[] = ["#e8504c", "#ffd166", "#f4a3c7", "#f0f0f0"],
  ): void => {
    const tag = `ext_flowers_${x.toFixed(1)}_${z.toFixed(1)}`;
    makeBox(
      `${tag}_pad`,
      1.6,
      0.06,
      1.6,
      new Vector3(x, 0.05, z),
      "#5a9648",
    );
    const offsets: Array<[number, number]> = [
      [-0.45, -0.45],
      [0.45, -0.4],
      [-0.4, 0.45],
      [0.45, 0.45],
    ];
    for (let i = 0; i < offsets.length; i++) {
      const [dx, dz] = offsets[i];
      const c = colors[i % colors.length];
      // stem
      makeBox(
        `${tag}_stem_${i}`,
        0.08,
        0.32,
        0.08,
        new Vector3(x + dx, 0.24, z + dz),
        "#3f7a44",
      );
      // bloom
      makeBox(
        `${tag}_bloom_${i}`,
        0.28,
        0.22,
        0.28,
        new Vector3(x + dx, 0.5, z + dz),
        c,
      );
    }
  };

  // Voxel park bench: wooden seat + back, two stone supports.
  const makeBench = (
    cx: number,
    cz: number,
    facing: "N" | "S" | "E" | "W" = "N",
  ): void => {
    const tag = `ext_bench_${cx.toFixed(1)}_${cz.toFixed(1)}`;
    const seatLong = 1.8;
    const seatShort = 0.5;
    const horiz = facing === "E" || facing === "W";
    const w = horiz ? seatShort : seatLong;
    const d = horiz ? seatLong : seatShort;
    // seat
    makeBox(`${tag}_seat`, w, 0.14, d, new Vector3(cx, 0.45, cz), "#7a4f2a");
    // back rail — offset behind the seat, on the side opposite the
    // direction the bench is facing.
    let bx = cx;
    let bz = cz;
    let bw = w;
    let bd = 0.12;
    if (facing === "N") bz = cz + 0.2; // back is to the south, faces N
    else if (facing === "S") bz = cz - 0.2;
    else if (facing === "E") {
      bx = cx - 0.2;
      bw = 0.12;
      bd = d;
    } else if (facing === "W") {
      bx = cx + 0.2;
      bw = 0.12;
      bd = d;
    }
    makeBox(`${tag}_back`, bw, 0.55, bd, new Vector3(bx, 0.78, bz), "#7a4f2a");
    // legs
    const legColor = "#8a8576";
    if (horiz) {
      makeBox(`${tag}_legA`, 0.18, 0.4, 0.18, new Vector3(cx, 0.2, cz - 0.7), legColor);
      makeBox(`${tag}_legB`, 0.18, 0.4, 0.18, new Vector3(cx, 0.2, cz + 0.7), legColor);
    } else {
      makeBox(`${tag}_legA`, 0.18, 0.4, 0.18, new Vector3(cx - 0.7, 0.2, cz), legColor);
      makeBox(`${tag}_legB`, 0.18, 0.4, 0.18, new Vector3(cx + 0.7, 0.2, cz), legColor);
    }
  };

  // Lamppost: tall slim post with a glowing cube head.
  const makeLamppost = (x: number, z: number): void => {
    const tag = `ext_lamp_${x.toFixed(1)}_${z.toFixed(1)}`;
    makeBox(`${tag}_post`, 0.22, 2.4, 0.22, new Vector3(x, 1.2, z), "#3a3a44");
    makeBox(`${tag}_arm`, 0.6, 0.14, 0.14, new Vector3(x + 0.3, 2.35, z), "#3a3a44");
    const head = makeBox(
      `${tag}_head`,
      0.45,
      0.45,
      0.45,
      new Vector3(x + 0.55, 2.35, z),
      "#ffe6a8",
    );
    const m = head.material as StandardMaterial;
    m.emissiveColor = Color3.FromHexString("#ffd066");
  };

  // Decorative voxel rock cluster.
  const makeRock = (x: number, z: number, scale = 1): void => {
    const tag = `ext_rock_${x.toFixed(1)}_${z.toFixed(1)}`;
    makeBox(
      `${tag}_a`,
      0.9 * scale,
      0.5 * scale,
      0.9 * scale,
      new Vector3(x, 0.25 * scale, z),
      "#8a8576",
    );
    makeBox(
      `${tag}_b`,
      0.5 * scale,
      0.35 * scale,
      0.5 * scale,
      new Vector3(x + 0.4 * scale, 0.18 * scale, z + 0.2 * scale),
      "#9a958a",
    );
  };

  // Central voxel fountain: stone basin, water, central pillar with droplet
  // accent. Placed in the front lawn left of the entrance path.
  const makeFountain = (cx: number, cz: number): void => {
    const tag = `ext_fountain_${cx.toFixed(1)}_${cz.toFixed(1)}`;
    // Outer stone ring (built from 4 rim segments around a square basin).
    const stone = "#cdc6b4";
    const stoneDark = "#9a9486";
    // Basin pad (slightly raised square)
    makeBox(`${tag}_base`, 4.4, 0.2, 4.4, new Vector3(cx, 0.1, cz), stoneDark);
    // Stone rim
    makeBox(`${tag}_rimN`, 4.4, 0.45, 0.4, new Vector3(cx, 0.42, cz - 2.0), stone);
    makeBox(`${tag}_rimS`, 4.4, 0.45, 0.4, new Vector3(cx, 0.42, cz + 2.0), stone);
    makeBox(`${tag}_rimE`, 0.4, 0.45, 4.4, new Vector3(cx + 2.0, 0.42, cz), stone);
    makeBox(`${tag}_rimW`, 0.4, 0.45, 4.4, new Vector3(cx - 2.0, 0.42, cz), stone);
    // Water surface
    makeBox(`${tag}_water`, 3.6, 0.1, 3.6, new Vector3(cx, 0.45, cz), "#5fa8d6");
    // Central pillar
    makeBox(`${tag}_pillar1`, 0.9, 0.9, 0.9, new Vector3(cx, 0.95, cz), stone);
    makeBox(`${tag}_pillar2`, 0.6, 0.6, 0.6, new Vector3(cx, 1.7, cz), stone);
    // Top "spray" — a translucent-looking light-blue cube.
    makeBox(`${tag}_spray`, 0.4, 0.5, 0.4, new Vector3(cx, 2.25, cz), "#cfe7ff");
    // Droplet beads around the pillar
    for (const [dx, dz] of [
      [0.9, 0],
      [-0.9, 0],
      [0, 0.9],
      [0, -0.9],
    ]) {
      makeBox(
        `${tag}_drop_${dx}_${dz}`,
        0.16,
        0.16,
        0.16,
        new Vector3(cx + dx, 1.1, cz + dz),
        "#9bd0ee",
      );
    }
  };

  // Stone slab — used to build the entrance path.
  const makePathSlab = (x: number, z: number, w: number, d: number): void => {
    const tag = `ext_path_${x.toFixed(1)}_${z.toFixed(1)}`;
    makeBox(`${tag}`, w, 0.06, d, new Vector3(x, 0.03, z), "#cdc6b4");
  };

  // ---- Entrance path: from spawn (0, -18) up to the doors at z=-15. ----
  // The office floor begins around z=-15 so the path runs from the front
  // grass to the welcome mat. Three slabs give it a stepping-stone feel.
  for (let i = 0; i < 6; i++) {
    const z = -27 + i * 2;
    makePathSlab(0, z, 3.2, 1.6);
  }
  // A wider stone "apron" right in front of the doors.
  makePathSlab(0, -16.0, 5.0, 1.4);

  // ---- Front lawn (z < -15): fountain + benches + trees + flowers. ----
  // Fountain on the front-left lawn, away from the entrance path.
  makeFountain(-12, -22);
  // Benches flanking the fountain so visitors can sit while they wait.
  makeBench(-15.5, -22, "E");
  makeBench(-8.5, -22, "W");
  // A second bench on the right side facing the path, for symmetry.
  makeBench(10, -19, "S");
  makeBench(-6, -16.5, "S");

  // Trees along the front lawn, offset away from the path and the
  // entrance arc. Mirror across x=0 so the lawn looks balanced.
  const frontTrees: Array<[number, number, number]> = [
    [-26, -20, 1.0],
    [-22, -27, 1.1],
    [-18, -32, 0.9],
    [-10, -29, 1.0],
    [-4, -33, 0.85],
    [4, -33, 0.85],
    [10, -29, 1.0],
    [18, -32, 0.9],
    [22, -27, 1.1],
    [26, -20, 1.0],
    [16, -22, 0.95],
    [-16, -32, 0.8],
  ];
  for (const [x, z, s] of frontTrees) makeTree(x, z, s);

  // Flower patches along the front, dotted between trees.
  const frontFlowers: Array<[number, number]> = [
    [-20, -18],
    [-6, -18],
    [6, -18],
    [20, -18],
    [-14, -26],
    [14, -26],
    [-25, -28],
    [25, -28],
    [-3, -22.5],
    [3, -22.5],
  ];
  for (const [x, z] of frontFlowers) makeFlowerPatch(x, z);

  // Lampposts framing the entrance path.
  makeLamppost(-3.2, -17);
  makeLamppost(3.2, -17);
  makeLamppost(-3.2, -25);
  makeLamppost(3.2, -25);

  // Rocks for visual breakup.
  makeRock(-22, -33, 1.0);
  makeRock(22, -33, 1.0);
  makeRock(-30, -22, 0.9);
  makeRock(30, -22, 0.9);

  // ---- Left side strip (x < -30) ----
  const leftTrees: Array<[number, number, number]> = [
    [-36, -10, 1.0],
    [-40, -2, 1.1],
    [-36, 6, 0.95],
    [-42, 14, 1.05],
    [-37, 22, 1.0],
    [-44, 0, 0.9],
    [-48, 10, 0.85],
    [-46, -8, 0.95],
  ];
  for (const [x, z, s] of leftTrees) makeTree(x, z, s);
  makeFlowerPatch(-34, -4);
  makeFlowerPatch(-34, 12);
  makeFlowerPatch(-39, 18);
  makeBench(-34, 4, "E");
  makeRock(-38, -16, 0.9);
  makeLamppost(-34, 0);
  makeLamppost(-34, 18);

  // ---- Right side strip (x > 30): outdoor staff car park ----
  // Replaces what used to be a row of decorative trees with a small
  // surface car park so the office reads as a real workplace. The car
  // park has an asphalt apron, painted bay markings, a few parked
  // voxel cars, and a one-way driving lane. Moving traffic is wired up
  // separately by `buildOfficeAmbient`.
  buildCarPark(scene, mat);
  // Keep a couple of trees and a lamppost at the far edge so the lot
  // still feels framed by the surrounding green belt.
  makeTree(48, 10, 0.85);
  makeTree(46, -8, 0.95);
  makeTree(37, 22, 1.0);
  makeRock(38, -16, 0.9);
  makeLamppost(34, -10);
  makeLamppost(34, 16);

  // ---- Back strip (z > 25) ----
  const backTrees: Array<[number, number, number]> = [
    [-26, 30, 1.0],
    [-18, 33, 1.1],
    [-10, 30, 0.95],
    [-2, 34, 1.05],
    [6, 30, 0.95],
    [14, 33, 1.0],
    [22, 30, 1.0],
    [26, 36, 0.9],
    [-26, 38, 0.9],
    [0, 40, 1.0],
    [16, 40, 0.95],
    [-14, 40, 0.95],
  ];
  for (const [x, z, s] of backTrees) makeTree(x, z, s);
  makeFlowerPatch(-22, 36);
  makeFlowerPatch(0, 30);
  makeFlowerPatch(20, 36);
  makeRock(-30, 30, 0.9);
  makeRock(30, 30, 0.9);
}

/**
 * Build the outdoor staff car park along the right-hand strip of the
 * office grounds. Layout (looking down at the diorama):
 *
 *   x = 33                                      x = 49
 *   ┌────────────────────────────────────────────────────┐
 *   │ asphalt apron                                       │
 *   │ ── driving lane (one-way, runs north along x≈35) ── │
 *   │  ┌──┬──┬──┬──┬──┬──┬──┬──┐ angled parking bays      │
 *   │  │  │  │  │  │  │  │  │  │ (cars nose-east)         │
 *   │  └──┴──┴──┴──┴──┴──┴──┴──┘                          │
 *   └────────────────────────────────────────────────────┘
 *   z = -12                                       z = +18
 *
 * The lot is purely scenic — no layout points are exposed because the
 * simulation never routes characters here. Moving traffic is added by
 * {@link buildOfficeAmbient}.
 */
function buildCarPark(scene: Scene, mat: MaterialFactory): void {
  const makeBox = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    hex: string,
  ): Mesh => {
    const box = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    box.position = pos;
    box.material = mat(name, hex);
    return box;
  };

  // ----- Asphalt apron -----
  // Sits a hair above the surrounding grass (y = 0) so the boundary
  // reads cleanly without z-fighting against the ground slab.
  const lotCx = 41;
  const lotCz = 3;
  const lotW = 16; // x-extent
  const lotD = 30; // z-extent
  makeBox(
    "carpark_asphalt",
    lotW,
    0.08,
    lotD,
    new Vector3(lotCx, 0.06, lotCz),
    "#3a3d44",
  );

  // ----- Kerb edges -----
  // Light concrete kerb along the long edges so the lot reads as bounded.
  const kerbHex = "#cdc6b4";
  const kerbW = 0.3;
  makeBox(
    "carpark_kerb_w",
    kerbW,
    0.18,
    lotD,
    new Vector3(lotCx - lotW / 2 + kerbW / 2, 0.13, lotCz),
    kerbHex,
  );
  makeBox(
    "carpark_kerb_e",
    kerbW,
    0.18,
    lotD,
    new Vector3(lotCx + lotW / 2 - kerbW / 2, 0.13, lotCz),
    kerbHex,
  );
  makeBox(
    "carpark_kerb_n",
    lotW,
    0.18,
    kerbW,
    new Vector3(lotCx, 0.13, lotCz + lotD / 2 - kerbW / 2),
    kerbHex,
  );
  makeBox(
    "carpark_kerb_s",
    lotW,
    0.18,
    kerbW,
    new Vector3(lotCx, 0.13, lotCz - lotD / 2 + kerbW / 2),
    kerbHex,
  );

  // ----- Painted bay markings -----
  // Eight parking bays along the east half of the lot. Each bay is
  // 3.0 deep (z) and 3.5 wide (x). Stripes are painted on the
  // asphalt at every bay boundary plus a long stop-line on the east
  // kerb side.
  const stripeHex = "#f4f1e8";
  const bayCount = 8;
  const bayDepth = 3.0; // z step between stripes
  const bayWidth = 3.5; // x extent of each bay
  const bayCxX = 44.5; // bay area centre x (east half of lot)
  const firstBayCz = lotCz - ((bayCount - 1) * bayDepth) / 2;
  for (let i = 0; i <= bayCount; i++) {
    const z = firstBayCz - bayDepth / 2 + i * bayDepth;
    makeBox(
      `carpark_bay_stripe_${i}`,
      bayWidth,
      0.02,
      0.12,
      new Vector3(bayCxX, 0.105, z),
      stripeHex,
    );
  }
  // Long stop-line along the wheel-stop side of the bays.
  makeBox(
    "carpark_bay_stopline",
    0.15,
    0.02,
    bayCount * bayDepth,
    new Vector3(bayCxX + bayWidth / 2, 0.105, lotCz),
    stripeHex,
  );

  // Centre-lane dashes along the driving lane (x ≈ 38.5).
  const laneCxX = 38.5;
  for (let i = -6; i <= 6; i++) {
    const z = lotCz + i * 2.0;
    makeBox(
      `carpark_lane_dash_${i + 6}`,
      0.15,
      0.02,
      0.9,
      new Vector3(laneCxX, 0.105, z),
      stripeHex,
    );
  }

  // ----- Wheel stops at the head of each parking bay -----
  for (let i = 0; i < bayCount; i++) {
    const z = firstBayCz + i * bayDepth;
    makeBox(
      `carpark_wheelstop_${i}`,
      0.5,
      0.18,
      bayWidth - 0.6,
      new Vector3(bayCxX + bayWidth / 2 - 0.4, 0.15, z),
      "#9a9486",
    );
  }

  // ----- Parked voxel cars in a few of the bays -----
  // Simple chassis + cabin + windows + four wheels. Cars face west
  // (nose toward the driving lane, i.e. -x), parked nose-out so the
  // silhouettes read clearly when the camera orbits.
  const parkedSpecs: Array<{
    bay: number;
    bodyHex: string;
    topHex: string;
  }> = [
    { bay: 0, bodyHex: "#e84b3a", topHex: "#1c1c1c" },
    { bay: 2, bodyHex: "#3a8fd6", topHex: "#1f5fa0" },
    { bay: 3, bodyHex: "#ffd166", topHex: "#c4a14a" },
    { bay: 5, bodyHex: "#5fa657", topHex: "#3a7a3a" },
    { bay: 7, bodyHex: "#c188d4", topHex: "#3a3a3a" },
  ];
  for (const spec of parkedSpecs) {
    const z = firstBayCz + spec.bay * bayDepth;
    buildParkedCar(scene, mat, new Vector3(bayCxX, 0.1, z), spec.bodyHex, spec.topHex);
  }

  // ----- "P" car-park sign at the south entrance -----
  const signCx = lotCx - lotW / 2 + 0.6;
  const signCz = lotCz - lotD / 2 - 0.8;
  makeBox(
    "carpark_sign_post",
    0.18,
    2.2,
    0.18,
    new Vector3(signCx, 1.1, signCz),
    "#3a3a44",
  );
  const signPlate = makeBox(
    "carpark_sign_plate",
    1.1,
    1.1,
    0.12,
    new Vector3(signCx, 2.1, signCz),
    "#2b6cb0",
  );
  // Paint a big white "P" on the front of the sign plate using a
  // dynamic texture so it's instantly readable from a bird's-eye view.
  const signTex = new DynamicTexture(
    "carpark_sign_tex",
    { width: 128, height: 128 },
    scene,
    false,
  );
  const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#2b6cb0";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#f4f1e8";
  ctx.font = "bold 110px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", 64, 70);
  signTex.update();
  const signMat = new StandardMaterial("carpark_sign_mat", scene);
  signMat.diffuseTexture = signTex;
  signMat.specularColor = new Color3(0.05, 0.05, 0.05);
  signMat.emissiveColor = new Color3(0.2, 0.2, 0.25);
  signPlate.material = signMat;
}

/**
 * Build a single parked voxel car (body + cabin + tinted windows +
 * four wheel cubes). Mirrors the silhouette of the ambient sedans
 * used in the neighbourhood scene so the diorama looks consistent.
 *
 * The car's long axis runs along X (width = 2.4, depth = 1.3) so a
 * row of bays stacked along Z reads as cars parked side-by-side with
 * their noses pointing toward -x (the driving lane).
 */
function buildParkedCar(
  scene: Scene,
  mat: MaterialFactory,
  pos: Vector3,
  bodyHex: string,
  topHex: string,
): void {
  const tag = `carpark_parked_${pos.x.toFixed(1)}_${pos.z.toFixed(1)}`;
  const makeBox = (
    name: string,
    w: number,
    h: number,
    d: number,
    p: Vector3,
    hex: string,
  ): Mesh => {
    const box = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    box.position = p;
    box.material = mat(name, hex);
    return box;
  };
  // Body (long axis on X so the car spans across the bay)
  makeBox(`${tag}_body`, 2.4, 0.7, 1.3, new Vector3(pos.x, pos.y + 0.5, pos.z), bodyHex);
  // Cabin (also oriented with its long axis on X)
  makeBox(`${tag}_top`, 1.4, 0.55, 1.2, new Vector3(pos.x - 0.05, pos.y + 1.1, pos.z), topHex);
  // Windows (slightly inset so the cabin still shows colour)
  makeBox(
    `${tag}_win`,
    1.2,
    0.4,
    1.25,
    new Vector3(pos.x - 0.05, pos.y + 1.1, pos.z),
    "#cfe7ff",
  );
  // Four wheels at the corners
  const wheelHex = "#1c2230";
  for (const [dx, dz] of [
    [0.8, 0.55],
    [-0.8, 0.55],
    [0.8, -0.55],
    [-0.8, -0.55],
  ]) {
    makeBox(
      `${tag}_wheel_${dx}_${dz}`,
      0.4,
      0.4,
      0.3,
      new Vector3(pos.x + dx, pos.y + 0.25, pos.z + dz),
      wheelHex,
    );
  }
}

/**
 * Spawn moving voxel cars that drive through the office car park.
 *
 * Reuses {@link NeighbourhoodAmbient} so the cars have the same
 * silhouette and animation feel as the neighbourhood traffic. The
 * ambient instance ticks itself off `scene.onBeforeRenderObservable`
 * so callers don't have to thread an update callback through the
 * office layout return type.
 */
function buildOfficeAmbient(scene: Scene): void {
  const root = new TransformNode("office_ambient_root", scene);
  const ambient = new NeighbourhoodAmbient(scene, root);

  // Driving lane runs north-south along x ≈ 38.5 (the centre of the
  // car-park lane drawn in {@link buildCarPark}). Two cars loop in
  // opposite-feeling directions for a bit of life. Routes reach
  // beyond the lot bounds at each end so cars enter and exit the
  // diorama from off-screen.
  ambient.addCar(
    "office_carpark_in",
    [
      [38.5, -22],
      [38.5, 18],
    ],
    { type: "sedan", bodyColor: "#3a8fd6", topColor: "#1f5fa0", speed: 3.6 },
  );
  ambient.addCar(
    "office_carpark_out",
    [
      [37.0, 24],
      [37.0, -16],
    ],
    { type: "mini", bodyColor: "#e84b3a", topColor: "#1c1c1c", speed: 3.2 },
  );
  // A slower jeep that also loops along the car-park driving lane,
  // staying entirely within the asphalt strip on the right side of
  // the office. Previously this car crossed in front of the building
  // along z = -12, which cut through the office floor (z ∈ [-15, 25])
  // and the entrance path — visually it looked like the jeep was
  // driving straight into the lobby. Keeping it on the lane (x ≈ 39,
  // z ∈ carpark bounds) ensures cars never drive into buildings.
  ambient.addCar(
    "office_carpark_cross",
    [
      [39.0, -22],
      [39.0, 24],
    ],
    { type: "jeep", bodyColor: "#5fa657", topColor: "#3a7a3a", speed: 2.8 },
  );

  // ----- Ambient lobby cast -----
  // Three voxel staff wander inside the office to bring the space to life:
  //   • a Reception Greeter loops behind the lobby reception desk,
  //   • a Cleaner walks the central aisle between the front and back row
  //     of cubicles (z ≈ 5, well clear of all partition walls), and
  //   • a Parcel Courier paces the front aisle in front of the cubicles
  //     (z ≈ -5, between the cubicle openings and the lobby furniture).
  //
  // Routes were chosen so the walkers never cross any of:
  //   - outer walls (x = ±30, z = +25, front low walls at z = -15),
  //   - cubicle screen partitions (front row: z ∈ [-2.4, 2.6]; back row:
  //     z ∈ [7.6, 12.6]; side walls at cx ± 2.95 for each cubicle), or
  //   - the team-leader glass partition (z = 7.6, x ∈ [-24.25, -17.75]).
  // Each route stays inside an open corridor between those obstacles.
  const greeter = ambient.addPedestrian(
    "office_reception_greeter",
    "receptionGreeter",
    [
      [-17, -9.0],
      [-13, -9.0],
      [-13, -9.0],
      [-17, -9.0],
    ],
    1.1,
  );
  const cleaner = ambient.addPedestrian(
    "office_cleaner",
    "cleaner",
    [
      // Central aisle between front-row (z=0) and back-row (z=10) cubicles.
      // x stays inside [-24, 4] so we miss the team leader office partition
      // (x ≤ -17.75 at z=7.6) and the rightmost cubicle (cx=3, side wall at x=5.95).
      [-24, 5.0],
      [4, 5.0],
      [4, 5.0],
      [-24, 5.0],
    ],
    1.0,
  );
  const courier = ambient.addPedestrian(
    "office_parcel_courier",
    "parcelCourier",
    [
      // Front aisle between cubicles (front opening at z=-2.4) and lobby
      // furniture (sofas at z≈-12). z=-5 keeps clear of both.
      [-20, -5.0],
      [4, -5.0],
      [4, -5.0],
      [-20, -5.0],
    ],
    1.3,
  );

  // Visual props in their hands so each role reads at a glance.
  if (cleaner) {
    attachMop(scene, cleaner);
  }
  if (courier) {
    attachParcel(scene, courier);
  }
  if (greeter) {
    attachClipboard(scene, greeter);
  }

  // Tick the ambient movers each frame the office scene renders. We
  // use the engine's wall-clock delta (capped) so cars move at a
  // sensible speed regardless of frame rate. This intentionally is
  // not scaled by the simulation speed slider — the cars are pure
  // ambient scenery, not part of the claim simulation.
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    ambient.update(dt);
  });
}

/**
 * Attach a tiny voxel mop to the cleaner's right-hand anchor: a long pale
 * pole with a cube of mop "strands" at the bottom. Parented to the held-
 * item anchor so it walks with the cleaner.
 */
function attachMop(scene: Scene, ch: VoxelCharacter): void {
  const anchor = ch.getHandAnchor();
  const tag = ch.id;
  const poleMat = new StandardMaterial(`mopPole_${tag}`, scene);
  poleMat.diffuseColor = Color3.FromHexString("#cdb497");
  poleMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const pole = MeshBuilder.CreateBox(
    `mopPole_${tag}`,
    { width: 0.07, height: 1.4, depth: 0.07 },
    scene,
  );
  pole.parent = anchor;
  pole.position = new Vector3(0.05, 0.7, 0);
  pole.material = poleMat;

  const headMat = new StandardMaterial(`mopHead_${tag}`, scene);
  headMat.diffuseColor = Color3.FromHexString("#f0e6c8");
  headMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const head = MeshBuilder.CreateBox(
    `mopHead_${tag}`,
    { width: 0.45, height: 0.18, depth: 0.25 },
    scene,
  );
  head.parent = anchor;
  head.position = new Vector3(0.05, 0.05, 0);
  head.material = headMat;
}

/** Attach a brown cardboard parcel to the courier's right-hand anchor. */
function attachParcel(scene: Scene, ch: VoxelCharacter): void {
  const anchor = ch.getHandAnchor();
  const tag = ch.id;
  const boxMat = new StandardMaterial(`parcelBox_${tag}`, scene);
  boxMat.diffuseColor = Color3.FromHexString("#b88a64");
  boxMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const box = MeshBuilder.CreateBox(
    `parcelBox_${tag}`,
    { width: 0.55, height: 0.45, depth: 0.5 },
    scene,
  );
  box.parent = anchor;
  box.position = new Vector3(0.0, 0.25, 0.05);
  box.material = boxMat;

  // Cross of packing tape on top.
  const tapeMat = new StandardMaterial(`parcelTape_${tag}`, scene);
  tapeMat.diffuseColor = Color3.FromHexString("#f4ecdb");
  tapeMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const tapeX = MeshBuilder.CreateBox(
    `parcelTapeX_${tag}`,
    { width: 0.6, height: 0.02, depth: 0.08 },
    scene,
  );
  tapeX.parent = anchor;
  tapeX.position = new Vector3(0.0, 0.48, 0.05);
  tapeX.material = tapeMat;
  const tapeZ = MeshBuilder.CreateBox(
    `parcelTapeZ_${tag}`,
    { width: 0.08, height: 0.02, depth: 0.55 },
    scene,
  );
  tapeZ.parent = anchor;
  tapeZ.position = new Vector3(0.0, 0.48, 0.05);
  tapeZ.material = tapeMat;
}

/** Attach a small clipboard to the reception greeter's right-hand anchor. */
function attachClipboard(scene: Scene, ch: VoxelCharacter): void {
  const anchor = ch.getHandAnchor();
  const tag = ch.id;
  const boardMat = new StandardMaterial(`clipBoard_${tag}`, scene);
  boardMat.diffuseColor = Color3.FromHexString("#7a4f2a");
  boardMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const board = MeshBuilder.CreateBox(
    `clipBoard_${tag}`,
    { width: 0.35, height: 0.05, depth: 0.45 },
    scene,
  );
  board.parent = anchor;
  board.position = new Vector3(0.05, 0.2, 0.05);
  board.material = boardMat;

  const paperMat = new StandardMaterial(`clipPaper_${tag}`, scene);
  paperMat.diffuseColor = Color3.FromHexString("#f4ecdb");
  paperMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const paper = MeshBuilder.CreateBox(
    `clipPaper_${tag}`,
    { width: 0.3, height: 0.02, depth: 0.4 },
    scene,
  );
  paper.parent = anchor;
  paper.position = new Vector3(0.05, 0.235, 0.05);
  paper.material = paperMat;
}

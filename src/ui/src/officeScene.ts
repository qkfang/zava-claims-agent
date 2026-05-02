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
 * Layout (bird's-eye, X right / Z forward) — doubled full-floor footprint
 * (60 × 40 units, x∈[-30, 30], z∈[-15, 25]):
 *
 *   z = +25 ┌────────────────────────────────────────────────────────────────┐
 *           │ IT / Cloud Infra Room │ Filing │ Meeting Room │ Kitchen / Break │
 *           ├───────────────────────┴────────┴──────────────┴────────────────┤
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
 * tall office-screen partitions and a coloured floor accent.
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
  // (60 × 40 units). The exterior ground extends well beyond it so the
  // diorama edges don't cut off when the camera pans.
  const ground = MeshBuilder.CreateBox(
    "ground",
    { width: 110, depth: 110, height: 0.4 },
    scene,
  );
  ground.position.y = -0.2;
  ground.material = mat("ground", "#2f3a52");

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
  const doorFrame = mat("doorFrame", "#7a8aa6");
  const leftDoor = MeshBuilder.CreateBox(
    "leftDoor",
    { width: 1.0, height: 2.4, depth: 0.15 },
    scene,
  );
  leftDoor.position = new Vector3(-0.55, 1.2, -15);
  leftDoor.material = doorFrame;
  const rightDoor = leftDoor.clone("rightDoor");
  rightDoor.position.x = 0.55;
  for (const d of [leftDoor, rightDoor]) {
    const glass = MeshBuilder.CreateBox(
      `${d.name}_glass`,
      { width: 0.8, height: 1.6, depth: 0.05 },
      scene,
    );
    glass.position = new Vector3(d.position.x, 1.4, -14.93);
    glass.material = windowMat;
  }
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
  const cubicles: CubicleSpec[] = [
    // Front row (z = 0)
    { label: "intake",         accent: "#3a5fb0", cx: -21, cz: 0, sign: "CLAIMS INTAKE OFFICER" },
    { label: "supplier",       accent: "#2e8a6e", cx: -13, cz: 0, sign: "SUPPLIER COORDINATOR" },
    { label: "settlement",     accent: "#a06a4c", cx:  -5, cz: 0, sign: "SETTLEMENT OFFICER" },
    { label: "communications", accent: "#b56fbf", cx:   3, cz: 0, sign: "CUSTOMER COMMUNICATIONS" },
    // Back row (z = 10) — Team Leader gets the executive corner office
    { label: "assessor",     accent: "#6ec1ff", cx: -13, cz: 10, sign: "CLAIMS ASSESSOR" },
    { label: "lossAdjuster", accent: "#ffb347", cx:  -5, cz: 10, sign: "LOSS ADJUSTER" },
    { label: "fraud",        accent: "#e8504c", cx:   3, cz: 10, sign: "FRAUD INVESTIGATOR" },
  ];
  for (const c of cubicles) {
    buildDepartmentZone(scene, mat, c.label, c.cx, c.cz, c.sign, c.accent);
  }

  // ----- Team Leader executive office (back-far-left) -----
  buildTeamLeaderOffice(scene, mat, new Vector3(-21, 0, 10));

  // ----- Meeting Room (back glass room, mid) -----
  buildMeetingRoom(scene, mat, new Vector3(11, 0, 19.5));

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

  // Printer station tucked between the back rows
  const printer = MeshBuilder.CreateBox(
    "printer",
    { width: 1.0, height: 0.7, depth: 0.7 },
    scene,
  );
  printer.position = new Vector3(8.5, 0.45, 10.0);
  printer.material = mat("printer", "#3a3a44");
  const printerTop = MeshBuilder.CreateBox(
    "printerTop",
    { width: 0.9, height: 0.1, depth: 0.6 },
    scene,
  );
  printerTop.position = new Vector3(8.5, 0.85, 10.0);
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

  // Decorative plants in walkways
  buildPlant(scene, mat, new Vector3(-9.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(-1.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(7.0, 0, -4.5));
  buildPlant(scene, mat, new Vector3(-9.0, 0, 5.0));
  buildPlant(scene, mat, new Vector3(-1.0, 0, 5.0));
  buildPlant(scene, mat, new Vector3(7.0, 0, 5.0));
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
    assessorDeskPoint: new Vector3(-13, 0, 9.4),
    lossAdjusterDeskPoint: new Vector3(-5, 0, 9.4),
    fraudDeskPoint: new Vector3(3, 0, 9.4),
    supplierDeskPoint: new Vector3(-13, 0, -0.6),
    settlementDeskPoint: new Vector3(-5, 0, -0.6),
    communicationsDeskPoint: new Vector3(3, 0, -0.6),
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
  tex.update(false);
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

  // Sign on the back partition
  const sign = MeshBuilder.CreateBox(
    `cubSign_${label}`,
    { width: 4.4, height: 0.7, depth: 0.05 },
    scene,
  );
  sign.position = new Vector3(cx, 1.45, cz + 2.52);
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

  // Voxel-pack flair: pendant lamp above the table, laptops + mugs at each
  // chair, and a centerpiece plant.
  buildPendantLamp(scene, mat, "mrPendantA", new Vector3(origin.x - 1.0, 3.6, origin.z + 0.5), "#ffb347");
  buildPendantLamp(scene, mat, "mrPendantB", new Vector3(origin.x + 1.0, 3.6, origin.z + 0.5), "#ffb347");
  const laptopColors = ["#3a5fb0", "#e8504c", "#2e8a6e", "#a06a4c", "#b56fbf", "#1a1f2c"];
  let i = 0;
  for (const cz of [-0.4, 1.4]) {
    for (const cx of [-1.5, 0, 1.5]) {
      buildLaptop(
        scene,
        mat,
        `mrLaptop_${cx}_${cz}`,
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

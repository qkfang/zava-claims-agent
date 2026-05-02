import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

/**
 * Returns waypoints used by the simulation. Coordinates are in scene units.
 * The office floor occupies roughly x in [-9, 9], z in [-7, 9] with the
 * front entrance at the negative-z side.
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
  /** Reception desk where receptionist agent stands. */
  receptionistDeskPoint: Vector3;
  /** Cubicle desk for the validator. */
  validatorDeskPoint: Vector3;
  /** Cubicle desk for the approver. */
  approverDeskPoint: Vector3;
  /** Filing area for the filer. */
  filerDeskPoint: Vector3;
  /** Shared inbox tray on the reception desk. */
  inboxPoint: Vector3;
  /** Shelf where filed claims rest. */
  archivePoint: Vector3;
}

/**
 * Build the isometric voxel office. All meshes are static; the function
 * returns the layout reference points used by the agent simulation.
 */
export function buildOffice(scene: Scene): OfficeLayout {
  const mat = (name: string, hex: string): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    return m;
  };

  // ----- Floor & exterior ground -----
  const ground = MeshBuilder.CreateBox(
    "ground",
    { width: 40, depth: 40, height: 0.4 },
    scene,
  );
  ground.position.y = -0.2;
  ground.material = mat("ground", "#2f3a52");

  const floor = MeshBuilder.CreateBox(
    "floor",
    { width: 18, depth: 16, height: 0.2 },
    scene,
  );
  floor.position = new Vector3(0, 0.0, 1);
  floor.material = mat("floor", "#e7d8c2");

  // Carpet patch in front of reception
  const carpet = MeshBuilder.CreateBox(
    "carpet",
    { width: 4, depth: 2.5, height: 0.05 },
    scene,
  );
  carpet.position = new Vector3(0, 0.1, -2.6);
  carpet.material = mat("carpet", "#8e5a3a");

  // ----- Walls -----
  const wallMat = mat("wall", "#efd9bf");
  const wallTrim = mat("wallTrim", "#cdb497");

  const makeWall = (
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
  ): Mesh => {
    const wall = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    wall.position = pos;
    wall.material = wallMat;
    return wall;
  };

  // Back wall (with windows cut visually with darker panels)
  makeWall("backWall", 18, 4.2, 0.3, new Vector3(0, 2.1, 9.0));
  // Side walls
  makeWall("leftWall", 0.3, 4.2, 16, new Vector3(-9.0, 2.1, 1));
  makeWall("rightWall", 0.3, 4.2, 16, new Vector3(9.0, 2.1, 1));
  // Front low wall (so we can see inside) with door gap
  makeWall("frontLeft", 6, 1.6, 0.3, new Vector3(-5.5, 0.8, -7));
  makeWall("frontRight", 6, 1.6, 0.3, new Vector3(5.5, 0.8, -7));

  // Trim along the bottom
  const trim = MeshBuilder.CreateBox(
    "trim",
    { width: 18, height: 0.25, depth: 0.35 },
    scene,
  );
  trim.position = new Vector3(0, 0.18, 8.85);
  trim.material = wallTrim;

  // ----- Windows on the back wall -----
  const windowMat = mat("window", "#cfe7ff");
  const windowFrame = mat("windowFrame", "#f6e9d4");
  for (let i = 0; i < 4; i++) {
    const x = -6 + i * 4;
    const frame = MeshBuilder.CreateBox(
      `winFrame_${i}`,
      { width: 2.4, height: 2.6, depth: 0.1 },
      scene,
    );
    frame.position = new Vector3(x, 2.5, 8.84);
    frame.material = windowFrame;

    const glass = MeshBuilder.CreateBox(
      `winGlass_${i}`,
      { width: 2.0, height: 2.2, depth: 0.05 },
      scene,
    );
    glass.position = new Vector3(x, 2.5, 8.79);
    glass.material = windowMat;
  }

  // Side wall window (right)
  const sideWinFrame = MeshBuilder.CreateBox(
    "sideWinFrame",
    { width: 0.1, height: 1.6, depth: 3 },
    scene,
  );
  sideWinFrame.position = new Vector3(8.84, 2.0, 1);
  sideWinFrame.material = windowFrame;
  const sideWinGlass = MeshBuilder.CreateBox(
    "sideWinGlass",
    { width: 0.05, height: 1.3, depth: 2.6 },
    scene,
  );
  sideWinGlass.position = new Vector3(8.79, 2.0, 1);
  sideWinGlass.material = windowMat;

  // ----- Front door (visual) -----
  const door = MeshBuilder.CreateBox(
    "door",
    { width: 1.6, height: 2.6, depth: 0.15 },
    scene,
  );
  door.position = new Vector3(0, 1.3, -7);
  door.material = mat("door", "#7a8aa6");
  const doorGlass = MeshBuilder.CreateBox(
    "doorGlass",
    { width: 1.2, height: 1.8, depth: 0.05 },
    scene,
  );
  doorGlass.position = new Vector3(0, 1.6, -6.95);
  doorGlass.material = windowMat;

  // ----- Reception area (front-left) -----
  const recDeskMat = mat("recDesk", "#a06a4c");
  const recDeskTopMat = mat("recDeskTop", "#d4b596");
  const recBase = MeshBuilder.CreateBox(
    "recDeskBase",
    { width: 4.5, height: 1.0, depth: 1.2 },
    scene,
  );
  recBase.position = new Vector3(-4.5, 0.5, -3);
  recBase.material = recDeskMat;
  const recTop = MeshBuilder.CreateBox(
    "recDeskTop",
    { width: 4.7, height: 0.15, depth: 1.4 },
    scene,
  );
  recTop.position = new Vector3(-4.5, 1.07, -3);
  recTop.material = recDeskTopMat;

  // Inbox tray on reception desk
  const tray = MeshBuilder.CreateBox(
    "inboxTray",
    { width: 0.8, height: 0.1, depth: 0.5 },
    scene,
  );
  tray.position = new Vector3(-3.5, 1.18, -3);
  tray.material = mat("tray", "#3a3a44");
  const trayLabel = MeshBuilder.CreateBox(
    "inboxLabel",
    { width: 0.4, height: 0.02, depth: 0.2 },
    scene,
  );
  trayLabel.position = new Vector3(-3.5, 1.24, -2.85);
  trayLabel.material = mat("trayLabel", "#ffb347");

  // ----- Lobby seating (front-left small sofa & plant) -----
  const sofaMat = mat("sofa", "#7da883");
  const sofaSeat = MeshBuilder.CreateBox(
    "sofaSeat",
    { width: 2.2, height: 0.4, depth: 0.8 },
    scene,
  );
  sofaSeat.position = new Vector3(-7.5, 0.4, -4.5);
  sofaSeat.material = sofaMat;
  const sofaBack = MeshBuilder.CreateBox(
    "sofaBack",
    { width: 2.2, height: 0.6, depth: 0.25 },
    scene,
  );
  sofaBack.position = new Vector3(-7.5, 0.7, -4.95);
  sofaBack.material = sofaMat;

  const plantPot = MeshBuilder.CreateBox(
    "plantPot",
    { width: 0.5, height: 0.4, depth: 0.5 },
    scene,
  );
  plantPot.position = new Vector3(-8.3, 0.2, -3);
  plantPot.material = mat("plantPot", "#6a4a36");
  const plantLeaves = MeshBuilder.CreateBox(
    "plantLeaves",
    { width: 0.9, height: 0.7, depth: 0.9 },
    scene,
  );
  plantLeaves.position = new Vector3(-8.3, 0.8, -3);
  plantLeaves.material = mat("plantLeaves", "#3f7a44");

  // ----- Cubicles row (back-left & back-center) -----
  const cubicleWallMat = mat("cubicle", "#c9b89c");
  const deskMat = mat("desk", "#bca78a");
  const chairMat = mat("chair", "#1c2230");
  const monitorMat = mat("monitor", "#1a1f2c");
  const screenMat = mat("screen", "#6ec1ff");

  const buildCubicle = (cx: number, cz: number): void => {
    // Partition walls (low)
    const partA = MeshBuilder.CreateBox(
      `cubA_${cx}_${cz}`,
      { width: 2.4, height: 1.1, depth: 0.12 },
      scene,
    );
    partA.position = new Vector3(cx, 0.55, cz - 0.95);
    partA.material = cubicleWallMat;

    const partB = MeshBuilder.CreateBox(
      `cubB_${cx}_${cz}`,
      { width: 0.12, height: 1.1, depth: 1.8 },
      scene,
    );
    partB.position = new Vector3(cx + 1.18, 0.55, cz - 0.05);
    partB.material = cubicleWallMat;

    // Desk
    const desk = MeshBuilder.CreateBox(
      `desk_${cx}_${cz}`,
      { width: 2.2, height: 0.1, depth: 1.0 },
      scene,
    );
    desk.position = new Vector3(cx, 0.85, cz - 0.55);
    desk.material = deskMat;
    const deskLeg1 = MeshBuilder.CreateBox(
      `dl1_${cx}_${cz}`,
      { width: 0.1, height: 0.85, depth: 0.1 },
      scene,
    );
    deskLeg1.position = new Vector3(cx - 1.0, 0.42, cz - 0.55);
    deskLeg1.material = deskMat;
    const deskLeg2 = deskLeg1.clone(`dl2_${cx}_${cz}`);
    deskLeg2.position.x = cx + 1.0;

    // Monitor
    const monBase = MeshBuilder.CreateBox(
      `monBase_${cx}_${cz}`,
      { width: 0.3, height: 0.1, depth: 0.2 },
      scene,
    );
    monBase.position = new Vector3(cx - 0.4, 0.95, cz - 0.7);
    monBase.material = monitorMat;
    const monStem = MeshBuilder.CreateBox(
      `monStem_${cx}_${cz}`,
      { width: 0.06, height: 0.25, depth: 0.06 },
      scene,
    );
    monStem.position = new Vector3(cx - 0.4, 1.13, cz - 0.7);
    monStem.material = monitorMat;
    const mon = MeshBuilder.CreateBox(
      `mon_${cx}_${cz}`,
      { width: 0.7, height: 0.45, depth: 0.08 },
      scene,
    );
    mon.position = new Vector3(cx - 0.4, 1.38, cz - 0.72);
    mon.material = monitorMat;
    const screen = MeshBuilder.CreateBox(
      `screen_${cx}_${cz}`,
      { width: 0.6, height: 0.36, depth: 0.02 },
      scene,
    );
    screen.position = new Vector3(cx - 0.4, 1.38, cz - 0.68);
    screen.material = screenMat;

    // Chair
    const chairSeat = MeshBuilder.CreateBox(
      `chair_${cx}_${cz}`,
      { width: 0.55, height: 0.1, depth: 0.55 },
      scene,
    );
    chairSeat.position = new Vector3(cx, 0.55, cz + 0.4);
    chairSeat.material = chairMat;
    const chairBack = MeshBuilder.CreateBox(
      `chairB_${cx}_${cz}`,
      { width: 0.55, height: 0.7, depth: 0.1 },
      scene,
    );
    chairBack.position = new Vector3(cx, 0.9, cz + 0.65);
    chairBack.material = chairMat;
  };

  // Two cubicles back-left
  buildCubicle(-5, 6);
  buildCubicle(-2, 6);
  // Two cubicles back-right
  buildCubicle(2, 6);
  buildCubicle(5, 6);

  // ----- Filing / archive area (center back) -----
  const shelfMat = mat("shelf", "#3b4d72");
  const shelfTrim = mat("shelfTrim", "#26334d");
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const x = -2.4 + col * 1.6;
      const z = 2.5 - row * 1.0;
      const shelf = MeshBuilder.CreateBox(
        `shelf_${row}_${col}`,
        { width: 1.4, height: 1.6, depth: 0.8 },
        scene,
      );
      shelf.position = new Vector3(x, 0.8, z);
      shelf.material = shelfMat;
      // Stripes
      for (let s = 0; s < 3; s++) {
        const stripe = MeshBuilder.CreateBox(
          `shelfTrim_${row}_${col}_${s}`,
          { width: 1.42, height: 0.05, depth: 0.82 },
          scene,
        );
        stripe.position = new Vector3(x, 0.4 + s * 0.5, z);
        stripe.material = shelfTrim;
      }
    }
  }

  // Stacked claim "barrels" / boxes pile (foreground left of shelves)
  const boxMat = mat("box", "#324a6e");
  const boxTrim = mat("boxTrim", "#1c2c44");
  const stackPositions: Array<[number, number, number]> = [
    [-4.2, 0.4, 0.5],
    [-4.2, 0.4, 1.4],
    [-3.4, 0.4, 0.5],
    [-3.4, 0.4, 1.4],
    [-3.8, 1.2, 1.0],
  ];
  for (const [x, y, z] of stackPositions) {
    const box = MeshBuilder.CreateBox(
      `boxStack_${x}_${z}`,
      { width: 0.7, height: 0.7, depth: 0.7 },
      scene,
    );
    box.position = new Vector3(x, y, z);
    box.material = boxMat;
    const ring = MeshBuilder.CreateBox(
      `boxRing_${x}_${z}`,
      { width: 0.72, height: 0.08, depth: 0.72 },
      scene,
    );
    ring.position = new Vector3(x, y + 0.1, z);
    ring.material = boxTrim;
  }

  return {
    spawnPoint: new Vector3(0, 0, -10),
    entrancePoint: new Vector3(0, 0, -6),
    receptionPoint: new Vector3(-4.2, 0, -3.9),
    exitPoint: new Vector3(0, 0, -10),
    receptionistDeskPoint: new Vector3(-4.5, 0, -2.2),
    validatorDeskPoint: new Vector3(-3.5, 0, 5.4),
    approverDeskPoint: new Vector3(3.5, 0, 5.4),
    filerDeskPoint: new Vector3(-3.8, 0, 1.0),
    inboxPoint: new Vector3(-3.5, 1.25, -3),
    archivePoint: new Vector3(-1.6, 1.4, 2.5),
  };
}

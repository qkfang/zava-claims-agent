import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { PALETTES, VoxelCharacter } from "./voxelCharacter";
import type { ScenarioId } from "./personaData";

/**
 * Per-frame mover used for ambient cars / pedestrians / pets in the
 * neighbourhood scene. Each mover owns one or more meshes and advances
 * itself toward the next waypoint on every tick.
 */
interface Mover {
  update(dtSec: number): void;
  /** Optional disposal hook (currently unused — neighbourhood is permanent). */
  dispose?(): void;
}

/**
 * A scripted incident animation tied to a customer scenario.
 *
 * The animation is restartable: `start()` snaps everything to its
 * baseline and replays the sequence. `update(dt)` advances the
 * elapsed-time-driven keyframes.
 */
interface IncidentAnimation {
  start(): void;
  stop(): void;
  update(dtSec: number): void;
  /** Total duration of the scripted sequence in seconds. */
  durationSec: number;
}

/**
 * Vehicle types supported by {@link NeighbourhoodAmbient.addCar}. Each
 * variant has a distinctive voxel silhouette so a row of ambient
 * traffic feels varied instead of "five identical sedans".
 */
export type VehicleType =
  | "sedan"
  | "jeep"
  | "mini"
  | "bicycle"
  | "scooter";

/**
 * Build a simple voxel sedan (chassis + cabin + windows + four wheels)
 * parented under a single TransformNode the caller can move and rotate.
 *
 * The car's long axis runs along local +Z so that `parent.rotation.y =
 * Math.atan2(nx, nz)` (which yields 0 when travelling +Z) orients the
 * car correctly along its direction of travel.
 */
export function buildCarMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 1.3, height: 0.7, depth: 2.4 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.5, 0);
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  body.material = bodyMat;

  const top = MeshBuilder.CreateBox(
    `${parent.name}_top`,
    { width: 1.2, height: 0.55, depth: 1.4 },
    scene,
  );
  top.parent = parent;
  top.position = new Vector3(0, 1.1, 0);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  top.material = topMat;

  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.25, height: 0.4, depth: 1.2 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.1, 0);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");
  winMat.specularColor = new Color3(0.1, 0.1, 0.1);
  win.material = winMat;

  // Four wheels (just dark boxes). Wheel positions sit at the four
  // corners of the body (which now runs along local +Z), with the wheels'
  // narrow axis pointing outward from the sides of the car.
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.55, 0.8],
    [-0.55, 0.8],
    [0.55, -0.8],
    [-0.55, -0.8],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.25, height: 0.45, depth: 0.45 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.22, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a chunky voxel jeep / SUV (taller cabin, exposed roll cage,
 * larger wheels). Long axis runs along local +Z, matching the sedan.
 */
export function buildJeepMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");

  // Tall, square chassis.
  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 1.45, height: 0.85, depth: 2.2 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.6, 0);
  body.material = bodyMat;

  // Boxy upright cabin sitting almost square on the chassis.
  const cab = MeshBuilder.CreateBox(
    `${parent.name}_cab`,
    { width: 1.35, height: 0.85, depth: 1.6 },
    scene,
  );
  cab.parent = parent;
  cab.position = new Vector3(0, 1.45, -0.1);
  cab.material = topMat;

  // Front windscreen.
  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.4, height: 0.5, depth: 1.55 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.55, -0.1);
  win.material = winMat;

  // Front grille / bull bar.
  const grille = MeshBuilder.CreateBox(
    `${parent.name}_grille`,
    { width: 1.5, height: 0.35, depth: 0.18 },
    scene,
  );
  grille.parent = parent;
  grille.position = new Vector3(0, 0.5, 1.15);
  const grilleMat = new StandardMaterial(`${parent.name}_grille_mat`, scene);
  grilleMat.diffuseColor = Color3.FromHexString("#1c2230");
  grille.material = grilleMat;

  // Spare wheel on the back.
  const spare = MeshBuilder.CreateBox(
    `${parent.name}_spare`,
    { width: 0.55, height: 0.55, depth: 0.18 },
    scene,
  );
  spare.parent = parent;
  spare.position = new Vector3(0, 0.95, -1.2);
  const spareMat = new StandardMaterial(`${parent.name}_spare_mat`, scene);
  spareMat.diffuseColor = Color3.FromHexString("#1c2230");
  spare.material = spareMat;

  // Four chunky wheels.
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.65, 0.8],
    [-0.65, 0.8],
    [0.65, -0.8],
    [-0.65, -0.8],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.3, height: 0.6, depth: 0.6 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.3, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a chunky voxel fire truck: long red chassis, forward cab with
 * windscreen, blue roof light bar, side ladder and six wheels. Long
 * axis runs along local +Z (cab forward at +Z) so the same orientation
 * convention as {@link buildCarMeshes} / {@link buildJeepMeshes}
 * applies.
 */
export function buildFireTruckMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");
  const darkMat = new StandardMaterial(`${parent.name}_dark_mat`, scene);
  darkMat.diffuseColor = Color3.FromHexString("#1c2230");
  const ladderMat = new StandardMaterial(`${parent.name}_ladder_mat`, scene);
  ladderMat.diffuseColor = Color3.FromHexString("#b8b0a0");
  const lightMat = new StandardMaterial(`${parent.name}_light_mat`, scene);
  lightMat.diffuseColor = Color3.FromHexString("#3a8fd6");
  lightMat.emissiveColor = Color3.FromHexString("#1a4a7a");

  // Pump / tank body — long red rear section.
  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 1.5, height: 1.1, depth: 2.6 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.75, -0.4);
  body.material = bodyMat;

  // Forward cab (slightly narrower, taller).
  const cab = MeshBuilder.CreateBox(
    `${parent.name}_cab`,
    { width: 1.4, height: 1.0, depth: 1.2 },
    scene,
  );
  cab.parent = parent;
  cab.position = new Vector3(0, 1.0, 1.3);
  cab.material = topMat;

  // Wraparound windscreen on the cab.
  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.42, height: 0.45, depth: 1.15 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.25, 1.35);
  win.material = winMat;

  // Roof-mounted light bar.
  const light = MeshBuilder.CreateBox(
    `${parent.name}_light`,
    { width: 0.9, height: 0.22, depth: 0.5 },
    scene,
  );
  light.parent = parent;
  light.position = new Vector3(0, 1.6, 1.3);
  light.material = lightMat;

  // Ladder along the roof of the rear tank.
  const ladder = MeshBuilder.CreateBox(
    `${parent.name}_ladder`,
    { width: 0.4, height: 0.12, depth: 2.4 },
    scene,
  );
  ladder.parent = parent;
  ladder.position = new Vector3(0, 1.4, -0.4);
  ladder.material = ladderMat;

  // Front grille / bumper.
  const grille = MeshBuilder.CreateBox(
    `${parent.name}_grille`,
    { width: 1.45, height: 0.35, depth: 0.18 },
    scene,
  );
  grille.parent = parent;
  grille.position = new Vector3(0, 0.55, 1.95);
  grille.material = darkMat;

  // Six wheels — two front (under cab) and four rear (under tank).
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.7, 1.3],
    [-0.7, 1.3],
    [0.7, 0.0],
    [-0.7, 0.0],
    [0.7, -1.3],
    [-0.7, -1.3],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.28, height: 0.55, depth: 0.55 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.27, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a chunky voxel panel van: long boxy cargo body, slightly
 * shorter forward cab with windscreen, four wheels, and a sliding
 * side door panel. Long axis runs along local +Z (cab at +Z front).
 */
export function buildVanMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");
  const darkMat = new StandardMaterial(`${parent.name}_dark_mat`, scene);
  darkMat.diffuseColor = Color3.FromHexString("#1c2230");

  // Tall cargo box (rear section).
  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 1.35, height: 1.35, depth: 1.7 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.85, -0.45);
  body.material = bodyMat;

  // Slightly shorter forward cab.
  const cab = MeshBuilder.CreateBox(
    `${parent.name}_cab`,
    { width: 1.3, height: 1.0, depth: 1.1 },
    scene,
  );
  cab.parent = parent;
  cab.position = new Vector3(0, 1.0, 0.85);
  cab.material = topMat;

  // Windscreen.
  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.32, height: 0.45, depth: 1.05 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.25, 0.9);
  win.material = winMat;

  // Side door panel (slightly recessed look via a darker stripe).
  const door = MeshBuilder.CreateBox(
    `${parent.name}_door`,
    { width: 1.38, height: 0.7, depth: 0.7 },
    scene,
  );
  door.parent = parent;
  door.position = new Vector3(0, 0.85, -0.45);
  const doorMat = new StandardMaterial(`${parent.name}_door_mat`, scene);
  doorMat.diffuseColor = Color3.FromHexString(topHex);
  doorMat.specularColor = new Color3(0.05, 0.05, 0.05);
  door.material = doorMat;

  // Front grille / bumper.
  const grille = MeshBuilder.CreateBox(
    `${parent.name}_grille`,
    { width: 1.32, height: 0.3, depth: 0.16 },
    scene,
  );
  grille.parent = parent;
  grille.position = new Vector3(0, 0.45, 1.45);
  grille.material = darkMat;

  // Four wheels.
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.6, 0.85],
    [-0.6, 0.85],
    [0.6, -1.0],
    [-0.6, -1.0],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.25, height: 0.5, depth: 0.5 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.25, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a chunky voxel flatbed tow truck: forward cab with windscreen,
 * a long flat tow tray behind, vertical headboard with a small boom
 * arm and dangling hook, amber roof light bar, and four wheels. Long
 * axis runs along local +Z (cab forward at +Z, deck and hook trailing
 * toward -Z), matching {@link buildCarMeshes} / {@link buildVanMeshes}.
 */
export function buildTowTruckMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");
  const darkMat = new StandardMaterial(`${parent.name}_dark_mat`, scene);
  darkMat.diffuseColor = Color3.FromHexString("#1c2230");
  const amberMat = new StandardMaterial(`${parent.name}_amber_mat`, scene);
  amberMat.diffuseColor = Color3.FromHexString("#ffb347");
  amberMat.emissiveColor = Color3.FromHexString("#7a4a00");

  // Chassis rail running the full length under the cab and tow tray.
  const chassis = MeshBuilder.CreateBox(
    `${parent.name}_chassis`,
    { width: 1.3, height: 0.4, depth: 4.0 },
    scene,
  );
  chassis.parent = parent;
  chassis.position = new Vector3(0, 0.5, -0.3);
  chassis.material = bodyMat;

  // Forward cab.
  const cab = MeshBuilder.CreateBox(
    `${parent.name}_cab`,
    { width: 1.35, height: 1.0, depth: 1.2 },
    scene,
  );
  cab.parent = parent;
  cab.position = new Vector3(0, 1.2, 1.2);
  cab.material = topMat;

  // Cab windscreen.
  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.37, height: 0.45, depth: 1.15 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.45, 1.25);
  win.material = winMat;

  // Amber light bar on the cab roof.
  const light = MeshBuilder.CreateBox(
    `${parent.name}_light`,
    { width: 0.7, height: 0.18, depth: 0.4 },
    scene,
  );
  light.parent = parent;
  light.position = new Vector3(0, 1.8, 1.2);
  light.material = amberMat;

  // Flat tow tray behind the cab.
  const deck = MeshBuilder.CreateBox(
    `${parent.name}_deck`,
    { width: 1.3, height: 0.18, depth: 2.4 },
    scene,
  );
  deck.parent = parent;
  deck.position = new Vector3(0, 0.85, -0.8);
  deck.material = bodyMat;

  // Low side rails along the tow tray.
  for (const dx of [0.62, -0.62]) {
    const rail = MeshBuilder.CreateBox(
      `${parent.name}_rail_${dx}`,
      { width: 0.08, height: 0.22, depth: 2.4 },
      scene,
    );
    rail.parent = parent;
    rail.position = new Vector3(dx, 1.05, -0.8);
    rail.material = topMat;
  }

  // Headboard at the front of the tray (just behind the cab).
  const head = MeshBuilder.CreateBox(
    `${parent.name}_headboard`,
    { width: 1.3, height: 0.6, depth: 0.18 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0, 1.25, 0.45);
  head.material = topMat;

  // Vertical boom post on top of the headboard.
  const post = MeshBuilder.CreateBox(
    `${parent.name}_post`,
    { width: 0.2, height: 0.7, depth: 0.2 },
    scene,
  );
  post.parent = parent;
  post.position = new Vector3(0, 1.85, 0.45);
  post.material = darkMat;

  // Boom arm extending back from the post over the tray.
  const boom = MeshBuilder.CreateBox(
    `${parent.name}_boom`,
    { width: 0.18, height: 0.18, depth: 1.6 },
    scene,
  );
  boom.parent = parent;
  boom.position = new Vector3(0, 2.1, -0.35);
  boom.material = darkMat;

  // Chain hanging off the rear end of the boom.
  const chain = MeshBuilder.CreateBox(
    `${parent.name}_chain`,
    { width: 0.06, height: 0.55, depth: 0.06 },
    scene,
  );
  chain.parent = parent;
  chain.position = new Vector3(0, 1.78, -1.15);
  chain.material = darkMat;

  // Hook block at the bottom of the chain.
  const hook = MeshBuilder.CreateBox(
    `${parent.name}_hook`,
    { width: 0.24, height: 0.22, depth: 0.24 },
    scene,
  );
  hook.parent = parent;
  hook.position = new Vector3(0, 1.45, -1.15);
  hook.material = darkMat;

  // Front grille / bumper.
  const grille = MeshBuilder.CreateBox(
    `${parent.name}_grille`,
    { width: 1.32, height: 0.32, depth: 0.18 },
    scene,
  );
  grille.parent = parent;
  grille.position = new Vector3(0, 0.55, 1.85);
  grille.material = darkMat;

  // Four wheels.
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.6, 1.15],
    [-0.6, 1.15],
    [0.6, -1.45],
    [-0.6, -1.45],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.25, height: 0.5, depth: 0.5 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.25, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a stubby voxel Mini Cooper-style hatchback: short, rounded
 * silhouette with a contrasting roof stripe. Long axis runs along
 * local +Z.
 */
function buildMiniCooperMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  topHex: string,
): void {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const topMat = new StandardMaterial(`${parent.name}_top_mat`, scene);
  topMat.diffuseColor = Color3.FromHexString(topHex);
  const winMat = new StandardMaterial(`${parent.name}_win_mat`, scene);
  winMat.diffuseColor = Color3.FromHexString("#cfe7ff");

  // Short, squat body.
  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 1.2, height: 0.65, depth: 1.9 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.45, 0);
  body.material = bodyMat;

  // Rounded cabin slightly inset.
  const top = MeshBuilder.CreateBox(
    `${parent.name}_top`,
    { width: 1.1, height: 0.55, depth: 1.05 },
    scene,
  );
  top.parent = parent;
  top.position = new Vector3(0, 1.05, -0.05);
  top.material = topMat;

  // Wraparound windows.
  const win = MeshBuilder.CreateBox(
    `${parent.name}_win`,
    { width: 1.15, height: 0.32, depth: 0.95 },
    scene,
  );
  win.parent = parent;
  win.position = new Vector3(0, 1.1, -0.05);
  win.material = winMat;

  // Roof stripe (contrast).
  const stripeMat = new StandardMaterial(`${parent.name}_stripe_mat`, scene);
  stripeMat.diffuseColor = Color3.FromHexString("#f8f8f8");
  const stripe = MeshBuilder.CreateBox(
    `${parent.name}_stripe`,
    { width: 0.5, height: 0.06, depth: 1.05 },
    scene,
  );
  stripe.parent = parent;
  stripe.position = new Vector3(0, 1.36, -0.05);
  stripe.material = stripeMat;

  // Headlights (round-ish blocks).
  const headMat = new StandardMaterial(`${parent.name}_head_mat`, scene);
  headMat.diffuseColor = Color3.FromHexString("#fff5c8");
  headMat.emissiveColor = Color3.FromHexString("#fff5c8").scale(0.3);
  for (const dx of [-0.4, 0.4]) {
    const h = MeshBuilder.CreateBox(
      `${parent.name}_head_${dx}`,
      { width: 0.22, height: 0.22, depth: 0.08 },
      scene,
    );
    h.parent = parent;
    h.position = new Vector3(dx, 0.5, 0.95);
    h.material = headMat;
  }

  // Four small wheels.
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");
  for (const [dx, dz] of [
    [0.5, 0.65],
    [-0.5, 0.65],
    [0.5, -0.65],
    [-0.5, -0.65],
  ] as Array<[number, number]>) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dx}_${dz}`,
      { width: 0.22, height: 0.42, depth: 0.42 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(dx, 0.2, dz);
    w.material = wheelMat;
  }
}

/**
 * Build a voxel bicycle with a rider (frame + two wheels + handlebar +
 * seat + simple cyclist). Long axis runs along local +Z.
 */
function buildBicycleMeshes(
  scene: Scene,
  parent: TransformNode,
  frameHex: string,
  shirtHex: string,
): void {
  const frameMat = new StandardMaterial(`${parent.name}_frame_mat`, scene);
  frameMat.diffuseColor = Color3.FromHexString(frameHex);
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");

  // Two thin wheels.
  for (const dz of [0.6, -0.6]) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dz}`,
      { width: 0.1, height: 0.55, depth: 0.55 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(0, 0.3, dz);
    w.material = wheelMat;
  }

  // Frame: top tube + down tube approximated as two boxes.
  const top = MeshBuilder.CreateBox(
    `${parent.name}_frame_top`,
    { width: 0.1, height: 0.1, depth: 1.0 },
    scene,
  );
  top.parent = parent;
  top.position = new Vector3(0, 0.7, 0);
  top.material = frameMat;
  const down = MeshBuilder.CreateBox(
    `${parent.name}_frame_down`,
    { width: 0.1, height: 0.1, depth: 0.9 },
    scene,
  );
  down.parent = parent;
  down.position = new Vector3(0, 0.45, 0.05);
  down.material = frameMat;

  // Seat.
  const seatMat = new StandardMaterial(`${parent.name}_seat_mat`, scene);
  seatMat.diffuseColor = Color3.FromHexString("#1c2230");
  const seat = MeshBuilder.CreateBox(
    `${parent.name}_seat`,
    { width: 0.18, height: 0.08, depth: 0.3 },
    scene,
  );
  seat.parent = parent;
  seat.position = new Vector3(0, 0.92, -0.45);
  seat.material = seatMat;

  // Handlebars.
  const bar = MeshBuilder.CreateBox(
    `${parent.name}_bar`,
    { width: 0.5, height: 0.08, depth: 0.08 },
    scene,
  );
  bar.parent = parent;
  bar.position = new Vector3(0, 0.95, 0.55);
  bar.material = frameMat;

  // Rider: torso + head + arms + legs (no animation — silhouette only).
  const skinMat = new StandardMaterial(`${parent.name}_skin_mat`, scene);
  skinMat.diffuseColor = Color3.FromHexString("#e9c8a3");
  const shirtMat = new StandardMaterial(`${parent.name}_shirt_mat`, scene);
  shirtMat.diffuseColor = Color3.FromHexString(shirtHex);
  const trouserMat = new StandardMaterial(`${parent.name}_trouser_mat`, scene);
  trouserMat.diffuseColor = Color3.FromHexString("#2c3a52");

  const torso = MeshBuilder.CreateBox(
    `${parent.name}_torso`,
    { width: 0.45, height: 0.55, depth: 0.35 },
    scene,
  );
  torso.parent = parent;
  torso.position = new Vector3(0, 1.25, -0.25);
  torso.material = shirtMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.4, height: 0.4, depth: 0.4 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0, 1.7, -0.1);
  head.material = skinMat;

  // Helmet.
  const helmetMat = new StandardMaterial(`${parent.name}_helmet_mat`, scene);
  helmetMat.diffuseColor = Color3.FromHexString(frameHex);
  const helmet = MeshBuilder.CreateBox(
    `${parent.name}_helmet`,
    { width: 0.46, height: 0.18, depth: 0.46 },
    scene,
  );
  helmet.parent = parent;
  helmet.position = new Vector3(0, 1.95, -0.1);
  helmet.material = helmetMat;

  // Legs angled forward toward pedals.
  for (const dx of [-0.12, 0.12]) {
    const leg = MeshBuilder.CreateBox(
      `${parent.name}_leg_${dx}`,
      { width: 0.16, height: 0.55, depth: 0.16 },
      scene,
    );
    leg.parent = parent;
    leg.position = new Vector3(dx, 0.65, -0.1);
    leg.material = trouserMat;
  }
}

/**
 * Build a voxel kick scooter with a standing rider. Long axis runs
 * along local +Z (deck stretches forward to back).
 */
function buildScooterMeshes(
  scene: Scene,
  parent: TransformNode,
  deckHex: string,
  shirtHex: string,
): void {
  const deckMat = new StandardMaterial(`${parent.name}_deck_mat`, scene);
  deckMat.diffuseColor = Color3.FromHexString(deckHex);
  const wheelMat = new StandardMaterial(`${parent.name}_wheel_mat`, scene);
  wheelMat.diffuseColor = Color3.FromHexString("#1c2230");

  // Deck.
  const deck = MeshBuilder.CreateBox(
    `${parent.name}_deck`,
    { width: 0.3, height: 0.1, depth: 1.2 },
    scene,
  );
  deck.parent = parent;
  deck.position = new Vector3(0, 0.25, 0);
  deck.material = deckMat;

  // Wheels.
  for (const dz of [0.55, -0.55]) {
    const w = MeshBuilder.CreateBox(
      `${parent.name}_wheel_${dz}`,
      { width: 0.12, height: 0.32, depth: 0.32 },
      scene,
    );
    w.parent = parent;
    w.position = new Vector3(0, 0.18, dz);
    w.material = wheelMat;
  }

  // Stem + handlebar.
  const stem = MeshBuilder.CreateBox(
    `${parent.name}_stem`,
    { width: 0.1, height: 1.1, depth: 0.1 },
    scene,
  );
  stem.parent = parent;
  stem.position = new Vector3(0, 0.85, 0.55);
  stem.material = deckMat;
  const bar = MeshBuilder.CreateBox(
    `${parent.name}_bar`,
    { width: 0.5, height: 0.08, depth: 0.08 },
    scene,
  );
  bar.parent = parent;
  bar.position = new Vector3(0, 1.35, 0.55);
  bar.material = deckMat;

  // Rider standing on the deck.
  const skinMat = new StandardMaterial(`${parent.name}_skin_mat`, scene);
  skinMat.diffuseColor = Color3.FromHexString("#e9c8a3");
  const shirtMat = new StandardMaterial(`${parent.name}_shirt_mat`, scene);
  shirtMat.diffuseColor = Color3.FromHexString(shirtHex);
  const trouserMat = new StandardMaterial(`${parent.name}_trouser_mat`, scene);
  trouserMat.diffuseColor = Color3.FromHexString("#2c3a52");

  for (const dx of [-0.1, 0.1]) {
    const leg = MeshBuilder.CreateBox(
      `${parent.name}_leg_${dx}`,
      { width: 0.16, height: 0.55, depth: 0.18 },
      scene,
    );
    leg.parent = parent;
    leg.position = new Vector3(dx, 0.6, 0);
    leg.material = trouserMat;
  }

  const torso = MeshBuilder.CreateBox(
    `${parent.name}_torso`,
    { width: 0.45, height: 0.55, depth: 0.35 },
    scene,
  );
  torso.parent = parent;
  torso.position = new Vector3(0, 1.2, 0);
  torso.material = shirtMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.4, height: 0.4, depth: 0.4 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0, 1.65, 0.05);
  head.material = skinMat;
}

/**
 * Dispatch to the correct vehicle builder based on `type`.
 */
function buildVehicleMeshes(
  scene: Scene,
  parent: TransformNode,
  type: VehicleType,
  bodyHex: string,
  topHex: string,
): void {
  switch (type) {
    case "jeep":
      buildJeepMeshes(scene, parent, bodyHex, topHex);
      return;
    case "mini":
      buildMiniCooperMeshes(scene, parent, bodyHex, topHex);
      return;
    case "bicycle":
      buildBicycleMeshes(scene, parent, bodyHex, topHex);
      return;
    case "scooter":
      buildScooterMeshes(scene, parent, bodyHex, topHex);
      return;
    case "sedan":
    default:
      buildCarMeshes(scene, parent, bodyHex, topHex);
      return;
  }
}

/**
 * Build a small voxel dog (body + head + tail + 4 legs) parented under a
 * single TransformNode. Tail wags via a child pivot; legs jiggle while
 * walking.
 */
function buildDogMeshes(
  scene: Scene,
  parent: TransformNode,
  furHex: string,
): {
  legs: Mesh[];
  tail: TransformNode;
} {
  const furMat = new StandardMaterial(`${parent.name}_fur_mat`, scene);
  furMat.diffuseColor = Color3.FromHexString(furHex);
  furMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const noseMat = new StandardMaterial(`${parent.name}_nose_mat`, scene);
  noseMat.diffuseColor = Color3.FromHexString("#1c2230");

  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 0.9, height: 0.45, depth: 0.5 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.45, 0);
  body.material = furMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.45, height: 0.45, depth: 0.45 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0.55, 0.6, 0);
  head.material = furMat;

  const nose = MeshBuilder.CreateBox(
    `${parent.name}_nose`,
    { width: 0.18, height: 0.18, depth: 0.18 },
    scene,
  );
  nose.parent = parent;
  nose.position = new Vector3(0.85, 0.55, 0);
  nose.material = noseMat;

  // Tail with a pivot so it can wag.
  const tailPivot = new TransformNode(`${parent.name}_tail_pivot`, scene);
  tailPivot.parent = parent;
  tailPivot.position = new Vector3(-0.45, 0.55, 0);
  const tail = MeshBuilder.CreateBox(
    `${parent.name}_tail`,
    { width: 0.25, height: 0.12, depth: 0.12 },
    scene,
  );
  tail.parent = tailPivot;
  tail.position = new Vector3(-0.15, 0.05, 0);
  tail.material = furMat;

  // Legs.
  const legs: Mesh[] = [];
  for (const [dx, dz] of [
    [0.3, 0.18],
    [-0.3, 0.18],
    [0.3, -0.18],
    [-0.3, -0.18],
  ] as Array<[number, number]>) {
    const leg = MeshBuilder.CreateBox(
      `${parent.name}_leg_${dx}_${dz}`,
      { width: 0.16, height: 0.3, depth: 0.16 },
      scene,
    );
    leg.parent = parent;
    leg.position = new Vector3(dx, 0.18, dz);
    leg.material = furMat;
    legs.push(leg);
  }

  return { legs, tail: tailPivot };
}

/**
 * Pet types supported by {@link NeighbourhoodAmbient.addPet}.
 */
export type PetType = "dog" | "cat" | "rabbit";

/**
 * Build a small voxel cat (slim body + perked ears + upright tail).
 * Same return contract as {@link buildDogMeshes} so the wandering
 * mover can drive it identically.
 */
function buildCatMeshes(
  scene: Scene,
  parent: TransformNode,
  furHex: string,
): {
  legs: Mesh[];
  tail: TransformNode;
} {
  const furMat = new StandardMaterial(`${parent.name}_fur_mat`, scene);
  furMat.diffuseColor = Color3.FromHexString(furHex);
  furMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const darkMat = new StandardMaterial(`${parent.name}_dark_mat`, scene);
  darkMat.diffuseColor = Color3.FromHexString("#1c2230");

  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 0.75, height: 0.35, depth: 0.4 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.4, 0);
  body.material = furMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.38, height: 0.38, depth: 0.38 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0.5, 0.55, 0);
  head.material = furMat;

  // Two pointy ears.
  for (const dz of [-0.1, 0.1]) {
    const ear = MeshBuilder.CreateBox(
      `${parent.name}_ear_${dz}`,
      { width: 0.12, height: 0.18, depth: 0.12 },
      scene,
    );
    ear.parent = parent;
    ear.position = new Vector3(0.5, 0.82, dz);
    ear.material = furMat;
  }

  // Nose.
  const nose = MeshBuilder.CreateBox(
    `${parent.name}_nose`,
    { width: 0.12, height: 0.12, depth: 0.12 },
    scene,
  );
  nose.parent = parent;
  nose.position = new Vector3(0.72, 0.5, 0);
  nose.material = darkMat;

  // Upright tail with pivot at the base for a gentle sway.
  const tailPivot = new TransformNode(`${parent.name}_tail_pivot`, scene);
  tailPivot.parent = parent;
  tailPivot.position = new Vector3(-0.38, 0.5, 0);
  const tail = MeshBuilder.CreateBox(
    `${parent.name}_tail`,
    { width: 0.12, height: 0.5, depth: 0.12 },
    scene,
  );
  tail.parent = tailPivot;
  tail.position = new Vector3(-0.05, 0.25, 0);
  tail.material = furMat;

  const legs: Mesh[] = [];
  for (const [dx, dz] of [
    [0.25, 0.14],
    [-0.25, 0.14],
    [0.25, -0.14],
    [-0.25, -0.14],
  ] as Array<[number, number]>) {
    const leg = MeshBuilder.CreateBox(
      `${parent.name}_leg_${dx}_${dz}`,
      { width: 0.13, height: 0.28, depth: 0.13 },
      scene,
    );
    leg.parent = parent;
    leg.position = new Vector3(dx, 0.16, dz);
    leg.material = furMat;
    legs.push(leg);
  }

  return { legs, tail: tailPivot };
}

/**
 * Build a small voxel rabbit (round body + tall ears + puff tail).
 * Same return contract as {@link buildDogMeshes}.
 */
function buildRabbitMeshes(
  scene: Scene,
  parent: TransformNode,
  furHex: string,
): {
  legs: Mesh[];
  tail: TransformNode;
} {
  const furMat = new StandardMaterial(`${parent.name}_fur_mat`, scene);
  furMat.diffuseColor = Color3.FromHexString(furHex);
  furMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const tailMat = new StandardMaterial(`${parent.name}_tail_mat`, scene);
  tailMat.diffuseColor = Color3.FromHexString("#f8f4ee");
  const darkMat = new StandardMaterial(`${parent.name}_dark_mat`, scene);
  darkMat.diffuseColor = Color3.FromHexString("#1c2230");

  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 0.55, height: 0.4, depth: 0.45 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0.4, 0);
  body.material = furMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.38, height: 0.34, depth: 0.34 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0.4, 0.6, 0);
  head.material = furMat;

  // Two tall ears.
  for (const dz of [-0.12, 0.12]) {
    const ear = MeshBuilder.CreateBox(
      `${parent.name}_ear_${dz}`,
      { width: 0.1, height: 0.4, depth: 0.12 },
      scene,
    );
    ear.parent = parent;
    ear.position = new Vector3(0.4, 0.95, dz);
    ear.material = furMat;
  }

  // Eye dots.
  for (const dz of [-0.1, 0.1]) {
    const eye = MeshBuilder.CreateBox(
      `${parent.name}_eye_${dz}`,
      { width: 0.06, height: 0.06, depth: 0.06 },
      scene,
    );
    eye.parent = parent;
    eye.position = new Vector3(0.55, 0.65, dz);
    eye.material = darkMat;
  }

  // Puff tail (no real wag — pivot is here for animation parity).
  const tailPivot = new TransformNode(`${parent.name}_tail_pivot`, scene);
  tailPivot.parent = parent;
  tailPivot.position = new Vector3(-0.3, 0.45, 0);
  const tail = MeshBuilder.CreateBox(
    `${parent.name}_tail`,
    { width: 0.16, height: 0.16, depth: 0.16 },
    scene,
  );
  tail.parent = tailPivot;
  tail.position = new Vector3(0, 0, 0);
  tail.material = tailMat;

  const legs: Mesh[] = [];
  // Front legs short, back legs longer (rabbit hop posture).
  for (const [dx, dz, h] of [
    [0.18, 0.14, 0.25],
    [0.18, -0.14, 0.25],
    [-0.18, 0.16, 0.36],
    [-0.18, -0.16, 0.36],
  ] as Array<[number, number, number]>) {
    const leg = MeshBuilder.CreateBox(
      `${parent.name}_leg_${dx}_${dz}`,
      { width: 0.13, height: h, depth: 0.18 },
      scene,
    );
    leg.parent = parent;
    leg.position = new Vector3(dx, h / 2, dz);
    leg.material = furMat;
    legs.push(leg);
  }

  return { legs, tail: tailPivot };
}

/**
 * Build a small voxel bird (body + head + two wings + tail). The
 * wings are returned as separate meshes so the flying mover can flap
 * them on every frame.
 */
function buildBirdMeshes(
  scene: Scene,
  parent: TransformNode,
  bodyHex: string,
  wingHex: string,
): { wings: Mesh[] } {
  const bodyMat = new StandardMaterial(`${parent.name}_body_mat`, scene);
  bodyMat.diffuseColor = Color3.FromHexString(bodyHex);
  const wingMat = new StandardMaterial(`${parent.name}_wing_mat`, scene);
  wingMat.diffuseColor = Color3.FromHexString(wingHex);
  const beakMat = new StandardMaterial(`${parent.name}_beak_mat`, scene);
  beakMat.diffuseColor = Color3.FromHexString("#e8a13a");
  const eyeMat = new StandardMaterial(`${parent.name}_eye_mat`, scene);
  eyeMat.diffuseColor = Color3.FromHexString("#1c2230");

  const body = MeshBuilder.CreateBox(
    `${parent.name}_body`,
    { width: 0.32, height: 0.3, depth: 0.5 },
    scene,
  );
  body.parent = parent;
  body.position = new Vector3(0, 0, 0);
  body.material = bodyMat;

  const head = MeshBuilder.CreateBox(
    `${parent.name}_head`,
    { width: 0.28, height: 0.28, depth: 0.28 },
    scene,
  );
  head.parent = parent;
  head.position = new Vector3(0, 0.15, 0.32);
  head.material = bodyMat;

  const beak = MeshBuilder.CreateBox(
    `${parent.name}_beak`,
    { width: 0.1, height: 0.08, depth: 0.14 },
    scene,
  );
  beak.parent = parent;
  beak.position = new Vector3(0, 0.12, 0.5);
  beak.material = beakMat;

  for (const dx of [-0.1, 0.1]) {
    const eye = MeshBuilder.CreateBox(
      `${parent.name}_eye_${dx}`,
      { width: 0.05, height: 0.05, depth: 0.05 },
      scene,
    );
    eye.parent = parent;
    eye.position = new Vector3(dx, 0.2, 0.42);
    eye.material = eyeMat;
  }

  const tail = MeshBuilder.CreateBox(
    `${parent.name}_tail`,
    { width: 0.28, height: 0.06, depth: 0.18 },
    scene,
  );
  tail.parent = parent;
  tail.position = new Vector3(0, 0.02, -0.32);
  tail.material = wingMat;

  // Two wings hinged near the body so they can flap (rotation around Z).
  const wings: Mesh[] = [];
  for (const dx of [-0.28, 0.28]) {
    const wing = MeshBuilder.CreateBox(
      `${parent.name}_wing_${dx}`,
      { width: 0.4, height: 0.08, depth: 0.3 },
      scene,
    );
    wing.parent = parent;
    wing.position = new Vector3(dx, 0.05, 0);
    wing.material = wingMat;
    wings.push(wing);
  }

  return { wings };
}

/**
 * Move `parent` toward `target` along the XZ plane at `speed` units/sec.
 * Returns true if the parent has reached the target this frame.
 */
function stepToward(
  parent: TransformNode,
  target: Vector3,
  speed: number,
  dtSec: number,
): boolean {
  const dx = target.x - parent.position.x;
  const dz = target.z - parent.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const step = Math.min(dist, speed * dtSec);
  const nx = dx / dist;
  const nz = dz / dist;
  parent.position.x += nx * step;
  parent.position.z += nz * step;
  parent.rotation.y = Math.atan2(nx, nz);
  return dist - step < 0.05;
}

/**
 * Ambient controller for the neighbourhood scene: cars driving in
 * loops, pedestrians walking sidewalks, pets wandering grassy areas,
 * and per-scenario incident animations (e.g. the burst-pipe water
 * spurt). Wired into the per-frame tick from `main.ts` whenever the
 * neighbourhood scene is the active rendered scene.
 */
export class NeighbourhoodAmbient {
  private movers: Mover[] = [];
  private incidents = new Map<ScenarioId, IncidentAnimation>();
  private activeIncident: IncidentAnimation | null = null;

  constructor(private readonly scene: Scene, private readonly root: TransformNode) {}

  /**
   * Spawn a vehicle that drives back and forth along the supplied
   * route. Defaults to a sedan; pass `type` for a jeep, mini cooper,
   * bicycle, or scooter so a row of ambient traffic feels varied. The
   * route is a simple list of XZ waypoints; the vehicle loops them
   * forever (A → B → ... → A → B → ...).
   */
  addCar(
    id: string,
    waypoints: Array<[number, number]>,
    opts: {
      bodyColor?: string;
      topColor?: string;
      speed?: number;
      type?: VehicleType;
    } = {},
  ): void {
    if (waypoints.length < 2) return;
    const vehicleType: VehicleType = opts.type ?? "sedan";
    const carRoot = new TransformNode(`nh_car_${id}`, this.scene);
    carRoot.parent = this.root;
    buildVehicleMeshes(
      this.scene,
      carRoot,
      vehicleType,
      opts.bodyColor ?? "#3a8fd6",
      opts.topColor ?? "#2a6fb0",
    );
    const start = waypoints[0];
    carRoot.position = new Vector3(start[0], 0.05, start[1]);
    // Orient the car along the first leg so it doesn't pop into rotation
    // on the very first frame.
    {
      const next = waypoints[1];
      const nx = next[0] - start[0];
      const nz = next[1] - start[1];
      carRoot.rotation.y = Math.atan2(nx, nz);
    }
    let idx = 1;
    const speed = opts.speed ?? 4.5;
    this.movers.push({
      update: (dt) => {
        const wp = waypoints[idx];
        const target = new Vector3(wp[0], 0.05, wp[1]);
        if (stepToward(carRoot, target, speed, dt)) {
          idx++;
          if (idx >= waypoints.length) {
            // Loop one-way: teleport back to the start of the route so
            // the car always travels in the intended direction along its
            // lane, instead of bouncing back along it in reverse.
            const first = waypoints[0];
            carRoot.position.x = first[0];
            carRoot.position.z = first[1];
            const next = waypoints[1];
            carRoot.rotation.y = Math.atan2(
              next[0] - first[0],
              next[1] - first[1],
            );
            idx = 1;
          }
        }
      },
    });
  }

  /**
   * Spawn a wandering voxel pedestrian that paces between the supplied
   * waypoints and animates their walk cycle while moving.
   */
  addPedestrian(
    id: string,
    paletteKey: keyof typeof PALETTES,
    waypoints: Array<[number, number]>,
    speed = 1.6,
  ): VoxelCharacter | null {
    if (waypoints.length < 2) return null;
    const palette = PALETTES[paletteKey];
    const ch = new VoxelCharacter(this.scene, `nh_amb_${id}`, palette);
    ch.root.parent = this.root;
    const start = waypoints[0];
    ch.root.position = new Vector3(start[0], 0, start[1]);
    let idx = 1;
    let pauseTimer = 0;
    ch.setWalking(true);
    this.movers.push({
      update: (dt) => {
        ch.update(dt);
        if (pauseTimer > 0) {
          pauseTimer -= dt;
          if (pauseTimer <= 0) ch.setWalking(true);
          return;
        }
        const wp = waypoints[idx];
        const target = new Vector3(wp[0], 0, wp[1]);
        if (stepToward(ch.root, target, speed, dt)) {
          idx = (idx + 1) % waypoints.length;
          // Brief pause at each waypoint so the route reads as natural.
          pauseTimer = 0.6 + Math.random() * 0.8;
          ch.setWalking(false);
        }
      },
    });
    return ch;
  }

  /**
   * Spawn a wandering pet (voxel dog, cat, or rabbit) that bumbles
   * around inside the supplied circular grass patch. Picks a fresh
   * random target whenever it arrives.
   */
  addPet(
    id: string,
    home: { cx: number; cz: number; radius: number },
    opts: { furColor?: string; speed?: number; type?: PetType } = {},
  ): void {
    const petRoot = new TransformNode(`nh_pet_${id}`, this.scene);
    petRoot.parent = this.root;
    const petType: PetType = opts.type ?? "dog";
    const furColor = opts.furColor ?? "#c8a878";
    const built =
      petType === "cat"
        ? buildCatMeshes(this.scene, petRoot, furColor)
        : petType === "rabbit"
          ? buildRabbitMeshes(this.scene, petRoot, furColor)
          : buildDogMeshes(this.scene, petRoot, furColor);
    const { legs, tail } = built;
    petRoot.position = new Vector3(home.cx, 0, home.cz);
    let target = new Vector3(home.cx, 0, home.cz);
    let pauseTimer = 0;
    let phase = 0;
    const speed = opts.speed ?? 1.2;
    const pickTarget = (): void => {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * home.radius;
      target = new Vector3(
        home.cx + Math.cos(angle) * r,
        0,
        home.cz + Math.sin(angle) * r,
      );
    };
    pickTarget();
    // Per-pet baseline for leg height (rabbits sit lower than dogs).
    const legBaseY = legs.map((l) => l.position.y);
    this.movers.push({
      update: (dt) => {
        // Tail / cat-tail / rabbit puff sways gently.
        phase += dt * (petType === "cat" ? 4 : petType === "rabbit" ? 6 : 8);
        if (petType === "cat") {
          tail.rotation.x = Math.sin(phase) * 0.25;
        } else if (petType === "rabbit") {
          tail.rotation.y = Math.sin(phase) * 0.2;
        } else {
          tail.rotation.y = Math.sin(phase) * 0.6;
        }
        if (pauseTimer > 0) {
          pauseTimer -= dt;
          // Settle legs while paused.
          legs.forEach((l, i) => (l.position.y = legBaseY[i]));
          return;
        }
        if (stepToward(petRoot, target, speed, dt)) {
          pauseTimer = 0.8 + Math.random() * 1.2;
          pickTarget();
          return;
        }
        if (petType === "rabbit") {
          // Rabbit hops: bob whole pet vertically.
          const hop = Math.max(0, Math.sin(phase * 1.6) * 0.18);
          petRoot.position.y = hop;
        } else {
          // Bouncy leg shuffle while walking.
          const bounce = Math.sin(phase * 1.4) * 0.04;
          legs[0].position.y = legBaseY[0] + Math.max(0, bounce);
          legs[3].position.y = legBaseY[3] + Math.max(0, bounce);
          legs[1].position.y = legBaseY[1] + Math.max(0, -bounce);
          legs[2].position.y = legBaseY[2] + Math.max(0, -bounce);
        }
      },
    });
  }

  /**
   * Spawn a flying bird that loops along the supplied XZ waypoints at
   * the given altitude. Wings flap on every frame and the body bobs
   * gently. Routes loop one-way (A → B → ... → A) like {@link addCar}.
   */
  addBird(
    id: string,
    waypoints: Array<[number, number]>,
    opts: {
      bodyColor?: string;
      wingColor?: string;
      altitude?: number;
      speed?: number;
    } = {},
  ): void {
    if (waypoints.length < 2) return;
    const birdRoot = new TransformNode(`nh_bird_${id}`, this.scene);
    birdRoot.parent = this.root;
    const { wings } = buildBirdMeshes(
      this.scene,
      birdRoot,
      opts.bodyColor ?? "#3a4a52",
      opts.wingColor ?? "#1c2a32",
    );
    const altitude = opts.altitude ?? 6;
    const start = waypoints[0];
    birdRoot.position = new Vector3(start[0], altitude, start[1]);
    {
      const next = waypoints[1];
      const nx = next[0] - start[0];
      const nz = next[1] - start[1];
      birdRoot.rotation.y = Math.atan2(nx, nz);
    }
    let idx = 1;
    const speed = opts.speed ?? 5.5;
    let phase = Math.random() * Math.PI * 2;
    this.movers.push({
      update: (dt) => {
        phase += dt * 14;
        // Flap wings around local Z so they flick up and down on the sides.
        const flap = Math.sin(phase) * 0.9;
        wings[0].rotation.z = flap;
        wings[1].rotation.z = -flap;
        // Gentle vertical bob.
        birdRoot.position.y = altitude + Math.sin(phase * 0.5) * 0.25;
        const wp = waypoints[idx];
        const target = new Vector3(wp[0], birdRoot.position.y, wp[1]);
        if (stepToward(birdRoot, target, speed, dt)) {
          idx++;
          if (idx >= waypoints.length) {
            const first = waypoints[0];
            birdRoot.position.x = first[0];
            birdRoot.position.z = first[1];
            const next = waypoints[1];
            birdRoot.rotation.y = Math.atan2(
              next[0] - first[0],
              next[1] - first[1],
            );
            idx = 1;
          }
        }
      },
    });
  }

  /**
   * Spawn a "busted pipeline" roadworks scene with a continuously
   * looping animation. Adds a small excavated dirt patch, a pair of
   * broken pipe stubs, four orange traffic cones around the perimeter,
   * a dark wet ground patch, a vertical water jet that pulses in
   * height, and a fan of recycling droplets that arc out and fall back
   * to the source.
   *
   * Unlike the per-scenario incident animations, this is ambient —
   * it never stops and never needs to be triggered by the scenario
   * runner. It is purely scene dressing to make the neighbourhood
   * feel alive.
   *
   * @param id     Unique id used as a suffix for mesh names.
   * @param center Ground-level XZ position for the centre of the burst.
   * @param opts   Optional rotation (radians, around Y) so the scene
   *               can be aligned to a kerb or road direction.
   */
  addBustedPipeline(
    id: string,
    center: [number, number],
    opts: { rotationY?: number } = {},
  ): void {
    const scene = this.scene;
    const node = new TransformNode(`nh_pipeline_${id}`, scene);
    node.parent = this.root;
    node.position = new Vector3(center[0], 0, center[1]);
    node.rotation.y = opts.rotationY ?? 0;

    // Materials
    const dirtMat = new StandardMaterial(`nh_pipeline_${id}_dirt`, scene);
    dirtMat.diffuseColor = Color3.FromHexString("#5a4332");
    dirtMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const moundMat = new StandardMaterial(`nh_pipeline_${id}_mound`, scene);
    moundMat.diffuseColor = Color3.FromHexString("#6e5440");
    moundMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const pipeMat = new StandardMaterial(`nh_pipeline_${id}_pipe`, scene);
    pipeMat.diffuseColor = Color3.FromHexString("#8a8a8a");
    pipeMat.specularColor = new Color3(0.1, 0.1, 0.1);

    const pipeRimMat = new StandardMaterial(`nh_pipeline_${id}_pipe_rim`, scene);
    pipeRimMat.diffuseColor = Color3.FromHexString("#3a3a3a");
    pipeRimMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const coneMat = new StandardMaterial(`nh_pipeline_${id}_cone`, scene);
    coneMat.diffuseColor = Color3.FromHexString("#ee6a2a");
    coneMat.emissiveColor = Color3.FromHexString("#ee6a2a").scale(0.15);
    coneMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const coneStripeMat = new StandardMaterial(
      `nh_pipeline_${id}_cone_stripe`,
      scene,
    );
    coneStripeMat.diffuseColor = Color3.FromHexString("#f4f4f4");
    coneStripeMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const waterMat = new StandardMaterial(`nh_pipeline_${id}_water`, scene);
    waterMat.diffuseColor = Color3.FromHexString("#6cb8e8");
    waterMat.emissiveColor = Color3.FromHexString("#3aa0d8").scale(0.4);
    waterMat.specularColor = new Color3(0.2, 0.2, 0.2);
    waterMat.alpha = 0.85;

    const wetMat = new StandardMaterial(`nh_pipeline_${id}_wet`, scene);
    wetMat.diffuseColor = Color3.FromHexString("#3a6f8a");
    wetMat.emissiveColor = Color3.FromHexString("#2a5a78").scale(0.25);
    wetMat.specularColor = new Color3(0.3, 0.3, 0.3);
    wetMat.alpha = 0.75;

    // Excavated dirt patch (slightly recessed) — sits on top of the
    // ground so it shows whether placed on grass or asphalt.
    const dirt = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_dirt`,
      { width: 2.2, height: 0.12, depth: 2.2 },
      scene,
    );
    dirt.parent = node;
    dirt.position = new Vector3(0, 0.06, 0);
    dirt.material = dirtMat;

    // Two small dirt mounds along the edge of the trench.
    const moundA = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_mound_a`,
      { width: 1.6, height: 0.35, depth: 0.4 },
      scene,
    );
    moundA.parent = node;
    moundA.position = new Vector3(0, 0.2, 1.2);
    moundA.material = moundMat;

    const moundB = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_mound_b`,
      { width: 0.4, height: 0.3, depth: 1.4 },
      scene,
    );
    moundB.parent = node;
    moundB.position = new Vector3(-1.2, 0.18, 0);
    moundB.material = moundMat;

    // Wet ground patch around the burst (gently pulses).
    const wet = MeshBuilder.CreateCylinder(
      `nh_pipeline_${id}_wet`,
      { diameter: 3.6, height: 0.04 },
      scene,
    );
    wet.parent = node;
    wet.position = new Vector3(0, 0.13, 0);
    wet.material = wetMat;

    // Two broken pipe stubs sticking up out of the trench. The first is
    // upright; the second is tilted as if snapped.
    const pipeA = MeshBuilder.CreateCylinder(
      `nh_pipeline_${id}_pipe_a`,
      { diameter: 0.45, height: 0.7 },
      scene,
    );
    pipeA.parent = node;
    pipeA.position = new Vector3(-0.45, 0.45, -0.1);
    pipeA.material = pipeMat;

    const pipeARim = MeshBuilder.CreateCylinder(
      `nh_pipeline_${id}_pipe_a_rim`,
      { diameter: 0.5, height: 0.08 },
      scene,
    );
    pipeARim.parent = node;
    pipeARim.position = new Vector3(-0.45, 0.78, -0.1);
    pipeARim.material = pipeRimMat;

    const pipeB = MeshBuilder.CreateCylinder(
      `nh_pipeline_${id}_pipe_b`,
      { diameter: 0.4, height: 0.55 },
      scene,
    );
    pipeB.parent = node;
    pipeB.position = new Vector3(0.4, 0.32, 0.15);
    pipeB.rotation.z = -0.5;
    pipeB.material = pipeMat;

    // Four traffic cones around the perimeter (orange with white stripe).
    const conePositions: Array<[number, number]> = [
      [1.2, 1.2],
      [-1.2, 1.2],
      [1.2, -1.2],
      [-1.2, -1.2],
    ];
    conePositions.forEach((p, i) => {
      const base = MeshBuilder.CreateBox(
        `nh_pipeline_${id}_cone_base_${i}`,
        { width: 0.55, height: 0.06, depth: 0.55 },
        scene,
      );
      base.parent = node;
      base.position = new Vector3(p[0], 0.15, p[1]);
      base.material = coneMat;

      const cone = MeshBuilder.CreateCylinder(
        `nh_pipeline_${id}_cone_${i}`,
        { diameterTop: 0.05, diameterBottom: 0.45, height: 0.7 },
        scene,
      );
      cone.parent = node;
      cone.position = new Vector3(p[0], 0.5, p[1]);
      cone.material = coneMat;

      const stripe = MeshBuilder.CreateCylinder(
        `nh_pipeline_${id}_cone_stripe_${i}`,
        { diameterTop: 0.22, diameterBottom: 0.28, height: 0.1 },
        scene,
      );
      stripe.parent = node;
      stripe.position = new Vector3(p[0], 0.62, p[1]);
      stripe.material = coneStripeMat;
    });

    // Water jet — a thick high-pressure column. The jet is built as
    // four nested layers (outer mist → outer column → mid column →
    // bright inner core) so the fountain reads as a chunky voxel
    // gusher rather than a single flat box.
    const jetSourceY = 0.78;
    const jetCenter = new Vector3(-0.45, 0, -0.1);

    // Outer translucent mist column — softens the silhouette and adds
    // volume around the main spray.
    const mistMat = new StandardMaterial(`nh_pipeline_${id}_mist_mat`, scene);
    mistMat.diffuseColor = Color3.FromHexString("#bfe2f4");
    mistMat.emissiveColor = Color3.FromHexString("#a8d4ec").scale(0.3);
    mistMat.specularColor = new Color3(0.1, 0.1, 0.1);
    mistMat.alpha = 0.45;

    const jetMist = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_jet_mist`,
      { width: 0.85, height: 1.0, depth: 0.85 },
      scene,
    );
    jetMist.parent = node;
    jetMist.position = new Vector3(jetCenter.x, jetSourceY + 0.5, jetCenter.z);
    jetMist.material = mistMat;

    const jetOuter = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_jet_outer`,
      { width: 0.55, height: 1.0, depth: 0.55 },
      scene,
    );
    jetOuter.parent = node;
    jetOuter.position = jetMist.position.clone();
    jetOuter.material = waterMat;

    const jetMid = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_jet_mid`,
      { width: 0.35, height: 1.0, depth: 0.35 },
      scene,
    );
    jetMid.parent = node;
    jetMid.position = jetMist.position.clone();
    const midMat = new StandardMaterial(`nh_pipeline_${id}_mid_mat`, scene);
    midMat.diffuseColor = Color3.FromHexString("#9dd5f0");
    midMat.emissiveColor = Color3.FromHexString("#7ec5e8").scale(0.45);
    midMat.alpha = 0.9;
    jetMid.material = midMat;

    // Inner brighter core for a layered fountain look.
    const jetCore = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_jet_core`,
      { width: 0.2, height: 1.0, depth: 0.2 },
      scene,
    );
    jetCore.parent = node;
    jetCore.position = jetMist.position.clone();
    const coreMat = new StandardMaterial(`nh_pipeline_${id}_core_mat`, scene);
    coreMat.diffuseColor = Color3.FromHexString("#f0faff");
    coreMat.emissiveColor = Color3.FromHexString("#dceffa").scale(0.6);
    coreMat.alpha = 0.95;
    jetCore.material = coreMat;

    // Spray "crown" sitting at the top of the column — a wider, lower
    // box that flares out above the jet so the fountain reads as
    // breaking apart at the top instead of a clean stick.
    const crown = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_crown`,
      { width: 1.4, height: 0.5, depth: 1.4 },
      scene,
    );
    crown.parent = node;
    crown.material = mistMat;
    crown.position = new Vector3(jetCenter.x, jetSourceY + 1.6, jetCenter.z);

    // Side gush from the tilted broken pipe (pipeB) — a shorter,
    // angled spray so the second pipe also reads as actively leaking.
    const sideGush = MeshBuilder.CreateBox(
      `nh_pipeline_${id}_side_gush`,
      { width: 0.28, height: 1.0, depth: 0.28 },
      scene,
    );
    sideGush.parent = node;
    sideGush.material = waterMat;
    // Anchor at the broken end of pipeB and angle it outward.
    const sideGushAnchor = new Vector3(0.55, 0.55, 0.2);
    sideGush.position = sideGushAnchor.clone();
    sideGush.rotation.z = -0.7;
    sideGush.rotation.y = 0.3;

    // Recycling droplets that arc out from the jet source and fall.
    interface Drop {
      mesh: Mesh;
      vx: number;
      vy: number;
      vz: number;
      life: number;
      big: boolean;
    }
    const drops: Drop[] = [];
    const dropCount = 32;
    for (let i = 0; i < dropCount; i++) {
      const big = i < 10; // first ten are chunky gobs
      const size = big ? 0.22 : 0.13;
      const d = MeshBuilder.CreateBox(
        `nh_pipeline_${id}_drop_${i}`,
        { width: size, height: size, depth: size },
        scene,
      );
      d.parent = node;
      d.material = big ? midMat : waterMat;
      d.isVisible = false;
      drops.push({ mesh: d, vx: 0, vy: 0, vz: 0, life: 0, big });
    }

    const dropSource = new Vector3(jetCenter.x, jetSourceY + 0.2, jetCenter.z);

    const launchDrop = (d: Drop): void => {
      const angle = Math.random() * Math.PI * 2;
      // Big gobs spray faster and outward; fine droplets spread wider.
      const speed = d.big
        ? 2.6 + Math.random() * 1.8
        : 2.0 + Math.random() * 2.0;
      d.vx = Math.cos(angle) * speed;
      d.vz = Math.sin(angle) * speed;
      d.vy = d.big ? 4.8 + Math.random() * 1.8 : 3.6 + Math.random() * 2.2;
      d.mesh.position = dropSource.clone();
      d.mesh.isVisible = true;
      d.life = 2.0 + Math.random() * 0.8;
    };

    // Stagger initial launches so droplets don't all fire at once.
    let spawnTimer = 0;
    const spawnInterval = 0.045; // much higher droplet rate
    let phase = 0;

    this.movers.push({
      update: (dt) => {
        phase += dt;

        // Pulsing main jet — taller and more violent than before.
        const baseH = 3.0;
        const swell = Math.sin(phase * 1.3) * 0.6;
        const wobble = Math.sin(phase * 13) * 0.3;
        const h = Math.max(1.6, baseH + swell + wobble);
        const setJetLayer = (m: Mesh, scaleY: number): void => {
          m.scaling.y = scaleY;
          m.position.y = jetSourceY + scaleY * 0.5;
        };
        setJetLayer(jetMist, h * 0.95);
        setJetLayer(jetOuter, h);
        setJetLayer(jetMid, h * 1.02);
        setJetLayer(jetCore, h * 1.05);

        // Mist column shimmies side to side a touch for life.
        const sway = Math.sin(phase * 2.4) * 0.06;
        jetMist.rotation.z = sway;
        jetOuter.rotation.z = sway * 0.5;

        // Crown sits at the top of the column and flares as pressure
        // surges, then settles. Flickers in alpha for spray feel.
        const crownPulse = 1 + Math.sin(phase * 6) * 0.18 + swell * 0.3;
        crown.scaling.x = crownPulse;
        crown.scaling.z = crownPulse;
        crown.scaling.y = 0.6 + Math.sin(phase * 9) * 0.18;
        crown.position.y = jetSourceY + h + 0.1;
        mistMat.alpha = 0.4 + Math.sin(phase * 5) * 0.1;

        // Side gush flickers in length to mimic intermittent pressure.
        const sideH = 0.7 + Math.sin(phase * 7) * 0.25;
        sideGush.scaling.y = sideH;

        // Wet patch pulses more visibly with the burst.
        const wetPulse = 1 + Math.sin(phase * 1.8) * 0.08 + swell * 0.1;
        wet.scaling.x = wetPulse;
        wet.scaling.z = wetPulse;

        // Spawn lots of droplets per frame for a heavy spray.
        spawnTimer += dt;
        while (spawnTimer >= spawnInterval) {
          spawnTimer -= spawnInterval;
          // Launch up to 3 idle drops per tick for a thick burst.
          let launched = 0;
          for (const d of drops) {
            if (!d.mesh.isVisible) {
              launchDrop(d);
              launched++;
              if (launched >= 3) break;
            }
          }
        }

        // Ballistic droplet update with floor clamp + recycle.
        for (const d of drops) {
          if (!d.mesh.isVisible) continue;
          d.vy -= 9.8 * dt;
          d.mesh.position.x += d.vx * dt;
          d.mesh.position.y += d.vy * dt;
          d.mesh.position.z += d.vz * dt;
          d.life -= dt;
          if (d.mesh.position.y <= 0.18 || d.life <= 0) {
            d.mesh.isVisible = false;
          }
        }
      },
    });
  }

  /**
   * Register a free-running ambient animation that ticks every frame.
   * Useful for permanent props that should always be alive (e.g. the
   * café rooftop fire flicker and rising smoke wisps), as opposed to
   * the scripted, scenario-bound incidents handled by {@link
   * registerIncident}.
   */
  addAnimation(update: (dtSec: number) => void): void {
    this.movers.push({ update });
  }

  /** Register an incident animation for a given scenario. */
  registerIncident(id: ScenarioId, anim: IncidentAnimation): void {
    this.incidents.set(id, anim);
  }

  /**
   * Trigger the scenario's incident animation. Stops any incident that
   * was already in flight so a new scenario can overwrite the old one.
   */
  playIncident(id: ScenarioId): void {
    const anim = this.incidents.get(id);
    if (this.activeIncident && this.activeIncident !== anim) {
      this.activeIncident.stop();
    }
    if (!anim) {
      this.activeIncident = null;
      return;
    }
    this.activeIncident = anim;
    anim.start();
  }

  /** Stop the currently-playing incident (e.g. on cancel). */
  clearIncident(): void {
    if (this.activeIncident) {
      this.activeIncident.stop();
      this.activeIncident = null;
    }
  }

  /** Per-frame tick invoked from the render loop. */
  update(dtSec: number): void {
    for (const m of this.movers) m.update(dtSec);
    if (this.activeIncident) this.activeIncident.update(dtSec);
  }
}

/* ------------------------------------------------------------------------ */
/* Incident animation factories                                             */
/* ------------------------------------------------------------------------ */

/**
 * Burst-pipe animation: a vertical jet of water bursts up out of the
 * kitchen window for ~1.6s, drops settle around the driveway, and the
 * static puddle grows from a tight wet spot into the full pool.
 */
export function makeBurstPipeIncident(
  scene: Scene,
  root: TransformNode,
  puddle: Mesh,
  kitchenSource: Vector3,
): IncidentAnimation {
  const baseScale = puddle.scaling.clone();
  // Tall water jet (hidden until the animation runs).
  const jet = MeshBuilder.CreateBox(
    "nh_pipe_jet",
    { width: 0.35, height: 1.0, depth: 0.35 },
    scene,
  );
  jet.parent = root;
  jet.position = kitchenSource.clone();
  const waterMat = new StandardMaterial("nh_pipe_jet_mat", scene);
  waterMat.diffuseColor = Color3.FromHexString("#6cb8e8");
  waterMat.emissiveColor = Color3.FromHexString("#3aa0d8").scale(0.4);
  waterMat.alpha = 0.85;
  jet.material = waterMat;
  jet.isVisible = false;

  // Six small splash droplets that arc outward from the source.
  const drops: Array<{ mesh: Mesh; vx: number; vy: number; vz: number }> = [];
  for (let i = 0; i < 8; i++) {
    const d = MeshBuilder.CreateBox(
      `nh_pipe_drop_${i}`,
      { width: 0.18, height: 0.18, depth: 0.18 },
      scene,
    );
    d.parent = root;
    d.material = waterMat;
    d.isVisible = false;
    drops.push({ mesh: d, vx: 0, vy: 0, vz: 0 });
  }

  let elapsed = 0;
  let running = false;
  const duration = 4.0;

  const reset = (): void => {
    jet.isVisible = false;
    jet.scaling = new Vector3(1, 0.01, 1);
    puddle.scaling = baseScale.clone();
    for (const d of drops) {
      d.mesh.isVisible = false;
      d.mesh.position = kitchenSource.clone();
    }
  };
  reset();

  return {
    durationSec: duration,
    start: () => {
      elapsed = 0;
      running = true;
      jet.isVisible = true;
      jet.scaling = new Vector3(1, 0.01, 1);
      // Launch droplets in a fan.
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const angle = (i / drops.length) * Math.PI * 2;
        const speed = 2.4 + Math.random() * 1.2;
        d.vx = Math.cos(angle) * speed;
        d.vz = Math.sin(angle) * speed;
        d.vy = 3.0 + Math.random() * 1.4;
        d.mesh.position = kitchenSource.clone();
        d.mesh.isVisible = true;
      }
      puddle.scaling = new Vector3(0.15, 1, 0.15);
    },
    stop: () => {
      running = false;
      reset();
    },
    update: (dt) => {
      if (!running) return;
      elapsed += dt;
      // Phase 1: jet bursts up rapidly (0–0.6s), pulses for 0.6–1.6s.
      if (elapsed < 0.6) {
        const t = elapsed / 0.6;
        jet.scaling.y = 0.2 + t * 2.8;
        jet.position.y = kitchenSource.y + jet.scaling.y * 0.5;
      } else if (elapsed < 1.8) {
        const wob = 2.6 + Math.sin(elapsed * 14) * 0.4;
        jet.scaling.y = wob;
        jet.position.y = kitchenSource.y + jet.scaling.y * 0.5;
      } else {
        // Wind down — jet shrinks back to nothing.
        const t = Math.min(1, (elapsed - 1.8) / 0.6);
        jet.scaling.y = (1 - t) * 2.6 + 0.01;
        jet.position.y = kitchenSource.y + jet.scaling.y * 0.5;
        if (t >= 1) jet.isVisible = false;
      }

      // Droplet physics: simple ballistic with floor clamp.
      for (const d of drops) {
        if (!d.mesh.isVisible) continue;
        d.vy -= 9.8 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        if (d.mesh.position.y <= 0.1) {
          d.mesh.position.y = 0.1;
          d.mesh.isVisible = false;
        }
      }

      // Puddle grows over the whole 4s, easing toward full size.
      const pt = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - pt, 2);
      puddle.scaling = new Vector3(
        0.15 + ease * (baseScale.x - 0.15),
        baseScale.y,
        0.15 + ease * (baseScale.z - 0.15),
      );

      if (elapsed >= duration) {
        running = false;
        // Leave the puddle at its final natural state for everyone to see.
        puddle.scaling = baseScale.clone();
        jet.isVisible = false;
      }
    },
  };
}

/**
 * Rear-end collision animation: the rear car rolls forward into the
 * lead car's bumper, both cars judder on impact, and a small dust puff
 * pops up at the contact point.
 */
export function makeRearEndIncident(
  scene: Scene,
  root: TransformNode,
  leadCarMeshes: TransformNode[],
  rearCarMeshes: TransformNode[],
  contact: Vector3,
): IncidentAnimation {
  const leadBase = leadCarMeshes.map((m) => m.position.clone());
  const rearBase = rearCarMeshes.map((m) => m.position.clone());
  // Rear car starts further back (further east, away from the lead car)
  // than its resting pose so it can roll in and impact the bumper.
  const rearOffset = 3.5;

  const puff = MeshBuilder.CreateBox(
    "nh_motor_puff",
    { width: 0.6, height: 0.6, depth: 0.6 },
    scene,
  );
  puff.parent = root;
  puff.position = contact.clone();
  const puffMat = new StandardMaterial("nh_motor_puff_mat", scene);
  puffMat.diffuseColor = Color3.FromHexString("#cfc8b4");
  puffMat.alpha = 0;
  puff.material = puffMat;
  puff.isVisible = false;

  let elapsed = 0;
  let running = false;
  const duration = 2.8;

  const restore = (): void => {
    leadCarMeshes.forEach((m, i) => (m.position = leadBase[i].clone()));
    rearCarMeshes.forEach((m, i) => (m.position = rearBase[i].clone()));
    puff.isVisible = false;
    puffMat.alpha = 0;
  };
  restore();

  return {
    durationSec: duration,
    start: () => {
      elapsed = 0;
      running = true;
      // Snap rear car back to its pre-impact position.
      rearCarMeshes.forEach((m, i) => {
        m.position = rearBase[i].clone();
        m.position.x += rearOffset;
      });
      leadCarMeshes.forEach((m, i) => (m.position = leadBase[i].clone()));
      puff.position = contact.clone();
      puff.scaling = new Vector3(0.3, 0.3, 0.3);
      puffMat.alpha = 0;
      puff.isVisible = false;
    },
    stop: () => {
      running = false;
      restore();
    },
    update: (dt) => {
      if (!running) return;
      elapsed += dt;
      if (elapsed < 1.4) {
        // Roll-in: rear car eases from rearOffset → 0 with a slight bob.
        const t = elapsed / 1.4;
        const eased = 1 - Math.pow(1 - t, 2);
        const off = rearOffset * (1 - eased);
        rearCarMeshes.forEach((m, i) => {
          m.position = rearBase[i].clone();
          m.position.x += off;
        });
      } else if (elapsed < 2.0) {
        // Impact: shake both cars on the X axis briefly.
        const t = (elapsed - 1.4) / 0.6;
        const decay = 1 - t;
        const j = Math.sin(elapsed * 38) * 0.12 * decay;
        leadCarMeshes.forEach((m, i) => {
          m.position = leadBase[i].clone();
          m.position.x += j;
          m.position.y += Math.abs(j) * 0.4;
        });
        rearCarMeshes.forEach((m, i) => {
          m.position = rearBase[i].clone();
          m.position.x += j * 0.6;
        });
        // Dust puff fades in then out.
        puff.isVisible = true;
        const pt = t;
        puffMat.alpha = pt < 0.3 ? pt / 0.3 : 1 - (pt - 0.3) / 0.7;
        puff.scaling = new Vector3(0.3 + pt * 0.9, 0.3 + pt * 0.7, 0.3 + pt * 0.9);
        puff.position.y = contact.y + pt * 0.4;
      } else {
        // Settle.
        leadCarMeshes.forEach((m, i) => (m.position = leadBase[i].clone()));
        rearCarMeshes.forEach((m, i) => (m.position = rearBase[i].clone()));
        puffMat.alpha = 0;
        puff.isVisible = false;
        if (elapsed >= duration) running = false;
      }
    },
  };
}

/**
 * Café smoke pulse: existing smoke wisps swell, and a warm orange
 * flicker glows behind the café door for the duration of the beat.
 */
export function makeSmokeIncident(
  scene: Scene,
  root: TransformNode,
  smokeMeshes: Mesh[],
  flickerAt: Vector3,
): IncidentAnimation {
  const baseScales = smokeMeshes.map((m) => m.scaling.clone());
  const baseY = smokeMeshes.map((m) => m.position.y);

  const flicker = MeshBuilder.CreateBox(
    "nh_cafe_flicker",
    { width: 1.2, height: 1.4, depth: 0.1 },
    scene,
  );
  flicker.parent = root;
  flicker.position = flickerAt.clone();
  const fmat = new StandardMaterial("nh_cafe_flicker_mat", scene);
  fmat.diffuseColor = Color3.FromHexString("#e07a2c");
  fmat.emissiveColor = Color3.FromHexString("#e07a2c");
  fmat.alpha = 0;
  flicker.material = fmat;
  flicker.isVisible = false;

  let elapsed = 0;
  let running = false;
  const duration = 4.5;

  const reset = (): void => {
    smokeMeshes.forEach((m, i) => {
      m.scaling = baseScales[i].clone();
      m.position.y = baseY[i];
    });
    fmat.alpha = 0;
    flicker.isVisible = false;
  };
  reset();

  return {
    durationSec: duration,
    start: () => {
      elapsed = 0;
      running = true;
      flicker.isVisible = true;
    },
    stop: () => {
      running = false;
      reset();
    },
    update: (dt) => {
      if (!running) return;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      // Swell & rise, then settle back.
      const pulse = Math.sin(t * Math.PI);
      smokeMeshes.forEach((m, i) => {
        const s = 1 + pulse * 0.6 + Math.sin(elapsed * 3 + i) * 0.05;
        m.scaling = baseScales[i].scale(s);
        m.position.y = baseY[i] + pulse * 0.6;
      });
      // Flicker alpha — flame-like jitter.
      fmat.alpha = pulse * (0.55 + Math.sin(elapsed * 18) * 0.25);
      if (elapsed >= duration) {
        running = false;
        reset();
      }
    },
  };
}

/**
 * Lost-luggage tumble: the lone suitcase starts on the trolley, slides
 * off, and settles at its "lost" resting position out on the tarmac.
 */
export function makeLuggageIncident(
  root: TransformNode,
  suitcase: Mesh,
  trolleyTop: Vector3,
  restingPos: Vector3,
): IncidentAnimation {
  const baseRotation = suitcase.rotation.clone();
  let elapsed = 0;
  let running = false;
  const duration = 2.4;

  const restore = (): void => {
    suitcase.position = restingPos.clone();
    suitcase.rotation = baseRotation.clone();
  };
  restore();

  return {
    durationSec: duration,
    start: () => {
      elapsed = 0;
      running = true;
      suitcase.position = trolleyTop.clone();
      suitcase.rotation = baseRotation.clone();
    },
    stop: () => {
      running = false;
      restore();
    },
    update: (dt) => {
      if (!running) return;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      // Ballistic-ish slide off + tumble.
      const eased = t * t;
      suitcase.position.x = trolleyTop.x + (restingPos.x - trolleyTop.x) * eased;
      suitcase.position.z = trolleyTop.z + (restingPos.z - trolleyTop.z) * eased;
      // Drop and bounce: y traces a parabola from trolleyTop.y to restingPos.y.
      const drop = trolleyTop.y - restingPos.y;
      suitcase.position.y =
        trolleyTop.y - drop * eased + Math.sin(t * Math.PI) * 0.5;
      suitcase.rotation.y = baseRotation.y + t * Math.PI * 1.5;
      suitcase.rotation.z = Math.sin(t * Math.PI * 2) * 0.4;
      if (elapsed >= duration) {
        running = false;
        restore();
      }
    },
  };
}

/**
 * Calm life-insurance scene: a soft warm halo gently fades in and out
 * around the home, signalling that this scenario is handled with care
 * (no alarm or chaos).
 */
export function makeCalmGlowIncident(
  scene: Scene,
  root: TransformNode,
  position: Vector3,
): IncidentAnimation {
  const halo = MeshBuilder.CreateCylinder(
    "nh_life_halo",
    { diameter: 7, height: 0.05 },
    scene,
  );
  halo.parent = root;
  halo.position = position.clone();
  const hmat = new StandardMaterial("nh_life_halo_mat", scene);
  hmat.diffuseColor = Color3.FromHexString("#f4e8c8");
  hmat.emissiveColor = Color3.FromHexString("#f4e8c8");
  hmat.alpha = 0;
  halo.material = hmat;
  halo.isVisible = false;

  let elapsed = 0;
  let running = false;
  const duration = 4.0;

  return {
    durationSec: duration,
    start: () => {
      elapsed = 0;
      running = true;
      halo.isVisible = true;
      hmat.alpha = 0;
    },
    stop: () => {
      running = false;
      hmat.alpha = 0;
      halo.isVisible = false;
    },
    update: (dt) => {
      if (!running) return;
      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      hmat.alpha = Math.sin(t * Math.PI) * 0.45;
      if (elapsed >= duration) {
        running = false;
        hmat.alpha = 0;
        halo.isVisible = false;
      }
    },
  };
}

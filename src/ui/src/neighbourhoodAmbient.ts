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
 * Build a simple voxel sedan (chassis + cabin + windows + four wheels)
 * parented under a single TransformNode the caller can move and rotate.
 *
 * The car's long axis runs along local +Z so that `parent.rotation.y =
 * Math.atan2(nx, nz)` (which yields 0 when travelling +Z) orients the
 * car correctly along its direction of travel.
 */
function buildCarMeshes(
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
   * Spawn a sedan that drives back and forth along the supplied route.
   * The route is a simple list of XZ waypoints; the car loops them
   * forever (A → B → ... → A → B → ...).
   */
  addCar(
    id: string,
    waypoints: Array<[number, number]>,
    opts: { bodyColor?: string; topColor?: string; speed?: number } = {},
  ): void {
    if (waypoints.length < 2) return;
    const carRoot = new TransformNode(`nh_car_${id}`, this.scene);
    carRoot.parent = this.root;
    buildCarMeshes(
      this.scene,
      carRoot,
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
  ): void {
    if (waypoints.length < 2) return;
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
  }

  /**
   * Spawn a wandering pet (voxel dog) that bumbles around inside the
   * supplied rectangular grass patch. Picks a fresh random target
   * whenever it arrives.
   */
  addPet(
    id: string,
    home: { cx: number; cz: number; radius: number },
    opts: { furColor?: string; speed?: number } = {},
  ): void {
    const petRoot = new TransformNode(`nh_pet_${id}`, this.scene);
    petRoot.parent = this.root;
    const { legs, tail } = buildDogMeshes(
      this.scene,
      petRoot,
      opts.furColor ?? "#c8a878",
    );
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
    this.movers.push({
      update: (dt) => {
        // Tail always wags.
        phase += dt * 8;
        tail.rotation.y = Math.sin(phase) * 0.6;
        if (pauseTimer > 0) {
          pauseTimer -= dt;
          // Settle legs while paused.
          for (const leg of legs) leg.position.y = 0.18;
          return;
        }
        if (stepToward(petRoot, target, speed, dt)) {
          pauseTimer = 0.8 + Math.random() * 1.2;
          pickTarget();
          return;
        }
        // Bouncy leg shuffle while walking.
        const bounce = Math.sin(phase * 1.4) * 0.04;
        legs[0].position.y = 0.18 + Math.max(0, bounce);
        legs[3].position.y = 0.18 + Math.max(0, bounce);
        legs[1].position.y = 0.18 + Math.max(0, -bounce);
        legs[2].position.y = 0.18 + Math.max(0, -bounce);
      },
    });
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
  leadCarMeshes: Mesh[],
  rearCarMeshes: Mesh[],
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

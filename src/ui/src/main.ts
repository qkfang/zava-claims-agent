import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { ClaimSimulation } from "./claimSimulation";
import { HudLogger } from "./hud";
import { buildOffice } from "./officeScene";

function bootstrap(): void {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("renderCanvas element missing from index.html");
  }

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(
    0x1c / 255,
    0x22 / 255,
    0x30 / 255,
    1,
  );
  scene.ambientColor = new Color3(0.6, 0.6, 0.7);

  // Isometric-ish camera: high angle, locked pitch range, orbit on user drag.
  const camera = new ArcRotateCamera(
    "cam",
    -Math.PI / 4,            // alpha (rotation around Y)
    Math.PI / 3.4,           // beta  (tilt)
    32,                      // radius
    new Vector3(0, 1.2, 1),  // target: roughly center of office
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 18;
  camera.upperRadiusLimit = 55;
  camera.lowerBetaLimit = Math.PI / 6;
  camera.upperBetaLimit = Math.PI / 2.6;
  camera.wheelPrecision = 30;
  camera.panningSensibility = 0;

  // Lighting — soft hemispheric + a directional fill from the windows.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  hemi.groundColor = new Color3(0.45, 0.45, 0.55);

  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.6), scene);
  sun.intensity = 0.55;
  sun.diffuse = new Color3(1.0, 0.95, 0.85);

  // Build the office and start the simulation.
  const layout = buildOffice(scene);
  const hud = new HudLogger();
  const sim = new ClaimSimulation(scene, layout, hud);
  hud.log("Office is open — simulation started", "good");

  // Spawn the first customer immediately so the demo has something to show.
  setTimeout(() => sim.spawnCustomer(), 800);

  // Manual spawn button
  document.getElementById("spawn-btn")?.addEventListener("click", () => {
    sim.spawnCustomer();
  });

  // Per-frame tick.
  let last = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.update(dt);
  });

  engine.runRenderLoop(() => scene.render());

  window.addEventListener("resize", () => engine.resize());
}

bootstrap();

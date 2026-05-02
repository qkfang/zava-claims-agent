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
import { buildNeighbourhood } from "./neighbourhoodScene";
import { buildOffice } from "./officeScene";

type SceneKey = "office" | "neighbourhood";

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

  // ---------------- Office scene ----------------
  const officeScene = new Scene(engine);
  officeScene.clearColor = new Color4(
    0x1c / 255,
    0x22 / 255,
    0x30 / 255,
    1,
  );
  officeScene.ambientColor = new Color3(0.6, 0.6, 0.7);

  const officeCamera = new ArcRotateCamera(
    "officeCam",
    -Math.PI / 4,
    Math.PI / 3.4,
    48,
    new Vector3(0, 1.2, 1),
    officeScene,
  );
  officeCamera.attachControl(canvas, true);
  officeCamera.lowerRadiusLimit = 28;
  officeCamera.upperRadiusLimit = 80;
  officeCamera.lowerBetaLimit = Math.PI / 6;
  officeCamera.upperBetaLimit = Math.PI / 2.6;
  officeCamera.wheelPrecision = 20;
  officeCamera.panningSensibility = 0;

  const officeHemi = new HemisphericLight("officeHemi", new Vector3(0, 1, 0), officeScene);
  officeHemi.intensity = 0.85;
  officeHemi.groundColor = new Color3(0.45, 0.45, 0.55);

  const officeSun = new DirectionalLight("officeSun", new Vector3(-0.4, -1, -0.6), officeScene);
  officeSun.intensity = 0.55;
  officeSun.diffuse = new Color3(1.0, 0.95, 0.85);

  const layout = buildOffice(officeScene);
  const hud = new HudLogger();
  const sim = new ClaimSimulation(officeScene, layout, hud);
  hud.log("Office is open — simulation started", "good");

  // Spawn the first customer immediately so the demo has something to show.
  setTimeout(() => sim.spawnCustomer(), 800);

  // ---------------- Neighbourhood scene ----------------
  const neighbourhoodScene = new Scene(engine);
  neighbourhoodScene.clearColor = new Color4(
    0xb8 / 255,
    0xdd / 255,
    0xf0 / 255,
    1,
  );
  neighbourhoodScene.ambientColor = new Color3(0.7, 0.75, 0.8);

  const nhCamera = new ArcRotateCamera(
    "nhCam",
    -Math.PI / 4,
    Math.PI / 3.6,
    72,
    new Vector3(0, 0, 0),
    neighbourhoodScene,
  );
  nhCamera.lowerRadiusLimit = 40;
  nhCamera.upperRadiusLimit = 110;
  nhCamera.lowerBetaLimit = Math.PI / 6;
  nhCamera.upperBetaLimit = Math.PI / 2.6;
  nhCamera.wheelPrecision = 14;
  nhCamera.panningSensibility = 0;

  const nhHemi = new HemisphericLight("nhHemi", new Vector3(0, 1, 0), neighbourhoodScene);
  nhHemi.intensity = 0.95;
  nhHemi.groundColor = new Color3(0.55, 0.6, 0.55);

  const nhSun = new DirectionalLight("nhSun", new Vector3(-0.3, -1, -0.4), neighbourhoodScene);
  nhSun.intensity = 0.6;
  nhSun.diffuse = new Color3(1.0, 0.95, 0.85);

  buildNeighbourhood(neighbourhoodScene);

  // ---------------- Active scene management ----------------
  let activeScene: SceneKey = "office";

  const setActiveScene = (key: SceneKey): void => {
    if (activeScene === key) return;
    activeScene = key;

    // Detach controls from the inactive camera, attach to the active one
    if (key === "office") {
      nhCamera.detachControl();
      officeCamera.attachControl(canvas, true);
    } else {
      officeCamera.detachControl();
      nhCamera.attachControl(canvas, true);
    }

    // Update toggle button visual state
    document
      .querySelectorAll<HTMLButtonElement>(".scene-toggle button")
      .forEach((btn) => {
        const target = btn.dataset.scene as SceneKey | undefined;
        if (target === key) btn.classList.add("active");
        else btn.classList.remove("active");
      });

    // Show/hide office-only HUD pieces (agents panel, activity log) so the
    // neighbourhood scene stays uncluttered.
    document.body.dataset.scene = key;
  };

  document.body.dataset.scene = "office";

  document
    .querySelectorAll<HTMLButtonElement>(".scene-toggle button")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.scene as SceneKey | undefined;
        if (target) setActiveScene(target);
      });
    });

  // Manual spawn button — only meaningful in office scene
  document.getElementById("spawn-btn")?.addEventListener("click", () => {
    if (activeScene !== "office") setActiveScene("office");
    sim.spawnCustomer();
  });

  // Per-frame tick — only run the simulation while the office is rendering
  let last = performance.now();
  officeScene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.update(dt);
  });

  engine.runRenderLoop(() => {
    if (activeScene === "office") {
      officeScene.render();
    } else {
      // Reset the simulation timer so it doesn't accumulate dt while paused
      last = performance.now();
      neighbourhoodScene.render();
    }
  });

  window.addEventListener("resize", () => engine.resize());
}

bootstrap();

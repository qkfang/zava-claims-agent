import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  PointerEventTypes,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { ClaimSimulation } from "./claimSimulation";
import { CameraDirector } from "./cameraDirector";
import { HudLogger } from "./hud";
import { buildNeighbourhood } from "./neighbourhoodScene";
import { buildOffice } from "./officeScene";
import { ProfileCard } from "./profileCard";
import { ScenarioPicker } from "./scenarioPicker";
import { ScenarioRunner } from "./scenarioRunner";
import { initCollapsiblePanels } from "./collapsiblePanels";
import type { CharacterPickMetadata } from "./voxelCharacter";

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
    72,
    new Vector3(0, 1.2, 4),
    officeScene,
  );
  officeCamera.attachControl(canvas, true);
  officeCamera.lowerRadiusLimit = 36;
  officeCamera.upperRadiusLimit = 120;
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
  initCollapsiblePanels();
  hud.log("Office is open — simulation started", "good");

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
  nhCamera.lowerRadiusLimit = 16;
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

  const nhResult = buildNeighbourhood(neighbourhoodScene);

  // ---------------- Camera directors ----------------
  const officeCameraDirector = new CameraDirector(officeCamera);
  const nhCameraDirector = new CameraDirector(nhCamera);

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
        if (btn.disabled) return;
        const target = btn.dataset.scene as SceneKey | undefined;
        if (target) setActiveScene(target);
      });
    });

  // ---------------- Profile card ----------------
  const profileCard = new ProfileCard(sim);

  // Set up pointer-pick handlers on both scenes. A click on a character's
  // tagged hitbox opens / refreshes the profile card. Hover toggles the
  // canvas pointer cursor and highlights the character.
  const wirePicking = (scene: Scene): void => {
    let hoveredId: string | null = null;
    scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERMOVE) {
        const pickInfo = scene.pick(scene.pointerX, scene.pointerY);
        const meta = pickInfo?.pickedMesh?.metadata as
          | CharacterPickMetadata
          | undefined;
        const id = meta?.kind === "character" ? meta.id : null;
        if (id !== hoveredId) {
          // Remove previous hover highlight, but never clear an
          // intentionally-set scripted/script-focus highlight.
          if (hoveredId && hoveredId !== sim.getHighlightedCharacter()) {
            const prev = sim.getCharacterById(hoveredId);
            prev?.setHighlight(false);
          }
          hoveredId = id;
          if (id) {
            const ch = sim.getCharacterById(id);
            ch?.setHighlight(true);
            canvas.classList.add("hover-character");
          } else {
            canvas.classList.remove("hover-character");
          }
        }
      } else if (info.type === PointerEventTypes.POINTERPICK) {
        const pickInfo = info.pickInfo ?? scene.pick(scene.pointerX, scene.pointerY);
        const meta = pickInfo?.pickedMesh?.metadata as
          | CharacterPickMetadata
          | undefined;
        if (meta?.kind === "character") {
          profileCard.open(meta.id);
        }
      }
    });
  };
  wirePicking(officeScene);
  wirePicking(neighbourhoodScene);

  // ---------------- "Now playing" banner ----------------
  const banner = document.getElementById("now-playing") as HTMLDivElement;
  const bannerTitle = banner.querySelector(".np-title") as HTMLDivElement;
  const bannerNarration = banner.querySelector(".np-narration") as HTMLDivElement;
  const bannerDot = banner.querySelector(".np-dot") as HTMLDivElement;
  const bannerCloseBtn = banner.querySelector(".np-close") as HTMLButtonElement;

  // ---------------- Scene fade overlay ----------------
  // The fade is split into two halves so the caller can swap scenes
  // while the overlay is fully black, hiding the camera/scene change.
  const fadeEl = document.getElementById("scene-fade") as HTMLDivElement;
  const fadeTransition = (): Promise<void> =>
    new Promise((resolve) => {
      fadeEl.classList.remove("hidden");
      // force reflow so the transition runs
      void fadeEl.offsetWidth;
      fadeEl.classList.add("active");
      window.setTimeout(() => {
        // Fully black — let the caller swap scenes now.
        resolve();
        // Fade back out after a short hold.
        window.setTimeout(() => {
          fadeEl.classList.remove("active");
          window.setTimeout(() => {
            fadeEl.classList.add("hidden");
          }, 340);
        }, 80);
      }, 320);
    });

  // ---------------- Scenario runner ----------------
  const runner = new ScenarioRunner(
    neighbourhoodScene,
    officeScene,
    nhCameraDirector,
    officeCameraDirector,
    nhResult.zones,
    sim,
    hud,
    {
      setActiveScene,
      fadeTransition,
      showBanner: (persona, narration) => {
        bannerTitle.textContent = `Now playing — ${persona.name}`;
        bannerNarration.textContent = narration;
        bannerDot.style.background = persona.color;
        banner.classList.remove("hidden");
      },
      updateBannerNarration: (narration) => {
        bannerNarration.textContent = narration;
      },
      hideBanner: () => {
        banner.classList.add("hidden");
      },
      setSceneToggleDisabled: (disabled) => {
        document
          .querySelectorAll<HTMLButtonElement>(".scene-toggle button")
          .forEach((btn) => {
            btn.disabled = disabled;
            if (disabled) {
              btn.title = "Scenario in progress";
            } else {
              btn.removeAttribute("title");
            }
          });
      },
    },
    {
      playIncident: (id) => nhResult.playIncident(id),
      clearIncident: () => nhResult.clearIncident(),
    },
  );

  bannerCloseBtn.addEventListener("click", () => runner.cancel());

  // ---------------- Scenario picker ----------------
  const picker = new ScenarioPicker((id, opts) => runner.start(id, opts));

  // Manual spawn button — now opens the scenario picker.
  document.getElementById("spawn-btn")?.addEventListener("click", () => {
    if (runner.isPlaying()) {
      hud.log("A scripted scenario is already in progress", "warn");
      return;
    }
    picker.open();
  });

  // Spawn the first random customer immediately so the demo has something to show.
  setTimeout(() => sim.spawnCustomer(), 800);

  // Per-frame tick — driven from the render loop so we tick exactly once
  // per frame regardless of which scene is rendered.
  let last = performance.now();
  const tick = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (activeScene === "office") {
      sim.update(dt);
    } else {
      nhResult.update(dt);
    }
    runner.update(dt);
  };

  engine.runRenderLoop(() => {
    tick();
    if (activeScene === "office") {
      officeScene.render();
    } else {
      neighbourhoodScene.render();
    }
  });

  window.addEventListener("resize", () => engine.resize());
}

bootstrap();

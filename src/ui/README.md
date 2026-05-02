# Zava Claims Agent — Web Demo (`src/ui`)

A browser-based demo that visualizes an insurance claims office staffed by AI
agents. Customers (voxel characters) walk into the lobby, drop off claim
folders at reception, and a team of staff agents (Receptionist → Validator →
Approver → Filer) routes, validates, approves/rejects, and files each claim.

The 3D scene is built with **Babylon.js** in an isometric voxel style that
matches the project moodboard (blocky office, big back windows, cubicles,
filing area, shipping-box pile in the foreground).

## Tech stack

- [Babylon.js](https://www.babylonjs.com/) (`@babylonjs/core`) for 3D rendering
- [Vite](https://vitejs.dev/) + TypeScript for the dev server / build pipeline
- Pure-CSS HUD overlay for metrics, agent panel, and activity log

Characters are constructed at runtime from `MeshBuilder.CreateBox` primitives
to keep the demo dependency-light and instantly runnable. Swapping the
`VoxelCharacter` factory for `SceneLoader.ImportMesh` of GLB models is a small
change if you want to drop in higher-fidelity assets later. Physics is not
required — agents move with simple kinematic XZ steering, which is plenty for
the demo and avoids shipping a heavy physics engine to the browser.

## Running locally

```bash
cd src/ui
npm install
npm run dev
```

Then open the URL Vite prints (defaults to <http://localhost:5173>).

To produce a production build:

```bash
npm run build
npm run preview
```

## What you see

- **Lobby** with a green sofa and a potted plant on the left, reception desk
  in front, big windows along the back wall, and a glass front door.
- **Cubicles** along the back-left and back-right where the Validator and
  Approver work.
- **Filing area** in the center back with stacked storage boxes — this is
  where the Filer agent archives processed claims.
- **HUD**:
  - Top bar shows live counts (submitted / in-flight / approved / rejected).
  - Left panel lists each AI staff agent with role and current activity.
  - Right panel streams an activity log in real time.
  - Bottom button lets you submit an extra claim on demand.

## Simulation flow

1. A customer spawns outside the door carrying a colored claim folder, walks
   in, and drops it on the reception inbox tray.
2. The **Receptionist** picks it up and walks it over to the **Validator**'s
   desk.
3. The **Validator** inspects it (passing ~85% of the time). Passed claims go
   to the **Approver**; rejects go straight to filing.
4. The **Approver** approves or rejects based on claim amount (larger claims
   are more likely to need a second review).
5. The **Filer** carries the folder to the archive shelves and places it.

All thresholds, claim types, and agent names live in `claimSimulation.ts` and
are easy to tweak for your demo narrative.

## File map

```
src/ui
├── index.html              # Page shell + HUD markup
├── package.json            # Vite + Babylon dependencies
├── tsconfig.json
├── vite.config.ts
└── src
    ├── main.ts             # Engine bootstrap, camera, lights, render loop
    ├── styles.css          # HUD styling (panels, metrics, log)
    ├── officeScene.ts      # Builds the voxel office geometry
    ├── voxelCharacter.ts   # Box-built voxel humanoid + walk animation
    ├── claimSimulation.ts  # Agent state machines + claim lifecycle
    └── hud.ts              # DOM HUD wired to the SimLogger contract
```

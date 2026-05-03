# Claims Team in a Day — Web Demo (`src/ui`)

A browser-based demo for **Zava Insurance** that visualises a claims office staffed by
AI agents. Customers (voxel characters) walk from a neighbourhood scene into the Zava
Insurance Claims Office, lodge claims at the reception desk, and a team of specialist
staff agents — Iris, Adam, Lara, Felix, Sam, Seth, Cara, and Theo — routes, reviews,
coordinates, and settles each claim. Each agent mirrors a real staff role from
[`docs/characters.md`](../../docs/characters.md).

The 3D scene is built with **Babylon.js** in an isometric voxel style that matches the
project moodboard (blocky office, big back windows, cubicle desks, a neighbourhood
street outside with residential, motor, high-street, travel, and life-themed zones).

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

- **Neighbourhood** — a voxel street outside the office with five incident zones:
  residential (home), road/motor, high street (business), airport/travel, and a
  quiet suburb (life). Customers spawn at the zone matching their claim type.
- **Lobby** — a glass front door, reception desk, and waiting area. Customers
  walk in from the street and lodge claims here.
- **Claims office floor** — open-plan cubicle desks for Iris (Intake), Adam
  (Assessor), and Seth (Settlement), plus workstations for ambient staff.
- **Specialist desks** — Lara (Loss Adjuster), Felix (Fraud Investigator), Sam
  (Supplier Coordinator), and Cara (Customer Comms) each have their own area.
- **Team Leader office** — Theo monitors escalations and workload from the back.
- **HUD**:
  - Top bar shows live counts (submitted / in-flight / approved / rejected).
  - Left panel lists each AI staff agent with role and current activity.
  - Right panel streams an activity log in real time.
  - Bottom scenario picker lets you launch any of the five scripted scenarios.

## Scripted scenarios

Five claim scenarios can be launched from the scenario picker:

| # | Customer | Claim type | Outcome |
|---|---|---|---|
| 1 | Michael (home) | Burst pipe — kitchen water damage | Approved |
| 2 | Aisha (motor) | Rear-end collision | Approved |
| 3 | Tom (business) | Café smoke damage — electrical fire | Approved |
| 4 | Grace (travel) | Lost luggage — fraud indicators | Rejected |
| 5 | Robert (life) | Bereavement beneficiary claim | Approved |

Each scenario drives a deterministic sequence of agent beats (see the JSON files
in `src/ui/src/scenarios/`) and can also insert consultation steps with ambient
specialist staff between assessor review and settlement.

## Simulation flow

1. A customer spawns at the neighbourhood incident zone matching their claim type,
   walks through the street, and enters the Zava Insurance building.
2. The customer lodges their claim folder at the **reception desk**.
3. **Iris** (Claims Intake Officer) picks up the claim, captures the first notice
   of loss, and routes it to the assessor.
4. **Adam** (Claims Assessor) reviews policy coverage and evidence.
5. Optional consultation beats with **Lara** (Loss Adjuster), **Felix** (Fraud
   Investigator), **Sam** (Supplier Coordinator), and/or **Theo** (Team Leader)
   run between assessment and settlement — determined by the scenario script.
6. **Seth** (Settlement Officer) calculates the payable amount and issues a
   decision (approved, rejected, or partial).
7. **Cara** (Customer Communications Specialist) notifies the customer and
   explains the outcome in plain English.

All agent roles, thresholds, and scripted beats live in `personaData.ts` (personas)
and the scenario JSON files, and are easy to tweak for your demo narrative.

## File map

```
src/ui
├── index.html                  # Page shell + HUD markup
├── package.json                # Vite + Babylon dependencies
├── tsconfig.json
├── vite.config.ts
└── src
    ├── main.ts                 # Engine bootstrap, camera, lights, render loop
    ├── styles.css              # HUD styling (panels, metrics, log)
    ├── officeScene.ts          # Builds the voxel office geometry
    ├── neighbourhoodScene.ts   # Builds the voxel neighbourhood geometry
    ├── neighbourhoodAmbient.ts # Ambient pedestrian and vehicle movement
    ├── voxelCharacter.ts       # Box-built voxel humanoid + walk animation
    ├── characterPalettes.ts    # Per-persona colour palettes
    ├── personaData.ts          # Single source of truth for staff and customer personas
    ├── claimSimulation.ts      # Agent state machines + claim lifecycle
    ├── scenarioPicker.ts       # Scenario selector UI
    ├── scenarioRunner.ts       # Scripted scenario orchestration
    ├── profileCard.ts          # Character profile pop-up
    ├── activityPanel.ts        # Live activity log panel
    ├── hud.ts                  # DOM HUD wired to the SimLogger contract
    └── scenarios/              # Scripted scenario JSON files (home, motor, business, travel, life)
```


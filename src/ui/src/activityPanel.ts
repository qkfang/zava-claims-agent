/**
 * "Currently working" panel shown during a scripted scenario.
 *
 * When a scenario stage starts, this panel displays:
 *  - The staff member's voxel-style face avatar (rendered from the palette)
 *  - Their name and role
 *  - The AI sub-agents currently delegated to that step, each with a
 *    smaller persona face avatar and the agent's name + description
 *
 * The panel is hidden whenever no scripted scenario is in flight, so the
 * UI focuses on the case being played out rather than ambient activity.
 */
import type { StageInfo } from "./stepGate";
import { PALETTES } from "./characterPalettes";
import { findStaffByRole } from "./personaData";

export interface ActivityPanelStage {
  staffName: string;
  staffRole: string;
  staffColor: string;
  staffPaletteKey: string;
  narration: string;
  agents: { name: string; description: string }[];
}

/** Map a StageInfo (from stepGate) to the activity panel view-model. */
export function stageToActivity(stage: StageInfo): ActivityPanelStage {
  const persona = findStaffByRole(stage.staffRole as never);
  return {
    staffName: stage.staffName,
    staffRole: stage.staffRole,
    staffColor: stage.staffColor,
    staffPaletteKey: persona.palette as string,
    narration: stage.narration,
    agents: stage.agents,
  };
}

/** Build a small SVG voxel-face avatar from a palette key. */
function paletteFaceSvg(paletteKey: string, size: number): string {
  const p = PALETTES[paletteKey];
  if (!p) return "";
  const skin = p.skin;
  const hair = p.hair;
  const shirt = p.shirt;
  const eye = p.eye ?? "#22252e";
  // 8x8 grid pixel face using the persona palette so each AI agent reads
  // as a "mini-clone" of its human staff member.
  const u = size / 8;
  const px = (x: number, y: number, w: number, h: number, c: string): string =>
    `<rect x="${x * u}" y="${y * u}" width="${w * u}" height="${h * u}" fill="${c}"/>`;
  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${px(0, 0, 8, 8, "transparent")}
      ${px(1, 1, 6, 1, hair)}
      ${px(1, 2, 6, 3, skin)}
      ${px(2, 3, 1, 1, eye)}
      ${px(5, 3, 1, 1, eye)}
      ${px(0, 5, 8, 3, shirt)}
      ${p.glasses ? `${px(2, 3, 4, 1, "rgba(34,37,46,0.8)")}` : ""}
    </svg>
  `;
}

export class ActivityPanel {
  private readonly el: HTMLElement;

  constructor() {
    const el = document.createElement("aside");
    el.id = "activity-panel";
    el.className = "activity-panel hidden";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
      <h2>Currently working</h2>
      <div class="activity-staff">
        <div class="activity-staff-avatar" aria-hidden="true"></div>
        <div class="activity-staff-text">
          <div class="activity-staff-name"></div>
          <div class="activity-staff-role"></div>
        </div>
      </div>
      <p class="activity-narration"></p>
      <div class="activity-agents-label">AI sub-agents on this step</div>
      <ul class="activity-agents"></ul>
    `;
    document.body.appendChild(el);
    this.el = el;
  }

  show(stage: ActivityPanelStage): void {
    const avatar = this.el.querySelector(
      ".activity-staff-avatar",
    ) as HTMLElement;
    avatar.innerHTML = paletteFaceSvg(stage.staffPaletteKey, 56);
    avatar.style.borderColor = stage.staffColor;
    (this.el.querySelector(".activity-staff-name") as HTMLElement).textContent =
      stage.staffName;
    (this.el.querySelector(".activity-staff-role") as HTMLElement).textContent =
      stage.staffRole;
    (this.el.querySelector(".activity-narration") as HTMLElement).textContent =
      stage.narration;

    const list = this.el.querySelector(".activity-agents") as HTMLUListElement;
    list.innerHTML = "";
    for (const a of stage.agents) {
      const li = document.createElement("li");
      li.className = "activity-agent";
      // Use the same persona palette for the agent face so it reads as a
      // mini-clone of the staff persona — reinforcing the "Agent Iris #N"
      // naming scheme from docs/characters.md.
      li.innerHTML = `
        <div class="activity-agent-avatar" aria-hidden="true">${paletteFaceSvg(
          stage.staffPaletteKey,
          40,
        )}</div>
        <div class="activity-agent-text">
          <div class="activity-agent-name"></div>
          <div class="activity-agent-desc"></div>
        </div>
      `;
      const [agentName, ...descParts] = a.name.split(" — ");
      (li.querySelector(".activity-agent-name") as HTMLElement).textContent =
        agentName;
      (li.querySelector(".activity-agent-desc") as HTMLElement).textContent =
        descParts.length > 0 ? descParts.join(" — ") : a.description;
      list.appendChild(li);
    }
    this.el.classList.remove("hidden");
  }

  /** Update only the narration line for the current stage. */
  updateNarration(narration: string): void {
    if (this.el.classList.contains("hidden")) return;
    (this.el.querySelector(".activity-narration") as HTMLElement).textContent =
      narration;
  }

  hide(): void {
    this.el.classList.add("hidden");
  }
}

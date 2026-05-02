import { AgentRole, SimLogger } from "./claimSimulation";
import type { VoxelCharacterPalette } from "./voxelCharacter";
import { renderCharacterFigureSvg } from "./characterFigure";

/**
 * Wires the in-DOM HUD (top-bar metrics, agent panel, activity log) to the
 * simulation via the SimLogger contract.
 */
export class HudLogger implements SimLogger {
  private readonly metricEls: Record<string, HTMLElement>;
  private readonly logList: HTMLOListElement;
  private readonly agentList: HTMLUListElement;
  private readonly agentEls = new Map<string, HTMLLIElement>();

  constructor() {
    this.metricEls = {
      submitted: HudLogger.must("metric-submitted"),
      processing: HudLogger.must("metric-processing"),
      approved: HudLogger.must("metric-approved"),
      rejected: HudLogger.must("metric-rejected"),
    };
    this.logList = HudLogger.must("log-list") as HTMLOListElement;
    this.agentList = HudLogger.must("agents-list") as HTMLUListElement;
  }

  private static must(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`HUD element #${id} not found`);
    return el;
  }

  setMetric(name: "submitted" | "processing" | "approved" | "rejected", value: number): void {
    this.metricEls[name].textContent = String(value);
  }

  registerAgent(info: { id: string; name: string; role: AgentRole; color: string; palette: VoxelCharacterPalette }): void {
    const li = document.createElement("li");
    li.className = "agent-card idle";
    li.dataset.id = info.id;
    const figure = renderCharacterFigureSvg(info.palette, info.color);
    li.innerHTML = `
      <div class="figure">${figure}</div>
      <div>
        <div class="name"></div>
        <div class="role"></div>
      </div>
      <div class="status">Idle</div>
    `;
    (li.querySelector(".name") as HTMLElement).textContent = info.name;
    (li.querySelector(".role") as HTMLElement).textContent = info.role;
    this.agentList.appendChild(li);
    this.agentEls.set(info.id, li);
  }

  setAgentStatus(id: string, busy: boolean, activity: string): void {
    const li = this.agentEls.get(id);
    if (!li) return;
    li.classList.toggle("busy", busy);
    li.classList.toggle("idle", !busy);
    const status = li.querySelector(".status") as HTMLElement;
    status.textContent = activity;
  }

  log(message: string, kind: "info" | "good" | "bad" | "warn" = "info"): void {
    const li = document.createElement("li");
    if (kind !== "info") li.classList.add(kind);
    const t = document.createElement("time");
    const now = new Date();
    t.textContent = now.toLocaleTimeString();
    li.appendChild(t);
    li.appendChild(document.createTextNode(message));
    this.logList.insertBefore(li, this.logList.firstChild);
    // Cap log size.
    while (this.logList.children.length > 60) {
      this.logList.lastElementChild?.remove();
    }
  }
}


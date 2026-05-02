/**
 * Step gate — a modal that pauses the scripted simulation at the start of
 * each major pipeline step (intake, assessment, loss adjusting, supplier
 * coordination, fraud, team leader, settlement, customer communications).
 *
 * The popup names the staff member taking the case, lists the AI sub-agents
 * delegated under them (matching docs/foundry_agents.md), and offers:
 *  - Continue (proceed to this step manually),
 *  - Auto-play (skip the gate for the rest of the scenario).
 *
 * Auto-play can also be enabled up-front via the scenario picker.
 */

export type StageKey =
  | "intake-pickup"
  | "assessor-pickup"
  | "consult:Loss Adjuster"
  | "consult:Supplier Coordinator"
  | "consult:Fraud Investigator"
  | "consult:Claims Team Leader"
  | "settle"
  | "comms-notify";

export interface StageInfo {
  /** Short title shown in the popup header. */
  title: string;
  /** Step number relative to the scripted scenario (filled at runtime). */
  stepNumber?: number;
  /** Total step count (filled at runtime). */
  totalSteps?: number;
  /** Friendly staff role label (e.g. "Claims Intake Officer"). */
  staffRole: string;
  /** Staff persona name (e.g. "Iris"). */
  staffName: string;
  /** Staff swatch color. */
  staffColor: string;
  /** Plain-English narration of what is about to happen. */
  narration: string;
  /** AI sub-agents delegated for this step. */
  agents: { name: string; description: string }[];
}

/** Stage configuration — title and AI sub-agents (from docs/characters.md). */
export const STAGE_CONFIG: Record<
  StageKey,
  { title: string; agents: { name: string; description: string }[] }
> = {
  "intake-pickup": {
    title: "Claims Intake",
    agents: [
      {
        name: "Agent Iris #1 — Intake Triage Assistant",
        description:
          "Captures first notice of loss, extracts policy & incident details, and triages urgency for Iris.",
      },
      {
        name: "Agent Iris #2 — Document Checklist Assistant",
        description:
          "Builds the right document checklist for the claim type and chases missing items.",
      },
    ],
  },
  "assessor-pickup": {
    title: "Claims Assessment",
    agents: [
      {
        name: "Agent Adam #1 — Coverage Analysis Assistant",
        description:
          "Reads the policy schedule and drafts a preliminary coverage opinion with citations.",
      },
      {
        name: "Agent Adam #2 — Evidence Review Assistant",
        description:
          "Summarises photos, invoices and reports, and highlights gaps for Adam to follow up.",
      },
    ],
  },
  "consult:Loss Adjuster": {
    title: "Loss Adjusting",
    agents: [
      {
        name: "Agent Lara #1 — Site Visit Assistant",
        description:
          "Prepares pre-visit briefings and inspection checklists, then summarises on-site findings.",
      },
      {
        name: "Agent Lara #2 — Valuation & Reporting Assistant",
        description:
          "Cross-references quotes and market rates, drafts a loss valuation and assessment report.",
      },
    ],
  },
  "consult:Supplier Coordinator": {
    title: "Supplier Coordination",
    agents: [
      {
        name: "Agent Sam #1 — Supplier Coordination Assistant",
        description:
          "Recommends approved suppliers, drafts booking requests, and tracks ETAs and quotes.",
      },
    ],
  },
  "consult:Fraud Investigator": {
    title: "Fraud Review",
    agents: [
      {
        name: "Agent Felix #1 — Anomaly Detection Assistant",
        description:
          "Scans narratives, timelines and documents for inconsistencies and assigns a structured risk indicator.",
      },
      {
        name: "Agent Felix #2 — Verification Assistant",
        description:
          "Cross-checks claim history, drafts third-party verification queries, and prepares an initial findings pack.",
      },
    ],
  },
  "consult:Claims Team Leader": {
    title: "Team Leader Review",
    agents: [
      {
        name: "Agent Theo #1 — Workload & Escalation Assistant",
        description:
          "Monitors queue volumes, SLA risk, and ageing claims, and surfaces priority escalations.",
      },
      {
        name: "Agent Theo #2 — Quality & Complaints Assistant",
        description:
          "Samples completed claims for quality review and flags regulatory or reputational risk.",
      },
    ],
  },
  settle: {
    title: "Settlement",
    agents: [
      {
        name: "Agent Seth #1 — Settlement Calculation Assistant",
        description:
          "Aggregates assessment outcomes, costs and adjustments, and drafts the settlement statement.",
      },
      {
        name: "Agent Seth #2 — Adjustment Validation Assistant",
        description:
          "Re-checks excess, sub-limits and depreciation, and flags figures outside expected ranges.",
      },
    ],
  },
  "comms-notify": {
    title: "Customer Communications",
    agents: [
      {
        name: "Agent Cara #1 — Status Update Assistant",
        description:
          "Drafts status updates and outcome letters tailored to the claim stage and customer.",
      },
      {
        name: "Agent Cara #2 — Tone & Plain-English Assistant",
        description:
          "Reviews drafts for empathy, clarity and brand tone, rewriting jargon into plain English.",
      },
    ],
  },
};

/** Stages that should pop the step gate (in order they appear in scripts). */
export const GATED_STAGES = new Set<StageKey>(
  Object.keys(STAGE_CONFIG) as StageKey[],
);

export interface StepGateHooks {
  /** Called when the user clicks Continue. */
  onContinue(): void;
  /** Called when the user clicks Auto-play (turns auto-play on for the run). */
  onAutoPlay(): void;
  /** Called when the user closes the gate (cancels the scenario). */
  onCancel(): void;
}

/** UI controller for the step-gate modal. */
export class StepGate {
  private readonly overlay: HTMLDivElement;
  private hooks: StepGateHooks | null = null;
  private opened = false;

  constructor() {
    const overlay = document.createElement("div");
    overlay.id = "step-gate-overlay";
    overlay.className = "modal-overlay step-gate hidden";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "step-gate-title");
    overlay.innerHTML = `
      <div class="modal-card step-card" role="document">
        <header>
          <div class="step-header-left">
            <div class="step-counter"></div>
            <h2 id="step-gate-title"></h2>
          </div>
          <button class="close" aria-label="Cancel scenario">×</button>
        </header>
        <div class="step-staff">
          <div class="step-staff-dot"></div>
          <div>
            <div class="step-staff-name"></div>
            <div class="step-staff-role"></div>
          </div>
        </div>
        <p class="step-narration"></p>
        <div class="step-agents-label">AI sub-agents delegated to this step</div>
        <ul class="step-agents-list"></ul>
        <footer class="step-footer">
          <button type="button" class="step-autoplay">▶ Auto-play rest</button>
          <button type="button" class="step-continue">Continue</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    overlay
      .querySelector(".step-continue")!
      .addEventListener("click", () => this.handleContinue());
    overlay
      .querySelector(".step-autoplay")!
      .addEventListener("click", () => this.handleAutoplay());
    overlay
      .querySelector(".close")!
      .addEventListener("click", () => this.handleCancel());
  }

  open(info: StageInfo, hooks: StepGateHooks): void {
    this.hooks = hooks;
    this.opened = true;
    const counter =
      info.stepNumber && info.totalSteps
        ? `Step ${info.stepNumber} of ${info.totalSteps}`
        : "";
    (this.overlay.querySelector(".step-counter") as HTMLElement).textContent =
      counter;
    (this.overlay.querySelector("#step-gate-title") as HTMLElement).textContent =
      info.title;
    (
      this.overlay.querySelector(".step-staff-dot") as HTMLElement
    ).style.background = info.staffColor;
    (this.overlay.querySelector(".step-staff-name") as HTMLElement).textContent =
      info.staffName;
    (this.overlay.querySelector(".step-staff-role") as HTMLElement).textContent =
      info.staffRole;
    (this.overlay.querySelector(".step-narration") as HTMLElement).textContent =
      info.narration;

    const list = this.overlay.querySelector(
      ".step-agents-list",
    ) as HTMLUListElement;
    list.innerHTML = "";
    for (const a of info.agents) {
      const li = document.createElement("li");
      li.className = "step-agent";
      li.innerHTML = `
        <span class="bulb" aria-hidden="true">💡</span>
        <div>
          <div class="step-agent-name"></div>
          <div class="step-agent-desc"></div>
        </div>
      `;
      (li.querySelector(".step-agent-name") as HTMLElement).textContent = a.name;
      (li.querySelector(".step-agent-desc") as HTMLElement).textContent =
        a.description;
      list.appendChild(li);
    }

    this.overlay.classList.remove("hidden");
    (this.overlay.querySelector(".step-continue") as HTMLButtonElement).focus();
  }

  close(): void {
    this.opened = false;
    this.overlay.classList.add("hidden");
    this.hooks = null;
  }

  isOpen(): boolean {
    return this.opened;
  }

  private handleContinue(): void {
    const h = this.hooks;
    this.close();
    h?.onContinue();
  }

  private handleAutoplay(): void {
    const h = this.hooks;
    this.close();
    h?.onAutoPlay();
  }

  private handleCancel(): void {
    const h = this.hooks;
    this.close();
    h?.onCancel();
  }
}

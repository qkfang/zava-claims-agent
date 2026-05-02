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
  /** Staff persona name (e.g. "Sarah Mitchell"). */
  staffName: string;
  /** Staff swatch color. */
  staffColor: string;
  /** Plain-English narration of what is about to happen. */
  narration: string;
  /** AI sub-agents delegated for this step. */
  agents: { name: string; description: string }[];
}

/** Stage configuration — title and AI sub-agents (from foundry_agents.md). */
export const STAGE_CONFIG: Record<
  StageKey,
  { title: string; agents: { name: string; description: string }[] }
> = {
  "intake-pickup": {
    title: "Claims Intake",
    agents: [
      { name: "Policy Lookup AI", description: "Pulls the customer policy and confirms cover is active." },
      { name: "Document Checklist AI", description: "Builds a tailored evidence checklist for the claim type." },
      { name: "Urgency & Vulnerability AI", description: "Flags urgent or vulnerable cases for fast-track handling." },
    ],
  },
  "assessor-pickup": {
    title: "Claims Assessment",
    agents: [
      { name: "Coverage Rules AI", description: "Checks the policy wording for inclusions and exclusions." },
      { name: "Evidence Review AI", description: "Summarises submitted evidence and spots gaps." },
      { name: "Decision Drafting AI", description: "Drafts a plain-English coverage recommendation." },
    ],
  },
  "consult:Loss Adjuster": {
    title: "Loss Adjusting",
    agents: [
      { name: "Damage Photo AI", description: "Reads inspection photos and tags affected items." },
      { name: "Scope Drafting AI", description: "Drafts a structured damage scope and repair list." },
      { name: "Cost Benchmark AI", description: "Sanity-checks repair costs against market benchmarks." },
    ],
  },
  "consult:Supplier Coordinator": {
    title: "Supplier Coordination",
    agents: [
      { name: "Supplier Match AI", description: "Picks an approved repairer near the customer." },
      { name: "Job Booking AI", description: "Books and confirms the appointment by SMS." },
      { name: "Quote Reasonableness AI", description: "Validates supplier quotes against the agreed scope." },
    ],
  },
  "consult:Fraud Investigator": {
    title: "Fraud Review",
    agents: [
      { name: "Risk Scoring AI", description: "Scores fraud risk and explains every flag." },
      { name: "Timeline Consistency AI", description: "Checks the story for timeline contradictions." },
      { name: "Duplicate Receipt AI", description: "Detects duplicated or altered receipts." },
    ],
  },
  "consult:Claims Team Leader": {
    title: "Team Leader Review",
    agents: [
      { name: "Escalation Triage AI", description: "Surfaces complex or sensitive cases for oversight." },
      { name: "Approval Authority AI", description: "Confirms the right delegated authority is signing off." },
    ],
  },
  settle: {
    title: "Settlement",
    agents: [
      { name: "Payment Calc AI", description: "Calculates payouts including excess and policy limits." },
      { name: "Payee Validation AI", description: "Validates payee details before money moves." },
      { name: "Multi-party Payments AI", description: "Splits payments across builder, supplier, and customer." },
    ],
  },
  "comms-notify": {
    title: "Customer Communications",
    agents: [
      { name: "Empathetic Drafting AI", description: "Drafts a warm, plain-English update for the customer." },
      { name: "Tone Check AI", description: "Adjusts tone for stress, grief, or urgency." },
      { name: "Channel Choice AI", description: "Picks SMS, email, or call based on customer preference." },
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

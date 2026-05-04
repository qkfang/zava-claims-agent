import { CUSTOMER_PERSONAS, type ScenarioId } from "./personaData";
import { SCENARIO_NUMBER } from "./scenarioNumbers";

/**
 * Modal dialog shown when the user clicks "Submit a claim". Lists the
 * five scenario personas plus a Random option. On confirm, calls the
 * provided onPick callback and closes itself.
 *
 * The picker also exposes an "Auto-play" checkbox: when checked, the
 * scenario will run end-to-end without pausing for the per-step gate.
 */
export class ScenarioPicker {
  private readonly overlay: HTMLDivElement;
  private opened = false;
  /** Whether the user wants the next scenario to auto-play through every step. */
  private autoPlay = false;

  constructor(
    private readonly onPick: (
      id: ScenarioId | "random",
      opts: { autoPlay: boolean },
    ) => void,
  ) {
    const overlay = document.createElement("div");
    overlay.id = "scenario-picker-overlay";
    overlay.className = "modal-overlay hidden";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "scenario-picker-title");
    overlay.innerHTML = `
      <div class="modal-card" role="document">
        <header>
          <h2 id="scenario-picker-title">Submit a claim</h2>
          <button class="close" aria-label="Close">×</button>
        </header>
        <p class="modal-intro">
          Pick one of our five customer scenarios to follow them through the
          claims journey — from the neighbourhood incident, all the way to
          settlement.
        </p>
        <ul class="scenario-grid"></ul>
        <footer>
          <label class="autoplay-toggle">
            <input type="checkbox" class="autoplay-checkbox" />
            <span>Auto-play (skip the step-by-step prompts)</span>
          </label>
          <button class="random" type="button">Random scenario</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    const grid = overlay.querySelector(".scenario-grid") as HTMLUListElement;
    // Sort by scenario number so the picker reads 1..5 left-to-right.
    const sortedPersonas = [...CUSTOMER_PERSONAS].sort(
      (a, b) => SCENARIO_NUMBER[a.id] - SCENARIO_NUMBER[b.id],
    );
    for (const p of sortedPersonas) {
      const li = document.createElement("li");
      li.className = "scenario-option";
      li.dataset.id = p.id;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      const num = SCENARIO_NUMBER[p.id];
      li.innerHTML = `
        <div class="dot" style="background:${p.color}"></div>
        <div class="scenario-number">Scenario #${num}</div>
        <div class="scenario-name"></div>
        <div class="scenario-type"></div>
        <div class="scenario-situation"></div>
      `;
      (li.querySelector(".scenario-name") as HTMLElement).textContent = p.name;
      (li.querySelector(".scenario-type") as HTMLElement).textContent =
        p.claim_type;
      (li.querySelector(".scenario-situation") as HTMLElement).textContent =
        p.situation;
      const handler = (): void => {
        this.close();
        this.onPick(p.id, { autoPlay: this.autoPlay });
      };
      li.addEventListener("click", handler);
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          handler();
        }
      });
      grid.appendChild(li);
    }

    const checkbox = overlay.querySelector(
      ".autoplay-checkbox",
    ) as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      this.autoPlay = checkbox.checked;
    });

    (overlay.querySelector(".random") as HTMLButtonElement).addEventListener(
      "click",
      () => {
        this.close();
        this.onPick("random", { autoPlay: this.autoPlay });
      },
    );

    (overlay.querySelector(".close") as HTMLButtonElement).addEventListener(
      "click",
      () => this.close(),
    );

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) this.close();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.opened) this.close();
    });
  }

  open(): void {
    this.opened = true;
    this.overlay.classList.remove("hidden");
    const first = this.overlay.querySelector(
      ".scenario-option",
    ) as HTMLElement | null;
    first?.focus();
  }

  close(): void {
    this.opened = false;
    this.overlay.classList.add("hidden");
  }
}

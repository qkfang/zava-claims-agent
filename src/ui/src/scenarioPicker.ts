import { CUSTOMER_PERSONAS, type ScenarioId } from "./personaData";

/**
 * Modal dialog shown when the user clicks "Submit a claim". Lists the
 * five scenario personas plus a Random option. On confirm, calls the
 * provided onPick callback and closes itself.
 */
export class ScenarioPicker {
  private readonly overlay: HTMLDivElement;
  private opened = false;

  constructor(private readonly onPick: (id: ScenarioId | "random") => void) {
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
          <button class="random" type="button">Random scenario</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    const grid = overlay.querySelector(".scenario-grid") as HTMLUListElement;
    for (const p of CUSTOMER_PERSONAS) {
      const li = document.createElement("li");
      li.className = "scenario-option";
      li.dataset.id = p.id;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.innerHTML = `
        <div class="dot" style="background:${p.color}"></div>
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
        this.onPick(p.id);
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

    (overlay.querySelector(".random") as HTMLButtonElement).addEventListener(
      "click",
      () => {
        this.close();
        this.onPick("random");
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

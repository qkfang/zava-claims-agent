import type { ClaimSimulation, CharacterProfile } from "./claimSimulation";
import { renderCharacterFigureSvg } from "./characterFigure";

/**
 * Floating profile card shown when a character is clicked.
 *
 * The card auto-refreshes once per second by re-querying the simulation
 * so live status (current task, claim id) stays current. Closes on
 * Escape, click-outside, or the close button.
 */
export class ProfileCard {
  private readonly el: HTMLDivElement;
  private currentId: string | null = null;
  private refreshHandle: number | null = null;

  constructor(private readonly sim: ClaimSimulation) {
    const el = document.createElement("div");
    el.id = "profile-card";
    el.className = "profile-card hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.tabIndex = -1;
    document.body.appendChild(el);
    this.el = el;

    // Click-outside-to-close: register on body but ignore clicks on the card
    // itself or on the canvas (canvas clicks are how we open the card).
    document.addEventListener("pointerdown", (ev) => {
      if (!this.isOpen()) return;
      const target = ev.target as Node | null;
      if (target && this.el.contains(target)) return;
      // Don't close when clicking the canvas — that's how a new selection works.
      if (
        target instanceof HTMLElement &&
        target.id === "renderCanvas"
      ) {
        return;
      }
      this.close();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen(): boolean {
    return this.currentId !== null;
  }

  open(characterId: string): void {
    const profile = this.sim.getCharacterProfile(characterId);
    if (!profile) return;
    this.currentId = characterId;
    this.render(profile);
    this.el.classList.remove("hidden");
    this.el.focus();
    if (this.refreshHandle === null) {
      this.refreshHandle = window.setInterval(() => this.refresh(), 1000);
    }
  }

  close(): void {
    if (!this.isOpen()) return;
    this.currentId = null;
    this.el.classList.add("hidden");
    if (this.refreshHandle !== null) {
      window.clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
    this.sim.setHighlightedCharacter(null);
  }

  private refresh(): void {
    if (!this.currentId) return;
    const profile = this.sim.getCharacterProfile(this.currentId);
    if (!profile) {
      this.close();
      return;
    }
    this.render(profile);
  }

  private render(p: CharacterProfile): void {
    const escape = (s: string): string =>
      s.replace(/[&<>"']/g, (c) =>
        c === "&"
          ? "&amp;"
          : c === "<"
          ? "&lt;"
          : c === ">"
          ? "&gt;"
          : c === '"'
          ? "&quot;"
          : "&#39;",
      );

    const headerColor = p.color;
    const titleLine =
      p.kind === "staff" ? p.role : `Customer — ${p.scenarioName}`;

    const responsibilities = p.responsibilities
      .map((r) => `<li>${escape(r)}</li>`)
      .join("");

    const claimsList = p.claims
      .slice(0, 6)
      .map(
        (c) =>
          `<li><strong>${escape(c.id)}</strong> — ${escape(c.type)} <span class="status">${escape(
            c.status,
          )}</span></li>`,
      )
      .join("");

    const currentBlock = p.current
      ? `<div class="profile-current">
            <div class="label">Currently</div>
            <div class="value">${escape(p.current)}</div>
          </div>`
      : "";

    const handlerBlock =
      p.kind === "customer" && p.currentHandler
        ? `<div class="profile-current">
            <div class="label">With</div>
            <div class="value">${escape(p.currentHandler)}</div>
          </div>`
        : "";

    const claimBlock =
      p.kind === "customer" && p.activeClaim
        ? `<div class="profile-current">
            <div class="label">Claim</div>
            <div class="value"><strong>${escape(p.activeClaim.id)}</strong> — ${escape(
              p.activeClaim.type,
            )} · $${p.activeClaim.amount.toLocaleString()} · ${escape(
            p.activeClaim.status,
          )}</div>
          </div>`
        : "";

    const claimsHeading = p.claims.length
      ? `<h3>Recent claims</h3><ul class="profile-claims">${claimsList}</ul>`
      : "";

    this.el.innerHTML = `
      <header style="border-color:${headerColor}">
        <div class="figure">${renderCharacterFigureSvg(p.palette, headerColor)}</div>
        <div>
          <div class="profile-name">${escape(p.name)}</div>
          <div class="profile-role">${escape(titleLine)}</div>
        </div>
        <button class="close" aria-label="Close profile">×</button>
      </header>
      <section>
        ${currentBlock}
        ${handlerBlock}
        ${claimBlock}
        ${
          p.situation
            ? `<p class="profile-situation">${escape(p.situation)}</p>`
            : ""
        }
        <p class="profile-personality">${escape(p.personality)}</p>
        ${
          p.typicalLine
            ? `<blockquote>“${escape(p.typicalLine)}”</blockquote>`
            : ""
        }
        ${
          responsibilities
            ? `<h3>Responsibilities</h3><ul>${responsibilities}</ul>`
            : ""
        }
        ${claimsHeading}
      </section>
    `;

    const closeBtn = this.el.querySelector(".close") as HTMLButtonElement | null;
    closeBtn?.addEventListener("click", () => this.close(), { once: true });
  }
}

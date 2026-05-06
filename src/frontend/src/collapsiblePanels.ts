/**
 * Wires the +/− collapse toggle on side panels (`#agents-panel` and
 * `#log-panel`) and auto-minimises both while a scripted scenario is
 * playing, so the focus stays on the "Currently working" activity panel
 * and the office stage. Users can still manually expand a panel mid-
 * scenario via the toggle; the next scenario state change re-applies
 * the auto behaviour.
 *
 * Also wires the top-right "full page" button (`#left-nav-toggle`),
 * which hides the entire left AI Agents panel for a cleaner stage view.
 */
export function initCollapsiblePanels(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".panel-toggle");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      togglePanel(panel, !panel.classList.contains("collapsed"));
    });
  });

  // Auto-collapse both panels while a scripted scenario is active.
  const apply = (collapsed: boolean): void => {
    document.querySelectorAll<HTMLElement>("aside.collapsible").forEach((p) => {
      togglePanel(p, collapsed);
    });
  };
  const observer = new MutationObserver(() => {
    apply(document.body.classList.contains("scenario-active"));
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Full-page toggle: hides the left AI Agents nav for more screen space.
  const leftNavToggle = document.getElementById("left-nav-toggle");
  if (leftNavToggle) {
    leftNavToggle.addEventListener("click", () => {
      const hidden = document.body.classList.toggle("left-nav-hidden");
      leftNavToggle.setAttribute("aria-pressed", hidden ? "true" : "false");
      leftNavToggle.setAttribute(
        "aria-label",
        hidden ? "Show AI Agents panel" : "Hide AI Agents panel for full page view",
      );
      leftNavToggle.setAttribute(
        "title",
        hidden ? "Exit full page view" : "Full page view (hide AI Agents panel)",
      );
    });
  }
}

function togglePanel(panel: HTMLElement, collapsed: boolean): void {
  panel.classList.toggle("collapsed", collapsed);
  const btn = panel.querySelector<HTMLButtonElement>(".panel-toggle");
  if (!btn) return;
  btn.textContent = collapsed ? "+" : "−";
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const labelBase = btn.getAttribute("aria-label")?.replace(/^(Collapse|Expand) /, "") ?? "panel";
  btn.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${labelBase}`);
}

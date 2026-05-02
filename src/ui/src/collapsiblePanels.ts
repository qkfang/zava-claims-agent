/**
 * Wires the +/− collapse toggle on side panels (`#agents-panel` and
 * `#log-panel`) and auto-minimises both while a scripted scenario is
 * playing, so the focus stays on the "Currently working" activity panel
 * and the office stage. Users can still manually expand a panel mid-
 * scenario via the toggle; the next scenario state change re-applies
 * the auto behaviour.
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

// Drives the two-tab view ("Overview" / "Try it out") on each agent page.
// Uses event delegation on document so it survives Blazor enhancedload swaps.
(function () {
    function activate(scope, tabName) {
        if (!scope) return;
        scope.querySelectorAll(':scope > .agent-tabs .agent-tab').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.tabIndex = isActive ? 0 : -1;
        });
        scope.querySelectorAll(':scope > .agent-tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
    }

    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.agent-tab');
        if (!btn) return;
        const scope = btn.closest('.agent-tab-scope');
        if (!scope) return;
        e.preventDefault();
        activate(scope, btn.dataset.tab);
    });

    // Keyboard support: Left/Right arrows on the tab strip.
    document.addEventListener('keydown', function (e) {
        const btn = e.target.closest('.agent-tab');
        if (!btn) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = Array.from(btn.parentElement.querySelectorAll('.agent-tab'));
        const idx = tabs.indexOf(btn);
        if (idx < 0) return;
        const next = e.key === 'ArrowRight'
            ? tabs[(idx + 1) % tabs.length]
            : tabs[(idx - 1 + tabs.length) % tabs.length];
        const scope = btn.closest('.agent-tab-scope');
        activate(scope, next.dataset.tab);
        next.focus();
        e.preventDefault();
    });
})();

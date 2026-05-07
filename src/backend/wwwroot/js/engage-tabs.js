// Drives the four-tab "Engage Agent" sub-panel that lives inside the
// "Engage <Role> Agent" step on each agent page:
//   1. Agent Narrative — the streamed agent text (starts blank,
//                        fills live as the agent produces output)
//   2. Agent Prompt    — the system prompt + tools (loaded from
//                        /agents/{role}/metadata)
//   3. Agent Input     — the exact prompt the agent received
//                        (populated after the user clicks Engage)
//   4. Raw Output      — the full raw output (text, citations,
//                        every output item the agent produced —
//                        including any function/tool calls — as a
//                        collapsible JSON tree)
//
// The script is idempotent and re-runs on Blazor's enhancedload event
// so it survives streaming page swaps, mirroring agent-tabs.js.
(function () {
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Tiny collapsible JSON viewer. Returns an HTMLElement.
    function buildJsonNode(value, depth) {
        depth = depth || 0;
        const wrap = document.createElement('span');
        wrap.className = 'jv-value';

        if (value === null) {
            wrap.innerHTML = '<span class="jv-null">null</span>';
            return wrap;
        }
        const t = typeof value;
        if (t === 'string') {
            wrap.innerHTML = '<span class="jv-string">"' + escapeHtml(value) + '"</span>';
            return wrap;
        }
        if (t === 'number') {
            wrap.innerHTML = '<span class="jv-number">' + escapeHtml(value) + '</span>';
            return wrap;
        }
        if (t === 'boolean') {
            wrap.innerHTML = '<span class="jv-boolean">' + escapeHtml(value) + '</span>';
            return wrap;
        }

        // Array or object → collapsible block.
        const isArray = Array.isArray(value);
        const entries = isArray
            ? value.map((v, i) => [i, v])
            : Object.entries(value);
        const block = document.createElement('span');
        block.className = 'jv-block';
        // Top two levels open by default; deeper levels collapsed for readability.
        if (depth >= 2 && entries.length > 0) block.classList.add('collapsed');

        const toggle = document.createElement('span');
        toggle.className = 'jv-toggle';
        toggle.textContent = entries.length === 0 ? ' ' : '▾';
        toggle.addEventListener('click', () => {
            block.classList.toggle('collapsed');
            toggle.textContent = block.classList.contains('collapsed') ? '▸' : '▾';
        });
        if (block.classList.contains('collapsed')) toggle.textContent = '▸';
        block.appendChild(toggle);

        const open = document.createElement('span');
        open.className = 'jv-bracket';
        open.textContent = isArray ? '[' : '{';
        block.appendChild(open);

        const summary = document.createElement('span');
        summary.className = 'jv-summary';
        summary.textContent = isArray
            ? ' ' + entries.length + (entries.length === 1 ? ' item ' : ' items ')
            : ' ' + entries.length + (entries.length === 1 ? ' field ' : ' fields ');
        block.appendChild(summary);

        const children = document.createElement('span');
        children.className = 'jv-children';

        entries.forEach(([k, v], idx) => {
            const line = document.createElement('span');
            line.className = 'jv-line';
            if (!isArray) {
                const keySpan = document.createElement('span');
                keySpan.className = 'jv-key';
                keySpan.textContent = '"' + k + '"';
                line.appendChild(keySpan);
                line.appendChild(document.createTextNode(': '));
            }
            line.appendChild(buildJsonNode(v, depth + 1));
            if (idx < entries.length - 1) {
                const comma = document.createElement('span');
                comma.className = 'jv-comma';
                comma.textContent = ',';
                line.appendChild(comma);
            }
            children.appendChild(line);
        });
        block.appendChild(children);

        const close = document.createElement('span');
        close.className = 'jv-bracket';
        close.textContent = isArray ? ']' : '}';
        block.appendChild(close);

        wrap.appendChild(block);
        return wrap;
    }

    function renderJson(target, value) {
        if (!target) return;
        target.innerHTML = '';
        const controls = document.createElement('div');
        controls.className = 'jv-controls';

        const expand = document.createElement('button');
        expand.type = 'button';
        expand.textContent = 'Expand all';
        expand.addEventListener('click', () => {
            target.querySelectorAll('.jv-block.collapsed').forEach(b => {
                b.classList.remove('collapsed');
                const t = b.querySelector(':scope > .jv-toggle');
                if (t && t.textContent.trim()) t.textContent = '▾';
            });
        });
        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.textContent = 'Collapse all';
        collapse.addEventListener('click', () => {
            target.querySelectorAll('.jv-block').forEach(b => {
                if (b.querySelectorAll(':scope > .jv-children > .jv-line').length === 0) return;
                b.classList.add('collapsed');
                const t = b.querySelector(':scope > .jv-toggle');
                if (t && t.textContent.trim()) t.textContent = '▸';
            });
        });
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy JSON';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
                const prev = copy.textContent;
                copy.textContent = 'Copied';
                setTimeout(() => copy.textContent = prev, 1200);
            } catch (e) { /* ignore */ }
        });

        controls.appendChild(expand);
        controls.appendChild(collapse);
        controls.appendChild(copy);
        target.appendChild(controls);

        const tree = document.createElement('div');
        tree.appendChild(buildJsonNode(value, 0));
        target.appendChild(tree);
    }

    // Tab switching scoped to the nearest .engage-tabs-scope.
    function activateTab(scope, tab) {
        if (!scope) return;
        scope.querySelectorAll(':scope > .engage-tabs > .engage-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.engageTab === tab);
        });
        scope.querySelectorAll(':scope > .engage-tab-panel').forEach(p => {
            p.classList.toggle('active', p.dataset.engageTab === tab);
        });
    }

    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.engage-tab-btn');
        if (!btn) return;
        const scope = btn.closest('.engage-tabs-scope');
        if (!scope) return;
        e.preventDefault();
        activateTab(scope, btn.dataset.engageTab);
    });

    // Load metadata for a given agent role into Tab 2 of the scope.
    async function loadMetadata(scope) {
        const role = scope.dataset.engageRole;
        const promptEl = scope.querySelector('.engage-prompt-body');
        const toolsEl = scope.querySelector('.engage-tools-list');
        const metaEl = scope.querySelector('.engage-meta');
        if (!role || !promptEl) return;
        try {
            const res = await fetch('/agents/' + encodeURIComponent(role) + '/metadata');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const m = await res.json();
            promptEl.textContent = m.instructions || '';
            if (metaEl) {
                metaEl.innerHTML =
                    '<div><span class="k">Persona</span>' + escapeHtml(m.name || '') + '</div>' +
                    '<div><span class="k">Role</span>' + escapeHtml(m.role || '') + '</div>' +
                    '<div><span class="k">Department</span>' + escapeHtml(m.department || '') + '</div>' +
                    '<div><span class="k">Foundry agent ID</span><code>' + escapeHtml(m.agentId || '') + '</code></div>' +
                    '<div><span class="k">Model deployment</span><code>' + escapeHtml(m.modelDeployment || '(not configured)') + '</code></div>' +
                    '<div><span class="k">Foundry status</span>' + (m.isConfigured ? 'Configured' : 'Not configured (demo fallback)') + '</div>';
            }
            if (toolsEl) {
                const tools = (m.configuredTools && m.configuredTools.length)
                    ? m.configuredTools
                    : (m.defaultTools || []);
                toolsEl.innerHTML = tools.length
                    ? tools.map(t => '<li>' + escapeHtml(t) + '</li>').join('')
                    : '<li class="engage-empty">No tools configured.</li>';
            }
        } catch (err) {
            promptEl.textContent = 'Failed to load metadata: ' + err.message;
        }
    }

    // Classify a citation entry into a UI category (web link vs document /
    // search-index hit). Bing-grounded citations always have an http(s)
    // URL; Azure AI Search / Document Intelligence hits either have no URL
    // or a non-http identifier (file id / blob path).
    function classifyReference(c) {
        const url = (c && c.url) ? String(c.url) : '';
        if (/^https?:\/\//i.test(url)) return 'web';
        return 'doc';
    }

    // Render the citations from an agent trace into the "Reference" tab.
    function renderReferences(target, citations) {
        if (!target) return;
        const list = Array.isArray(citations) ? citations : [];
        // De-duplicate by url || title so the same reference quoted in
        // multiple places doesn't bloat the list.
        const seen = new Set();
        const items = [];
        for (const c of list) {
            if (!c) continue;
            const title = (c.title || '').toString();
            const url = (c.url || '').toString();
            const key = url || title;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            items.push({ title, url, kind: classifyReference(c) });
        }
        if (items.length === 0) {
            target.innerHTML = '<div class="engage-empty">No reference documents were cited in the agent response.</div>';
            return;
        }
        target.innerHTML = '<ol class="engage-refs-list">' + items.map((r, i) => {
            const kindLabel = r.kind === 'web' ? 'Web' : 'Document';
            const kindClass = r.kind === 'web' ? 'engage-ref-kind-web' : 'engage-ref-kind-doc';
            const titleText = r.title || r.url || ('Reference ' + (i + 1));
            const titleHtml = r.url
                ? '<a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(titleText) + '</a>'
                : '<span>' + escapeHtml(titleText) + '</span>';
            const urlHtml = (r.url && r.url !== titleText)
                ? '<div class="engage-ref-url">' + escapeHtml(r.url) + '</div>'
                : '';
            return '<li class="engage-ref-card">' +
                '<span class="engage-ref-kind ' + kindClass + '">' + kindLabel + '</span>' +
                '<div class="engage-ref-body">' +
                    '<div class="engage-ref-title">' + titleHtml + '</div>' +
                    urlHtml +
                '</div>' +
            '</li>';
        }).join('') + '</ol>';
    }

    // Public hook used by per-page scripts after they've called the
    // /process endpoint: stash the input + raw output payload into the
    // Engage Agent tabs so operators can inspect them.
    window.engageTabsRender = function (scope, payload) {
        if (!scope) return;
        const inputEl = scope.querySelector('.engage-input-body');
        const outputEl = scope.querySelector('.engage-output-body');
        const narrativeEl = scope.querySelector('.engage-narrative-body');
        const referencesEl = scope.querySelector('.engage-references-body');
        if (inputEl) {
            const input = payload && payload.agentInput;
            inputEl.textContent = input
                ? input
                : '(No agent input — Foundry agent was not invoked. The deterministic demo path produced the result above.)';
            inputEl.classList.toggle('engage-empty', !input);
        }
        if (outputEl) {
            const raw = payload && payload.agentRawOutput;
            if (raw) {
                renderJson(outputEl, raw);
            } else {
                outputEl.innerHTML = '<div class="engage-empty">No raw agent output — Foundry agent was not invoked or returned no items.</div>';
            }
        }
        if (narrativeEl) {
            const notes = payload && payload.agentNotes;
            narrativeEl.classList.remove('agent-md-streaming');
            if (notes && typeof window.zcRenderMarkdown === 'function') {
                window.zcRenderMarkdown(narrativeEl, notes);
            } else if (notes) {
                narrativeEl.textContent = notes;
            } else if (!narrativeEl.textContent.trim()) {
                narrativeEl.innerHTML = '<div class="engage-empty">No narrative produced by the agent.</div>';
            }
        }
        if (referencesEl) {
            const raw = payload && payload.agentRawOutput;
            const citations = (raw && Array.isArray(raw.citations)) ? raw.citations : [];
            renderReferences(referencesEl, citations);
        }
    };

    // Streaming hook called by per-page demo scripts from their onDelta
    // callback: mirrors the streamed agent text into the "Agent Narrative"
    // tab so it accumulates live as the agent generates output.
    window.engageTabsStreamNarrative = function (scope, fullText) {
        if (!scope) return;
        const narrativeEl = scope.querySelector('.engage-narrative-body');
        if (!narrativeEl) return;
        narrativeEl.classList.add('agent-md-streaming');
        narrativeEl.textContent = fullText || '';
    };

    function init() {
        document.querySelectorAll('.engage-tabs-scope').forEach(scope => {
            if (scope.dataset.engageWired === '1') return;
            scope.dataset.engageWired = '1';
            // Initialise the active tab.
            const initial = scope.querySelector(':scope > .engage-tabs > .engage-tab-btn.active') ||
                            scope.querySelector(':scope > .engage-tabs > .engage-tab-btn');
            if (initial) activateTab(scope, initial.dataset.engageTab);
            loadMetadata(scope);
        });
    }

    init();

    if (!window.__engageTabsHook) {
        window.__engageTabsHook = true;
        const hook = () => init();
        if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
            Blazor.addEventListener('enhancedload', hook);
        } else {
            document.addEventListener('enhancedload', hook);
        }
    }
})();

// Auto-extracted from the matching razor page.
// Loaded as a permanent script from App.razor so init runs reliably on full
// page load AND on Blazor enhanced navigation. Inline <script> tags inside
// razor pages do NOT re-execute on enhanced nav, which left dropdowns stuck
// on the SSR fallback (e.g. "— Loading claims —") until manual refresh.
    (function () {
        function init() {
        const root = document.querySelector('.fraud-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const selectEl = $('#fraud-claim-select');
        const refreshBtn = $('#fraud-refresh-btn');
        const emptyEl = $('#fraud-empty');
        const claimStep = $('#fraud-claim-step');
        const claimDetails = $('#fraud-claim-details');
        const docsStep = $('#fraud-docs-step');
        const docsGrid = $('#fraud-case-docs');
        const sampleHost = $('#fraud-sample-host');
        const processStep = $('#fraud-process-step');
        const processBtn = $('#fraud-process-btn');
        const processStatus = $('#fraud-process-status');
        const outputStep = $('#fraud-output-step');
        const riskPill = $('#fraud-risk-pill');
        const riskNum = $('#fraud-risk-num');
        const riskSummary = $('#fraud-risk-summary');
        const indicatorsEl = $('#fraud-indicators');
        const inconsistenciesEl = $('#fraud-inconsistencies');
        const actionsEl = $('#fraud-actions');
        const approvalEl = $('#fraud-approval');
        const docOutputEl = $('#fraud-doc-output');
        const docOutputHint = $('#fraud-doc-output-hint');
        const docCardsEl = $('#fraud-doc-cards');
        const engageScope = $('.engage-tabs-scope');

        let claims = [];
        let selectedClaim = null;
        // documents currently attached to the selected claim
        // (id -> { id, label, kind, src, selected, removable })
        let caseDocs = new Map();
        // full sample manifest, lazy-loaded once
        let sampleManifest = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        function row(k, v, span) {
            const cls = span ? ' span-2' : '';
            return `<div class="${cls.trim()}"><span class="k">${escapeHtml(k)}</span><span>${escapeHtml(v || '—')}</span></div>`;
        }

        function renderClaim(c) {
            claimDetails.innerHTML =
                row('Claim #', c.claimNumber) +
                row('Created', c.createdAt) +
                row('Customer', c.customerName) +
                row('Policy', c.policyNumber) +
                row('Claim type', c.claimType) +
                row('Urgency', c.urgency) +
                row('Incident date', c.incidentDate) +
                row('Estimated loss', c.estimatedLoss) +
                row('Location', c.incidentLocation, true) +
                row('Description', c.incidentDescription, true);
        }

        // ── Lightbox (shared between case docs and sample popover) ──
        function ensureLightbox() {
            let lb = document.getElementById('fraud-lightbox');
            if (lb) return lb;
            lb = document.createElement('div');
            lb.id = 'fraud-lightbox';
            lb.className = 'fraud-lightbox';
            lb.innerHTML = '<button class="fraud-lightbox-close" type="button" aria-label="Close">&times;</button><img alt="" />';
            document.body.appendChild(lb);
            lb.addEventListener('click', e => {
                if (e.target === lb || e.target.classList.contains('fraud-lightbox-close')) {
                    lb.classList.remove('open');
                }
            });
            return lb;
        }
        function openLightbox(src) {
            const lb = ensureLightbox();
            lb.querySelector('img').src = src;
            lb.classList.add('open');
        }

        // ── Case-document grid ────────────────────────────────────
        function renderCaseDocs() {
            if (caseDocs.size === 0) {
                docsGrid.innerHTML = '<div class="fraud-doc-empty muted">No scan documents on this case yet — add one from the popover →</div>';
                return;
            }
            const tiles = [];
            for (const d of caseDocs.values()) {
                tiles.push(`
                    <div class="fraud-doc-tile ${d.selected ? 'selected' : ''} ${d.removable ? 'removable' : ''}" data-doc-id="${escapeHtml(d.id)}">
                        ${d.removable ? '<button type="button" class="fraud-doc-remove" title="Remove from case" aria-label="Remove">✕</button>' : ''}
                        <img src="${escapeHtml(d.src)}" alt="${escapeHtml(d.label)}" loading="lazy" />
                        <div class="fraud-doc-kind">${escapeHtml(d.kind)}</div>
                        <div class="fraud-doc-title">${escapeHtml(d.label)}</div>
                        <label class="fraud-doc-toggle">
                            <input type="checkbox" ${d.selected ? 'checked' : ''} />
                            <span>Include in review</span>
                        </label>
                    </div>`);
            }
            docsGrid.innerHTML = tiles.join('');
            docsGrid.querySelectorAll('.fraud-doc-tile').forEach(tile => {
                const id = tile.dataset.docId;
                tile.querySelector('img').addEventListener('click', () => openLightbox(tile.querySelector('img').src));
                const cb = tile.querySelector('input[type="checkbox"]');
                cb.addEventListener('change', () => {
                    const d = caseDocs.get(id);
                    if (d) { d.selected = cb.checked; tile.classList.toggle('selected', d.selected); }
                });
                const removeBtn = tile.querySelector('.fraud-doc-remove');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        caseDocs.delete(id);
                        renderCaseDocs();
                        renderSamplePopover();
                    });
                }
            });
        }

        async function loadCaseDocs(claimNumber) {
            docsGrid.innerHTML = '<div class="fraud-doc-empty muted">Loading case documents…</div>';
            caseDocs = new Map();
            try {
                const res = await fetch(`/fraud/claims/${encodeURIComponent(claimNumber)}/documents`);
                if (res.ok) {
                    const docs = await res.json();
                    docs.forEach(d => caseDocs.set(d.id, { ...d, selected: true, removable: false }));
                }
            } catch (err) {
                console.warn('Fraud case docs load failed', err);
            }
            renderCaseDocs();
            renderSamplePopover();
        }

        // ── Sample-doc popover (own mini implementation, scoped so it
        //    doesn't collide with the Notice pages' SAMPLE_DOCS list) ──
        async function ensureSampleManifest() {
            if (sampleManifest) return sampleManifest;
            try {
                const res = await fetch('/fraud/samples');
                sampleManifest = res.ok ? await res.json() : [];
            } catch {
                sampleManifest = [];
            }
            return sampleManifest;
        }

        function renderSamplePopover() {
            sampleHost.innerHTML = `
                <button type="button" class="fraud-sample-trigger" id="fraud-sample-trigger">📎 Add sample docs</button>
                <div class="fraud-sample-popover" id="fraud-sample-popover" role="dialog" aria-label="Sample documents">
                    <div class="sample-docs-title" style="font-weight:600; color:#fff; margin-bottom:4px;">Sample Documents</div>
                    <div class="sample-docs-hint" style="font-size:0.76rem; color:#97a3b6; margin-bottom:8px;">
                        Click an image to preview, or "Add" to attach it to this case.
                    </div>
                    <div class="fraud-sample-grid" id="fraud-sample-grid">
                        <div class="muted" style="padding:0.4rem;">Loading samples…</div>
                    </div>
                </div>`;
            const trigger = sampleHost.querySelector('#fraud-sample-trigger');
            const popover = sampleHost.querySelector('#fraud-sample-popover');
            const grid = sampleHost.querySelector('#fraud-sample-grid');

            // Position the popover relative to the trigger.
            sampleHost.style.position = 'relative';

            function close() { popover.classList.remove('open'); }
            trigger.addEventListener('click', async () => {
                const willOpen = !popover.classList.contains('open');
                document.querySelectorAll('.fraud-sample-popover.open').forEach(p => p.classList.remove('open'));
                if (!willOpen) return;
                popover.classList.add('open');
                const samples = await ensureSampleManifest();
                if (!samples.length) {
                    grid.innerHTML = '<div class="muted" style="padding:0.4rem;">No samples available.</div>';
                    return;
                }
                grid.innerHTML = samples.map(s => {
                    const already = caseDocs.has(s.id);
                    return `
                        <div class="fraud-sample-tile" data-sample-id="${escapeHtml(s.id)}">
                            <img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.label)}" loading="lazy" />
                            <div class="fraud-sample-label">${escapeHtml(s.label)}</div>
                            <button type="button" class="fraud-sample-add" ${already ? 'disabled' : ''}>${already ? 'Attached' : 'Add'}</button>
                        </div>`;
                }).join('');
                grid.querySelectorAll('.fraud-sample-tile').forEach(tile => {
                    const id = tile.dataset.sampleId;
                    const sample = samples.find(s => s.id === id);
                    tile.querySelector('img').addEventListener('click', () => openLightbox(sample.src));
                    tile.querySelector('.fraud-sample-add').addEventListener('click', () => {
                        if (!sample || caseDocs.has(sample.id)) return;
                        caseDocs.set(sample.id, {
                            id: sample.id, label: sample.label, kind: sample.kind, src: sample.src,
                            selected: true, removable: true,
                        });
                        renderCaseDocs();
                        renderSamplePopover();
                    });
                });
            });

            document.addEventListener('click', e => {
                if (!sampleHost.contains(e.target)) close();
            }, { capture: true, once: true });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
        }

        function selectedDocumentIds() {
            return Array.from(caseDocs.values()).filter(d => d.selected).map(d => d.id);
        }

        // ── Render per-document authenticity output ──
        function checkIcon(status) {
            switch ((status || '').toLowerCase()) {
                case 'pass': return '<span class="check-icon pass">✓</span>';
                case 'fail': return '<span class="check-icon fail">✗</span>';
                case 'warn': return '<span class="check-icon warn">⚠</span>';
                default:     return '<span class="check-icon na">–</span>';
            }
        }

        function renderDocCards(documents, cuConfigured) {
            if (!documents || !documents.length) {
                docOutputEl.hidden = true;
                docCardsEl.innerHTML = '';
                return;
            }
            docOutputEl.hidden = false;
            docOutputHint.textContent = cuConfigured
                ? `Each document was processed through Azure Content Understanding and the deterministic checks layer.`
                : `Content Understanding is not configured — the checks layer ran against manifest expectations only.`;
            docCardsEl.innerHTML = documents.map((d, idx) => {
                const verdict = (d.verdict || 'suspicious').toLowerCase();
                const reasons = (d.failureReasons || []);
                const checks = (d.checks || []);
                const reasonsHtml = reasons.length
                    ? `<ul class="fraud-doc-reasons">${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
                    : `<p class="muted" style="margin:0; font-size:0.84rem;">No failure reasons — every check passed.</p>`;
                const checksHtml = `<ul class="fraud-doc-checks">${checks.map(c => `
                    <li>${checkIcon(c.status)}<div><div class="check-name">${escapeHtml(c.name)}</div><div class="check-detail">${escapeHtml(c.detail)}</div></div></li>`).join('')}</ul>`;
                const cuBlock = d.cuMarkdown
                    ? `<details class="fraud-doc-cu"><summary>Content Understanding output (markdown)</summary><pre>${escapeHtml(d.cuMarkdown)}</pre></details>`
                    : '';
                return `
                    <div class="fraud-doc-card" data-doc-id="${escapeHtml(d.id)}">
                        <div><img src="${escapeHtml(d.src)}" alt="${escapeHtml(d.label)}" loading="lazy" /></div>
                        <div>
                            <div class="fraud-doc-card-head">
                                <span class="fraud-doc-card-title">Document #${idx + 1} — ${escapeHtml(d.label)}</span>
                                <span class="fraud-doc-verdict ${verdict}">${escapeHtml(verdict)}</span>
                                <span class="fraud-doc-card-kind">${escapeHtml(d.kind)}</span>
                                <span class="fraud-doc-source">${escapeHtml(d.source || '')}</span>
                            </div>
                            <div class="fraud-doc-section-label">Why this verdict</div>
                            ${reasonsHtml}
                            <div class="fraud-doc-section-label">Checks performed</div>
                            ${checksHtml}
                            ${cuBlock}
                        </div>
                    </div>`;
            }).join('');
            docCardsEl.querySelectorAll('.fraud-doc-card img').forEach(img => {
                img.addEventListener('click', () => openLightbox(img.src));
            });
        }

        async function loadClaims(preserveSelection) {
            const previous = preserveSelection ? selectEl.value : null;
            selectEl.innerHTML = '<option value="">— Loading claims… —</option>';
            try {
                const res = await fetch('/fraud/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                claims = await res.json();
                if (!claims.length) {
                    selectEl.innerHTML = '<option value="">— No claims yet —</option>';
                    emptyEl.hidden = false;
                    claimStep.hidden = true;
                    docsStep.hidden = true;
                    processStep.hidden = true;
                    outputStep.hidden = true;
                    return;
                }
                emptyEl.hidden = true;
                selectEl.innerHTML =
                    '<option value="">— Select a claim —</option>' +
                    claims.map(c => `<option value="${escapeHtml(c.claimNumber)}">${escapeHtml(c.claimNumber)} — ${escapeHtml(c.customerName)} (${escapeHtml(c.claimType)})</option>`).join('');
                if (previous && claims.some(c => c.claimNumber === previous)) {
                    selectEl.value = previous;
                    selectClaim(previous);
                }
            } catch (err) {
                selectEl.innerHTML = '<option value="">— Failed to load —</option>';
                emptyEl.hidden = false;
                emptyEl.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        function selectClaim(claimNumber) {
            selectedClaim = claims.find(c => c.claimNumber === claimNumber) || null;
            outputStep.hidden = true;
            processStatus.hidden = true;
            docOutputEl.hidden = true;
            if (!selectedClaim) {
                claimStep.hidden = true;
                docsStep.hidden = true;
                processStep.hidden = true;
                return;
            }
            renderClaim(selectedClaim);
            claimStep.hidden = false;
            docsStep.hidden = false;
            processStep.hidden = false;
            processBtn.disabled = false;
            loadCaseDocs(selectedClaim.claimNumber);
        }

        async function processClaim() {
            if (!selectedClaim) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'fraud-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Fraud Investigation Agent…';
            outputStep.hidden = true;

            try {
                const data = await window.zcAgentStream({
                    url: '/fraud/process',
                    body: {
                        claimNumber: selectedClaim.claimNumber,
                        documentIds: selectedDocumentIds(),
                    },
                    onDelta: (_chunk, fullText) => {
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
                    },
                    onError: (msg) => {
                        processStatus.className = 'fraud-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                processStatus.textContent = data.agentConfigured
                    ? 'Fraud Investigation Agent completed the review.'
                    : 'Reviewed (Foundry agent not configured — using deterministic demo analysis).';

                const level = (data.riskLevel || 'Medium').toString();
                riskPill.textContent = level;
                riskPill.className = 'fraud-risk-pill ' + level.toLowerCase();
                riskNum.textContent = (typeof data.riskScore === 'number') ? `Score: ${data.riskScore}/100` : '';
                riskSummary.textContent = data.riskSummary || '';

                indicatorsEl.innerHTML = (data.indicators || []).map(i => `<li>${escapeHtml(i)}</li>`).join('') || '<li class="muted">None detected.</li>';
                inconsistenciesEl.innerHTML = (data.inconsistencies || []).map(i => `<li>${escapeHtml(i)}</li>`).join('') || '<li class="muted">None.</li>';
                actionsEl.innerHTML = (data.actions || []).map(a => `<li>${escapeHtml(a)}</li>`).join('') || '<li class="muted">No further action recommended.</li>';
                approvalEl.textContent = data.approvalRequired || 'Yes — fraud-related decisions always require human approval.';

                renderDocCards(data.documents || [], !!data.contentUnderstandingConfigured);

                outputStep.hidden = false;
                outputStep.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }
            } catch (err) {
                processStatus.className = 'fraud-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                processBtn.disabled = false;
            }
        }

        selectEl.addEventListener('change', () => selectClaim(selectEl.value));
        refreshBtn.addEventListener('click', () => loadClaims(true));
        processBtn.addEventListener('click', processClaim);

        loadClaims(false);
        }

        init();

        if (!window.__fraudDemoEnhancedHook) {
            window.__fraudDemoEnhancedHook = true;
            const hook = () => init();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

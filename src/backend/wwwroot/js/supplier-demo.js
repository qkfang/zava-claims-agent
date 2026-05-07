// Auto-extracted from the matching razor page.
// Loaded as a permanent script from App.razor so init runs reliably on full
// page load AND on Blazor enhanced navigation. Inline <script> tags inside
// razor pages do NOT re-execute on enhanced nav, which left dropdowns stuck
// on the SSR fallback (e.g. "— Loading claims —") until manual refresh.
    (function () {
        function init() {
        const root = document.querySelector('.supplier-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const select = $('#supplier-claim-select');
        const refreshBtn = $('#supplier-refresh-btn');
        const summaryEl = $('#supplier-claim-summary');
        const step2El = $('#supplier-step-2');
        const processBtn = $('#supplier-process-btn');
        const processStatus = $('#supplier-process-status');
        const engageScope = $('.engage-tabs-scope');
        const resultEl = $('#supplier-result');
        const dispatchEl = $('#supplier-dispatch');
        const apptsEl = $('#supplier-appts');
        const altsEl = $('#supplier-alts');
        const approvalEl = $('#supplier-approval');
        const approvalReason = $('#supplier-approval-reason');
        const pdfEl = $('#supplier-pdf');
        const pdfLink = $('#supplier-pdf-link');
        const pdfName = $('#supplier-pdf-name');
        const pdfSub = $('#supplier-pdf-sub');

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        function resetDownstream() {
            processStatus.hidden = true;
            resultEl.hidden = true;
            dispatchEl.hidden = true;
            approvalEl.hidden = true;
            if (pdfEl) pdfEl.hidden = true;
        }

        async function loadClaims() {
            select.innerHTML = '<option value="">Loading…</option>';
            summaryEl.hidden = true;
            if (step2El) step2El.hidden = true;
            processBtn.disabled = true;
            resetDownstream();
            try {
                const res = await fetch('/supplier/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const claims = await res.json();
                if (!claims.length) {
                    select.innerHTML = '<option value="">No claims yet — lodge one in Claims Intake first</option>';
                    return;
                }
                select.innerHTML = '<option value="">— Select a claim —</option>' + claims.map(c =>
                    `<option value="${escapeHtml(c.claimNumber)}">${escapeHtml(c.claimNumber)} — ${escapeHtml(c.customerName)} (${escapeHtml(c.claimType)})</option>`
                ).join('');
            } catch (err) {
                select.innerHTML = '<option value="">Failed to load claims</option>';
                processStatus.hidden = false;
                processStatus.className = 'supplier-status error';
                processStatus.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        async function selectClaim() {
            const claimNumber = select.value;
            resetDownstream();
            if (!claimNumber) {
                summaryEl.hidden = true;
                if (step2El) step2El.hidden = true;
                processBtn.disabled = true;
                return;
            }
            try {
                const res = await fetch('/supplier/claims/' + encodeURIComponent(claimNumber));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const c = await res.json();
                summaryEl.innerHTML = `
                    <div><span class="k">Claim</span>${escapeHtml(c.claimNumber)}</div>
                    <div><span class="k">Customer</span>${escapeHtml(c.customerName)}</div>
                    <div><span class="k">Policy</span>${escapeHtml(c.policyNumber)}</div>
                    <div><span class="k">Claim type</span>${escapeHtml(c.claimType)}</div>
                    <div><span class="k">Incident date</span>${escapeHtml(c.incidentDate)}</div>
                    <div><span class="k">Location</span>${escapeHtml(c.incidentLocation)}</div>
                    <div><span class="k">Estimated loss</span>${escapeHtml(c.estimatedLoss)}</div>
                    <div><span class="k">Urgency</span>${escapeHtml(c.urgency)}</div>`;
                summaryEl.hidden = false;
                // Reveal step 2 (engage agent) now that a claim is picked.
                if (step2El) step2El.hidden = false;
                processBtn.disabled = false;
            } catch (err) {
                summaryEl.hidden = true;
                if (step2El) step2El.hidden = true;
                processBtn.disabled = true;
                processStatus.hidden = false;
                processStatus.className = 'supplier-status error';
                processStatus.textContent = 'Failed to load claim: ' + err.message;
            }
        }

        async function process() {
            const claimNumber = select.value;
            if (!claimNumber) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'supplier-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Supplier Coordinator Agent…';
            resultEl.hidden = true;
            dispatchEl.hidden = true;
            approvalEl.hidden = true;
            if (pdfEl) pdfEl.hidden = true;

            // Helper that sets textContent only if the element exists. The
            // razor markup may be partially-streamed during Blazor enhanced
            // navigation, so every DOM lookup needs a defensive null guard.
            const setText = (sel, value) => {
                const el = $(sel);
                if (el) el.textContent = value;
            };
            const setHtml = (el, value) => {
                if (el) el.innerHTML = value;
            };

            try {
                const data = await window.zcAgentStream({
                    url: '/supplier/process',
                    body: { claimNumber },
                    onDelta: (_chunk, fullText) => {
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
                    },
                    onError: (msg) => {
                        if (processStatus) {
                            processStatus.className = 'supplier-status error';
                            processStatus.textContent = 'Agent error: ' + msg;
                        }
                    }
                });
                if (!data) throw new Error('No response from agent');

                if (processStatus) {
                    processStatus.textContent = data.agentConfigured
                        ? 'Supplier Coordinator Agent matched a supplier and dispatched a work order.'
                        : 'Processed (Foundry agent not configured — using deterministic demo match).';
                }

                const r = data.recommendedSupplier || {};
                setText('#supplier-rec-name', r.name || '');
                setText('#supplier-rec-specialty', r.specialty || '');
                setText('#supplier-rec-location', '📍 ' + (r.location || ''));
                setText('#supplier-rec-rating', '★ ' + Number(r.rating || 0).toFixed(1) + '/5');
                setText('#supplier-rec-sla', 'SLA ' + (r.slaDays ?? '—') + ' days');

                setHtml(apptsEl, (data.appointmentOptions || []).map(a =>
                    `<li>📅 ${escapeHtml(a)}</li>`).join(''));

                setHtml(altsEl, (data.alternativeSuppliers || []).map(s =>
                    `<li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.specialty)} <em>(SLA ${s.slaDays}d, ★ ${Number(s.rating || 0).toFixed(1)})</em></li>`).join(''));

                if (resultEl) resultEl.hidden = false;

                const w = data.workOrder || {};
                setText('#supplier-wo-num', w.workOrderNumber || '');
                setText('#supplier-wo-scope', w.scope || '');
                setText('#supplier-wo-eta', w.eta || '');
                setText('#supplier-wo-type', data.supplierType || '');
                if ($('#supplier-customer-body') && typeof window.zcRenderMarkdown === 'function') {
                    window.zcRenderMarkdown('#supplier-customer-body', data.customerUpdate || '');
                }
                if (dispatchEl) dispatchEl.hidden = false;

                // Surface the quote-request PDF download produced by the
                // generateQuoteRequestPdf MCP tool (and deterministically by
                // /supplier/process). The operator clicks the link manually
                // when they want the PDF — no automatic download.
                if (data.quoteRequestPdfUrl && pdfEl && pdfLink) {
                    const fileName = data.quoteRequestPdfFileName || 'quote-request.pdf';
                    pdfLink.href = data.quoteRequestPdfUrl;
                    pdfLink.setAttribute('download', fileName);
                    if (pdfName) pdfName.textContent = fileName;
                    const best = data.bestPriceSupplier;
                    if (pdfSub) {
                        pdfSub.textContent = best
                            ? `Quote request issued to ${best.name} — ${best.quoteCurrency} ${Number(best.quoteAmount).toLocaleString()}`
                            : 'Generated by the Supplier Coordinator agent.';
                    }
                    pdfEl.hidden = false;
                }

                if (data.humanApprovalRequired) {
                    if (approvalReason) approvalReason.textContent = data.humanApprovalReason || '';
                    if (approvalEl) approvalEl.hidden = false;
                }

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }

                if (dispatchEl) dispatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (err) {
                if (processStatus) {
                    processStatus.className = 'supplier-status error';
                    processStatus.textContent = 'Failed to process: ' + err.message;
                }
            } finally {
                if (processBtn) processBtn.disabled = !select.value;
            }
        }

        select.addEventListener('change', selectClaim);
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', process);

        loadClaims();
        }

        init();

        if (!window.__supplierDemoEnhancedHook) {
            window.__supplierDemoEnhancedHook = true;
            const hook = () => init();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

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
        const processBtn = $('#supplier-process-btn');
        const processStatus = $('#supplier-process-status');
        const agentNotesEl = $('#supplier-agent-notes');
        const agentNotesBody = $('#supplier-agent-notes-body');
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
            agentNotesEl.hidden = true;
            resultEl.hidden = true;
            dispatchEl.hidden = true;
            approvalEl.hidden = true;
            if (pdfEl) pdfEl.hidden = true;
        }

        async function loadClaims() {
            select.innerHTML = '<option value="">Loading…</option>';
            summaryEl.hidden = true;
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
                processBtn.disabled = false;
            } catch (err) {
                summaryEl.hidden = true;
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
            agentNotesEl.hidden = true;
            resultEl.hidden = true;
            dispatchEl.hidden = true;
            approvalEl.hidden = true;
            if (pdfEl) pdfEl.hidden = true;

            try {
                const data = await window.zcAgentStream({
                    url: '/supplier/process',
                    body: { claimNumber },
                    onDelta: (_chunk, fullText) => {
                        agentNotesEl.hidden = false;
                        agentNotesBody.classList.add('agent-md-streaming');
                        agentNotesBody.textContent = fullText;
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
                    },
                    onError: (msg) => {
                        processStatus.className = 'supplier-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                processStatus.textContent = data.agentConfigured
                    ? 'Supplier Coordinator Agent matched a supplier and dispatched a work order.'
                    : 'Processed (Foundry agent not configured — using deterministic demo match).';
                if (data.agentNotes) {
                    agentNotesEl.hidden = false;
                    agentNotesBody.classList.remove('agent-md-streaming');
                    window.zcRenderMarkdown(agentNotesBody, data.agentNotes);
                }

                const r = data.recommendedSupplier || {};
                $('#supplier-rec-name').textContent = r.name || '';
                $('#supplier-rec-specialty').textContent = r.specialty || '';
                $('#supplier-rec-location').textContent = '📍 ' + (r.location || '');
                $('#supplier-rec-rating').textContent = '★ ' + Number(r.rating || 0).toFixed(1) + '/5';
                $('#supplier-rec-sla').textContent = 'SLA ' + (r.slaDays ?? '—') + ' days';

                apptsEl.innerHTML = (data.appointmentOptions || []).map(a =>
                    `<li>📅 ${escapeHtml(a)}</li>`).join('');

                altsEl.innerHTML = (data.alternativeSuppliers || []).map(s =>
                    `<li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.specialty)} <em>(SLA ${s.slaDays}d, ★ ${Number(s.rating || 0).toFixed(1)})</em></li>`).join('');

                resultEl.hidden = false;

                const w = data.workOrder || {};
                $('#supplier-wo-num').textContent = w.workOrderNumber || '';
                $('#supplier-wo-scope').textContent = w.scope || '';
                $('#supplier-wo-eta').textContent = w.eta || '';
                $('#supplier-wo-type').textContent = data.supplierType || '';
                window.zcRenderMarkdown('#supplier-customer-body', data.customerUpdate || '');
                dispatchEl.hidden = false;

                // Surface the quote-request PDF download produced by the
                // generateQuoteRequestPdf MCP tool (and deterministically by
                // /supplier/process) and trigger an automatic download so
                // the operator gets the PDF at the end of the flow.
                if (data.quoteRequestPdfUrl && pdfEl) {
                    const fileName = data.quoteRequestPdfFileName || 'quote-request.pdf';
                    pdfLink.href = data.quoteRequestPdfUrl;
                    pdfLink.setAttribute('download', fileName);
                    pdfName.textContent = fileName;
                    const best = data.bestPriceSupplier;
                    pdfSub.textContent = best
                        ? `Quote request issued to ${best.name} — ${best.quoteCurrency} ${Number(best.quoteAmount).toLocaleString()}`
                        : 'Generated by the Supplier Coordinator agent.';
                    pdfEl.hidden = false;

                    // Auto-trigger the download once via the existing link.
                    try { pdfLink.click(); } catch (_) { /* ignore — user can still click manually */ }
                }

                if (data.humanApprovalRequired) {
                    approvalReason.textContent = data.humanApprovalReason || '';
                    approvalEl.hidden = false;
                }

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }

                dispatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (err) {
                processStatus.className = 'supplier-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                processBtn.disabled = !select.value;
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

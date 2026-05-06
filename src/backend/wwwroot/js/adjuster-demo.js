// Auto-extracted from the matching razor page.
// Loaded as a permanent script from App.razor so init runs reliably on full
// page load AND on Blazor enhanced navigation. Inline <script> tags inside
// razor pages do NOT re-execute on enhanced nav, which left dropdowns stuck
// on the SSR fallback (e.g. "— Loading claims —") until manual refresh.
    (function () {
        function init() {
        const root = document.querySelector('.adjuster-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const selectEl = $('#adjuster-claim-select');
        const refreshBtn = $('#adjuster-refresh-btn');
        const emptyEl = $('#adjuster-empty');
        const cardEl = $('#adjuster-claim-card');
        const processBtn = $('#adjuster-process-btn');
        const processStatus = $('#adjuster-process-status');
        const reportEl = $('#adjuster-report');
        const notesBody = $('#adjuster-notes-body');

        let selectedClaim = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        function setSelectedClaim(claim) {
            selectedClaim = claim;
            if (!claim) {
                cardEl.hidden = true;
                processBtn.disabled = true;
                return;
            }
            $('#adjuster-claim-num').textContent = claim.claimNumber;
            $('#adjuster-claim-customer').textContent = claim.customerName || '—';
            $('#adjuster-claim-policy').textContent   = claim.policyNumber || '—';
            $('#adjuster-claim-type').textContent     = claim.claimType || '—';
            $('#adjuster-claim-date').textContent     = claim.incidentDate || '—';
            $('#adjuster-claim-location').textContent = claim.incidentLocation || '—';
            $('#adjuster-claim-desc').textContent     = claim.incidentDescription || '—';
            $('#adjuster-claim-loss').textContent     = claim.estimatedLoss || '—';
            $('#adjuster-claim-urgency').textContent  = claim.urgency || '—';
            cardEl.hidden = false;
            processBtn.disabled = false;
        }

        async function loadClaims() {
            selectEl.innerHTML = '<option value="">— Loading… —</option>';
            emptyEl.hidden = true;
            cardEl.hidden = true;
            processBtn.disabled = true;
            reportEl.hidden = true;
            processStatus.hidden = true;

            try {
                const res = await fetch('/loss-adjuster/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const claims = await res.json();
                if (!claims.length) {
                    selectEl.innerHTML = '<option value="">— No claims available —</option>';
                    emptyEl.hidden = false;
                    return;
                }
                selectEl.innerHTML = '<option value="">— Select a claim —</option>' +
                    claims.map(c =>
                        `<option value="${escapeHtml(c.claimNumber)}">` +
                        `${escapeHtml(c.claimNumber)} — ${escapeHtml(c.customerName)} (${escapeHtml(c.claimType)})` +
                        `</option>`).join('');
            } catch (err) {
                selectEl.innerHTML = '<option value="">— Failed to load —</option>';
                processStatus.hidden = false;
                processStatus.className = 'adjuster-status error';
                processStatus.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        async function selectClaim(claimNumber) {
            reportEl.hidden = true;
            processStatus.hidden = true;
            if (!claimNumber) {
                setSelectedClaim(null);
                return;
            }
            try {
                const res = await fetch(`/loss-adjuster/claims/${encodeURIComponent(claimNumber)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const claim = await res.json();
                setSelectedClaim(claim);
            } catch (err) {
                setSelectedClaim(null);
                processStatus.hidden = false;
                processStatus.className = 'adjuster-status error';
                processStatus.textContent = 'Failed to load claim: ' + err.message;
            }
        }

        async function processClaim() {
            if (!selectedClaim) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'adjuster-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Loss Adjuster Agent…';
            reportEl.hidden = true;

            try {
                const data = await window.zcAgentStream({
                    url: '/loss-adjuster/process',
                    body: { claimNumber: selectedClaim.claimNumber },
                    onDelta: (_chunk, fullText) => {
                        reportEl.hidden = false;
                        notesBody.classList.add('agent-md-streaming');
                        notesBody.textContent = fullText;
                    },
                    onError: (msg) => {
                        processStatus.className = 'adjuster-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                if (data.agentNotes) {
                    notesBody.classList.remove('agent-md-streaming');
                    window.zcRenderMarkdown(notesBody, data.agentNotes);
                    reportEl.hidden = false;
                    processStatus.textContent = 'Loss Adjuster Agent produced a report.';
                    reportEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (!data.agentConfigured) {
                    processStatus.className = 'adjuster-status error';
                    processStatus.textContent =
                        'Loss Adjuster Foundry agent is not configured. ' +
                        'Set AZURE_AI_PROJECT_ENDPOINT and AZURE_AI_MODEL_DEPLOYMENT_NAME to enable it.';
                } else {
                    processStatus.className = 'adjuster-status error';
                    processStatus.textContent = data.agentError
                        ? 'Loss Adjuster Agent failed: ' + data.agentError
                        : 'Loss Adjuster Agent returned no narrative.';
                }

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    const scope = document.querySelector('.adjuster-panel .engage-tabs-scope');
                    window.engageTabsRender(scope, data);
                }
            } catch (err) {
                processStatus.className = 'adjuster-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                processBtn.disabled = !selectedClaim;
            }
        }

        selectEl.addEventListener('change', () => selectClaim(selectEl.value));
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', processClaim);

        loadClaims();
        }

        init();

        if (!window.__adjusterDemoEnhancedHook) {
            window.__adjusterDemoEnhancedHook = true;
            const hook = () => init();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

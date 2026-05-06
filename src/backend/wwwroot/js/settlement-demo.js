// Auto-extracted from the matching razor page.
// Loaded as a permanent script from App.razor so init runs reliably on full
// page load AND on Blazor enhanced navigation. Inline <script> tags inside
// razor pages do NOT re-execute on enhanced nav, which left dropdowns stuck
// on the SSR fallback (e.g. "— Loading claims —") until manual refresh.
    (function () {
        function init() {
        const root = document.querySelector('.settlement-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const select = $('#settlement-claim-select');
        const refreshBtn = $('#settlement-refresh-btn');
        const emptyEl = $('#settlement-claim-empty');
        const summaryEl = $('#settlement-claim-summary');
        const inputsStep = $('#settlement-inputs-step');
        const inputsForm = $('#settlement-inputs-form');
        const processStep = $('#settlement-process-step');
        const processBtn = $('#settlement-process-btn');
        const processStatus = $('#settlement-process-status');
        const resultEl = $('#settlement-result');
        const calcBody = $('#settlement-calc-body');
        const payableEl = $('#settlement-payable-amount');
        const approvalPill = $('#settlement-approval-pill');
        const approvalReason = $('#settlement-approval-reason');
        const letterEl = $('#settlement-letter');
        const agentNotesEl = $('#settlement-agent-notes');
        const agentNotesBody = $('#settlement-agent-notes-body');

        let claims = [];
        let selected = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        function fmtMoney(n) {
            const num = Number(n) || 0;
            return num.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
        }

        function parseMoney(value) {
            if (value === null || value === undefined) return 0;
            const cleaned = String(value).replace(/[^0-9.\-]/g, '');
            const n = parseFloat(cleaned);
            return Number.isFinite(n) ? n : 0;
        }

        function defaultPolicyLimit(claimType, approved) {
            const t = (claimType || '').toLowerCase();
            if (t.includes('home')) return 750000;
            if (t.includes('motor') || t.includes('car')) return 60000;
            if (t.includes('travel')) return 15000;
            if (t.includes('business')) return 250000;
            if (t.includes('life')) return 500000;
            return Math.max(approved * 5, 50000);
        }

        function defaultExcess(claimType) {
            const t = (claimType || '').toLowerCase();
            if (t.includes('home')) return 500;
            if (t.includes('motor') || t.includes('car')) return 800;
            if (t.includes('travel')) return 250;
            if (t.includes('business')) return 1000;
            return 500;
        }

        async function loadClaims() {
            try {
                const res = await fetch('/settlement/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                claims = await res.json();
                const previous = select.value;
                select.innerHTML = '<option value="">— Select a Claim ID —</option>' +
                    claims.map(c => `<option value="${escapeHtml(c.claimNumber)}">${escapeHtml(c.claimNumber)} — ${escapeHtml(c.customerName)} (${escapeHtml(c.claimType)})</option>`).join('');
                if (previous && claims.some(c => c.claimNumber === previous)) {
                    select.value = previous;
                }
                emptyEl.hidden = claims.length > 0;
            } catch (err) {
                emptyEl.hidden = false;
                emptyEl.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        async function selectClaim(claimNumber) {
            resultEl.hidden = true;
            processStatus.hidden = true;
            if (!claimNumber) {
                selected = null;
                summaryEl.hidden = true;
                inputsStep.hidden = true;
                processStep.hidden = true;
                return;
            }
            try {
                const res = await fetch(`/settlement/claims/${encodeURIComponent(claimNumber)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                selected = await res.json();
            } catch (err) {
                selected = null;
                summaryEl.hidden = true;
                inputsStep.hidden = true;
                processStep.hidden = true;
                emptyEl.hidden = false;
                emptyEl.textContent = 'Failed to load claim: ' + err.message;
                return;
            }

            $('#settlement-claim-num').textContent = selected.claimNumber;
            $('#settlement-claim-customer').textContent = selected.customerName;
            $('#settlement-claim-policy').textContent = selected.policyNumber;
            $('#settlement-claim-type').textContent = selected.claimType;
            $('#settlement-claim-incident').textContent =
                `${selected.incidentDate || '—'} · ${selected.incidentLocation || '—'} — ${selected.incidentDescription || ''}`;
            summaryEl.hidden = false;

            const approved = parseMoney(selected.estimatedLoss);
            inputsForm.approvedAmount.value = approved.toFixed(2);
            inputsForm.policyLimit.value = defaultPolicyLimit(selected.claimType, approved).toFixed(2);
            inputsForm.excess.value = defaultExcess(selected.claimType).toFixed(2);
            inputsForm.depreciation.value = '0';
            inputsForm.priorPayments.value = '0';

            inputsStep.hidden = false;
            processStep.hidden = false;
        }

        async function processSettlement() {
            if (!selected) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'settlement-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Settlement Agent…';
            resultEl.hidden = true;

            const payload = {
                claimNumber: selected.claimNumber,
                approvedAmount: parseFloat(inputsForm.approvedAmount.value) || 0,
                policyLimit: parseFloat(inputsForm.policyLimit.value) || 0,
                excess: parseFloat(inputsForm.excess.value) || 0,
                depreciation: parseFloat(inputsForm.depreciation.value) || 0,
                priorPayments: parseFloat(inputsForm.priorPayments.value) || 0
            };

            try {
                const data = await window.zcAgentStream({
                    url: '/settlement/process',
                    body: payload,
                    onDelta: (_chunk, fullText) => {
                        agentNotesEl.hidden = false;
                        agentNotesBody.classList.add('agent-md-streaming');
                        agentNotesBody.textContent = fullText;
                    },
                    onError: (msg) => {
                        processStatus.className = 'settlement-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                processStatus.textContent = data.agentConfigured
                    ? 'Settlement Agent processed the claim.'
                    : 'Processed (Foundry agent not configured — using deterministic demo calculation).';

                calcBody.innerHTML = (data.calculation || []).map((row, idx, arr) => {
                    const isTotal = idx === arr.length - 1;
                    const cls = isTotal ? 'pos' : (row.amount < 0 ? 'neg' : (row.amount > 0 ? 'pos' : ''));
                    const sign = row.amount < 0 ? '−' : (row.amount > 0 && !isTotal && idx > 0 ? '+' : '');
                    const display = sign + fmtMoney(Math.abs(row.amount));
                    return `<tr${isTotal ? ' class="total"' : ''}>
                        <td>${escapeHtml(row.label)}</td>
                        <td class="amount ${cls}">${escapeHtml(display)}</td>
                    </tr>`;
                }).join('');

                payableEl.textContent = data.payableAmountFormatted || fmtMoney(data.payableAmount);

                approvalPill.textContent = data.humanApprovalRequired ? 'Required' : 'Optional';
                approvalPill.className = 'settlement-approval-pill ' + (data.humanApprovalRequired ? 'required' : 'optional');
                approvalReason.textContent = data.humanApprovalReason || '';

                window.zcRenderMarkdown(letterEl, data.settlementLetter || '');

                if (data.agentNotes) {
                    agentNotesEl.hidden = false;
                    agentNotesBody.classList.remove('agent-md-streaming');
                    window.zcRenderMarkdown(agentNotesBody, data.agentNotes);
                } else {
                    agentNotesEl.hidden = true;
                }

                resultEl.hidden = false;
                resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    const scope = document.querySelector('.settlement-panel .engage-tabs-scope');
                    window.engageTabsRender(scope, data);
                }
            } catch (err) {
                processStatus.className = 'settlement-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                processBtn.disabled = false;
            }
        }

        select.addEventListener('change', () => selectClaim(select.value));
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', processSettlement);

        loadClaims();
        }

        init();

        if (!window.__settlementDemoEnhancedHook) {
            window.__settlementDemoEnhancedHook = true;
            const hook = () => init();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

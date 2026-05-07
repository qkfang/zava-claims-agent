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
        const engageScope = $('.engage-tabs-scope');
        const teamsCard = $('#settlement-teams-card');
        const teamsPill = $('#settlement-teams-pill');
        const teamsMsg = $('#settlement-teams-msg');
        const teamsApprovalIdEl = $('#settlement-teams-approvalid');
        const teamsLinkEl = $('#settlement-teams-link');
        const teamsApproveBtn = $('#settlement-teams-approve-btn');
        const teamsRejectBtn = $('#settlement-teams-reject-btn');
        const teamsReleaseBtn = $('#settlement-teams-release-btn');
        const teamsStatus = $('#settlement-teams-status');
        let currentApprovalId = null;

        // Real popup modal for payment approval. Element refs + state.
        const modalEl = $('#settlement-approval-modal');
        const modalReason = $('#settlement-modal-reason');
        const modalClaim = $('#settlement-modal-claim');
        const modalCustomer = $('#settlement-modal-customer');
        const modalPolicy = $('#settlement-modal-policy');
        const modalApprovalIdEl = $('#settlement-modal-approval-id');
        const modalAmount = $('#settlement-modal-amount');
        const modalStatus = $('#settlement-modal-status');
        const modalAgentBlock = $('#settlement-modal-agent');
        const modalAgentBody = $('#settlement-modal-agent-body');
        const modalApproveBtn = $('#settlement-modal-approve-btn');
        const modalRejectBtn = $('#settlement-modal-reject-btn');
        const modalCancelBtn = $('#settlement-modal-cancel-btn');
        const modalCloseBtn = root.querySelector('.settlement-modal-close');
        let modalApprovalContext = null;

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
            teamsCard.hidden = true;
            currentApprovalId = null;
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
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
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

                renderTeamsCard(data.paymentApproval);

                resultEl.hidden = false;
                resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }

                // If the agent flagged human approval as required (e.g. the
                // payable amount is at or above the authority threshold),
                // open the real popup so the operator can approve/reject
                // the payment MCP action — the decision flows back to the
                // same Foundry agent in the same conversation.
                if (data.humanApprovalRequired && data.paymentApproval && data.paymentApproval.approvalId) {
                    openApprovalModal(data);
                }
            } catch (err) {
                processStatus.className = 'settlement-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                processBtn.disabled = false;
            }
        }

        function renderTeamsCard(approval) {
            if (!approval || !approval.approvalId) {
                teamsCard.hidden = true;
                currentApprovalId = null;
                return;
            }
            currentApprovalId = approval.approvalId;
            teamsCard.hidden = false;
            teamsApprovalIdEl.textContent = approval.approvalId;
            if (approval.approvalUrl) {
                teamsLinkEl.href = approval.approvalUrl;
                teamsLinkEl.textContent = approval.approvalUrl;
            } else {
                teamsLinkEl.removeAttribute('href');
                teamsLinkEl.textContent = '(none)';
            }
            const sentText = approval.teamsSent
                ? `Adaptive Card posted to ${escapeHtml(approval.teamsChannel || 'Teams')}.`
                : (approval.teamsConfigured
                    ? `Teams send failed: ${escapeHtml(approval.teamsMessage || 'unknown error')}.`
                    : 'Teams webhook not configured (set TEAMS_WEBHOOK_URL); approval card was logged only.');
            teamsMsg.innerHTML = sentText + ' Approve below to simulate the Teams approver clicking <strong>Approve</strong>.';
            updateTeamsPill(approval.status || 'pending', approval.teamsSent);
            teamsStatus.hidden = true;
            teamsStatus.className = 'settlement-teams-status';
            teamsStatus.textContent = '';
            teamsReleaseBtn.hidden = true;
            teamsApproveBtn.disabled = false;
            teamsRejectBtn.disabled = false;
        }

        function updateTeamsPill(status, sent) {
            const s = (status || 'pending').toLowerCase();
            teamsPill.className = 'settlement-approval-pill ' + s;
            if (s === 'pending') {
                teamsPill.textContent = sent ? 'Sent · Pending' : 'Logged · Pending';
                if (!sent) teamsPill.classList.add('skipped');
                else teamsPill.classList.add('sent');
            } else {
                teamsPill.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            }
        }

        async function decideApproval(action) {
            if (!currentApprovalId) return;
            teamsApproveBtn.disabled = true;
            teamsRejectBtn.disabled = true;
            teamsStatus.hidden = false;
            teamsStatus.className = 'settlement-teams-status';
            teamsStatus.innerHTML = '<span class="spinner"></span>Sending decision…';
            try {
                const res = await fetch(`/settlement/payment/${encodeURIComponent(currentApprovalId)}/${action}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decidedBy: 'Demo approver (Teams)' })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
                updateTeamsPill(data.status, true);
                teamsStatus.textContent = `Decision recorded: ${data.status}` +
                    (data.decidedBy ? ` by ${data.decidedBy}` : '') + '.';
                if (data.status === 'approved') {
                    teamsReleaseBtn.hidden = false;
                    teamsReleaseBtn.disabled = false;
                }
            } catch (err) {
                teamsStatus.className = 'settlement-teams-status error';
                teamsStatus.textContent = 'Failed: ' + err.message;
                teamsApproveBtn.disabled = false;
                teamsRejectBtn.disabled = false;
            }
        }

        async function releasePayment() {
            if (!currentApprovalId) return;
            teamsReleaseBtn.disabled = true;
            teamsStatus.hidden = false;
            teamsStatus.className = 'settlement-teams-status';
            teamsStatus.innerHTML = '<span class="spinner"></span>Releasing payment…';
            try {
                const res = await fetch(`/settlement/payment/${encodeURIComponent(currentApprovalId)}/release`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
                updateTeamsPill(data.status, true);
                teamsStatus.textContent = `Payment released. Reference: ${data.paymentReference}.`;
            } catch (err) {
                teamsStatus.className = 'settlement-teams-status error';
                teamsStatus.textContent = 'Failed: ' + err.message;
                teamsReleaseBtn.disabled = false;
            }
        }

        // ── Real popup modal for human approval ──────────────────────
        function openApprovalModal(data) {
            const approval = data && data.paymentApproval;
            if (!approval || !approval.approvalId) return;
            modalApprovalContext = approval;
            modalReason.textContent = data.humanApprovalReason || approval.reason || 'Human approval required.';
            modalClaim.textContent = data.claimNumber || '';
            modalCustomer.textContent = data.customerName || '';
            modalPolicy.textContent = data.policyNumber || '';
            modalApprovalIdEl.textContent = approval.approvalId;
            modalAmount.textContent = data.payableAmountFormatted || fmtMoney(data.payableAmount);
            modalStatus.hidden = true;
            modalStatus.className = 'settlement-modal-status';
            modalStatus.textContent = '';
            modalAgentBlock.hidden = true;
            modalAgentBody.innerHTML = '';
            modalApproveBtn.disabled = false;
            modalRejectBtn.disabled = false;
            modalApproveBtn.textContent = approval.agentResumeAvailable
                ? 'Approve & release payment'
                : 'Approve';
            modalEl.hidden = false;
            modalApproveBtn.focus();
        }

        function closeApprovalModal() {
            modalEl.hidden = true;
            modalApprovalContext = null;
        }

        async function approveViaModal() {
            if (!modalApprovalContext) return;
            const approvalId = modalApprovalContext.approvalId;
            modalApproveBtn.disabled = true;
            modalRejectBtn.disabled = true;
            modalStatus.hidden = false;
            modalStatus.className = 'settlement-modal-status';
            modalStatus.innerHTML = '<span class="spinner"></span>Approving and resuming agent conversation…';
            try {
                const res = await fetch(`/settlement/payment/${encodeURIComponent(approvalId)}/agent-approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decidedBy: 'Demo approver (popup)' })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

                const approval = data.approval || {};
                if (data.agentNarrative) {
                    modalAgentBlock.hidden = false;
                    if (window.zcRenderMarkdown) {
                        window.zcRenderMarkdown(modalAgentBody, data.agentNarrative);
                    } else {
                        modalAgentBody.textContent = data.agentNarrative;
                    }
                }
                let msg = `Approval recorded — status: ${approval.status || 'approved'}`;
                if (approval.paymentReference) msg += `, payment reference: ${approval.paymentReference}`;
                if (data.agentError) msg += `. (Agent resume failed: ${data.agentError})`;
                modalStatus.textContent = msg + '.';

                // Mirror the inline Teams card so the UI stays consistent.
                if (currentApprovalId === approvalId) {
                    updateTeamsPill(approval.status || 'approved', true);
                    if ((approval.status || '').toLowerCase() === 'released') {
                        teamsStatus.hidden = false;
                        teamsStatus.className = 'settlement-teams-status';
                        teamsStatus.textContent = `Payment released by agent. Reference: ${approval.paymentReference}.`;
                        teamsReleaseBtn.hidden = true;
                    } else {
                        teamsReleaseBtn.hidden = false;
                        teamsReleaseBtn.disabled = false;
                    }
                    teamsApproveBtn.disabled = true;
                    teamsRejectBtn.disabled = true;
                }
            } catch (err) {
                modalStatus.className = 'settlement-modal-status error';
                modalStatus.textContent = 'Failed: ' + err.message;
                modalApproveBtn.disabled = false;
                modalRejectBtn.disabled = false;
            }
        }

        async function rejectViaModal() {
            if (!modalApprovalContext) return;
            const approvalId = modalApprovalContext.approvalId;
            modalApproveBtn.disabled = true;
            modalRejectBtn.disabled = true;
            modalStatus.hidden = false;
            modalStatus.className = 'settlement-modal-status';
            modalStatus.innerHTML = '<span class="spinner"></span>Recording rejection…';
            try {
                const res = await fetch(`/settlement/payment/${encodeURIComponent(approvalId)}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decidedBy: 'Demo approver (popup)' })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
                modalStatus.textContent = `Rejection recorded — status: ${data.status}.`;

                if (currentApprovalId === approvalId) {
                    updateTeamsPill(data.status, true);
                    teamsApproveBtn.disabled = true;
                    teamsRejectBtn.disabled = true;
                }
            } catch (err) {
                modalStatus.className = 'settlement-modal-status error';
                modalStatus.textContent = 'Failed: ' + err.message;
                modalApproveBtn.disabled = false;
                modalRejectBtn.disabled = false;
            }
        }

        select.addEventListener('change', () => selectClaim(select.value));
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', processSettlement);
        teamsApproveBtn.addEventListener('click', () => decideApproval('approve'));
        teamsRejectBtn.addEventListener('click', () => decideApproval('reject'));
        teamsReleaseBtn.addEventListener('click', releasePayment);

        // Real popup modal event wiring.
        modalApproveBtn.addEventListener('click', approveViaModal);
        modalRejectBtn.addEventListener('click', rejectViaModal);
        modalCancelBtn.addEventListener('click', closeApprovalModal);
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeApprovalModal);
        modalEl.addEventListener('click', (ev) => {
            if (ev.target && ev.target.matches && ev.target.matches('[data-modal-dismiss]')) {
                closeApprovalModal();
            }
        });
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && !modalEl.hidden) closeApprovalModal();
        });

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

// Customer Communications page — agent demo wiring (claim list + draft).
// Externalised so init runs reliably on Blazor enhanced navigation.

    (function () {
        function init() {
        const root = document.querySelector('.comms-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const selectEl = $('#comms-claim-select');
        const refreshBtn = $('#comms-refresh-btn');
        const summaryEl = $('#comms-claim-summary');
        const processBtn = $('#comms-process-btn');
        const processStatus = $('#comms-process-status');
        const resultsEl = $('#comms-results');
        const stagePill = $('#comms-stage-pill');
        const summaryText = $('#comms-summary-text');
        const nextStepsEl = $('#comms-next-steps');
        const flagsEl = $('#comms-flags');
        const flagsList = $('#comms-flags-list');
        const approvalPill = $('#comms-approval-pill');
        const approvalReason = $('#comms-approval-reason');
        const emailSubject = $('#comms-email-subject');
        const emailBody = $('#comms-email-body');
        const smsBody = $('#comms-sms-body');
        const portalHeading = $('#comms-portal-heading');
        const portalBody = $('#comms-portal-body');
        const agentNotesEl = $('#comms-agent-notes');
        const agentNotesBody = $('#comms-agent-notes-body');

        let claims = [];
        let selectedClaim = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        async function loadClaims() {
            selectEl.disabled = true;
            selectEl.innerHTML = '<option value="">Loading claims…</option>';
            summaryEl.hidden = true;
            processBtn.disabled = true;
            resultsEl.hidden = true;
            try {
                const res = await fetch('/communications/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                claims = await res.json();
                if (!claims.length) {
                    selectEl.innerHTML = '<option value="">No claims yet — run a Claims Intake sample first</option>';
                    selectEl.disabled = true;
                    return;
                }
                selectEl.innerHTML =
                    '<option value="">— select a claim —</option>' +
                    claims.map(c => `<option value="${escapeHtml(c.claimNumber)}">${escapeHtml(c.claimNumber)} · ${escapeHtml(c.customerName)} · ${escapeHtml(c.claimType)}</option>`).join('');
                selectEl.disabled = false;
            } catch (err) {
                selectEl.innerHTML = `<option value="">Failed to load: ${escapeHtml(err.message)}</option>`;
            }
        }

        async function selectClaim(claimNumber) {
            resultsEl.hidden = true;
            processStatus.hidden = true;
            if (!claimNumber) {
                selectedClaim = null;
                summaryEl.hidden = true;
                processBtn.disabled = true;
                return;
            }
            try {
                const res = await fetch(`/communications/claims/${encodeURIComponent(claimNumber)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                selectedClaim = await res.json();
                $('#comms-cust-name').textContent = `${selectedClaim.customerName} · ${selectedClaim.customerEmail || ''}`.trim();
                $('#comms-cust-policy').textContent = selectedClaim.policyNumber || '—';
                $('#comms-cust-type').textContent = selectedClaim.claimType || '—';
                $('#comms-cust-urgency').textContent = `${selectedClaim.urgency || '—'}${selectedClaim.urgencyReason ? ' — ' + selectedClaim.urgencyReason : ''}`;
                $('#comms-cust-incident').textContent = `${selectedClaim.incidentDate || '—'} · ${selectedClaim.incidentLocation || '—'} · ${selectedClaim.incidentDescription || ''}`;
                $('#comms-cust-pref').textContent = selectedClaim.preferredContact || '—';
                summaryEl.hidden = false;
                processBtn.disabled = false;
            } catch (err) {
                summaryEl.hidden = true;
                processBtn.disabled = true;
                processStatus.hidden = false;
                processStatus.className = 'comms-status error';
                processStatus.textContent = 'Failed to load claim: ' + err.message;
            }
        }

        async function processClaim() {
            if (!selectedClaim) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'comms-status';
            processStatus.innerHTML = '<span class="spinner"></span>Cara is drafting customer updates…';
            resultsEl.hidden = true;

            try {
                const data = await window.zcAgentStream({
                    url: '/communications/process',
                    body: { claimNumber: selectedClaim.claimNumber },
                    onDelta: (_chunk, fullText) => {
                        agentNotesEl.hidden = false;
                        agentNotesBody.classList.add('agent-md-streaming');
                        agentNotesBody.textContent = fullText;
                    },
                    onError: (msg) => {
                        processStatus.className = 'comms-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                processStatus.textContent = data.agentConfigured
                    ? 'Customer Communications Agent drafted the customer updates.'
                    : 'Drafted (Foundry agent not configured — using deterministic demo drafts).';

                stagePill.textContent = data.stage || 'Lodged';
                summaryText.textContent = data.summary || '';
                nextStepsEl.innerHTML = (data.nextSteps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');

                const flags = data.vulnerabilityFlags || [];
                if (flags.length) {
                    flagsEl.hidden = false;
                    flagsList.innerHTML = flags.map(f => `<li>${escapeHtml(f)}</li>`).join('');
                    approvalPill.textContent = data.humanApprovalRequired ? 'Human review required' : 'Spot-check only';
                    approvalPill.className = 'comms-approval-pill ' + (data.humanApprovalRequired ? 'required' : 'optional');
                    approvalReason.textContent = data.humanApprovalReason || '';
                } else {
                    flagsEl.hidden = true;
                }

                emailSubject.textContent = (data.email && data.email.subject) || '';
                window.zcRenderMarkdown(emailBody, (data.email && data.email.body) || '');
                window.zcRenderMarkdown(smsBody, data.sms || '');
                portalHeading.textContent = (data.portal && data.portal.heading) || '';
                window.zcRenderMarkdown(portalBody, (data.portal && data.portal.body) || '');

                if (data.agentNotes) {
                    agentNotesEl.hidden = false;
                    agentNotesBody.classList.remove('agent-md-streaming');
                    window.zcRenderMarkdown(agentNotesBody, data.agentNotes);
                } else {
                    agentNotesEl.hidden = true;
                }

                resultsEl.hidden = false;
                resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    const scope = document.querySelector('.comms-panel .engage-tabs-scope');
                    window.engageTabsRender(scope, data);
                }
            } catch (err) {
                processStatus.className = 'comms-status error';
                processStatus.textContent = 'Failed to draft: ' + err.message;
            } finally {
                processBtn.disabled = false;
            }
        }

        selectEl.addEventListener('change', () => selectClaim(selectEl.value));
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', processClaim);

        loadClaims();
        }

        init();

        if (!window.__commsDemoEnhancedHook) {
            window.__commsDemoEnhancedHook = true;
            const hook = () => init();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

// Claims Assessment "Try It Out" panel logic.
// Loaded as a permanent script from App.razor so the init runs reliably on
// both direct page loads AND Blazor enhanced navigations (where inline
// <script> tags inside the razor page do NOT re-execute).
(function () {
    function init() {
        const root = document.querySelector('.assessment-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const select = $('#assessment-claim-select');
        const refreshBtn = $('#assessment-refresh-btn');
        const emptyEl = $('#assessment-empty');
        const cardStep = $('#assessment-claim-card-step');
        const card = $('#assessment-claim-card');
        const processStep = $('#assessment-process-step');
        const processBtn = $('#assessment-process-btn');
        const processStatus = $('#assessment-process-status');
        const resultEl = $('#assessment-result');
        const resultBody = $('#assessment-result-body');
        const resultPill = $('#assessment-result-pill');
        const validationEl = $('#assessment-validation');
        const policyCard = $('#assessment-policy-card');
        const checklistEl = $('#assessment-checklist');
        const checklistPill = $('#assessment-checklist-pill');
        const decisionReason = $('#assessment-decision-reason');
        const decisionSettlement = $('#assessment-decision-settlement');
        const engageScope = $('.engage-tabs-scope');

        let currentClaim = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        async function loadClaims() {
            select.innerHTML = '<option value="">— Loading claims —</option>';
            emptyEl.hidden = true;
            try {
                const res = await fetch('/assessment/claims');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const claims = await res.json();
                if (!claims.length) {
                    select.innerHTML = '<option value="">— No claims in memory —</option>';
                    emptyEl.hidden = false;
                    cardStep.hidden = true;
                    processStep.hidden = true;
                    return;
                }
                select.innerHTML =
                    '<option value="">— Select a claim —</option>' +
                    claims.map(c => `<option value="${escapeHtml(c.claimNumber)}">${escapeHtml(c.claimNumber)} — ${escapeHtml(c.customerName)} (${escapeHtml(c.claimType)})</option>`).join('');
            } catch (err) {
                select.innerHTML = '<option value="">— Failed to load —</option>';
                emptyEl.hidden = false;
                emptyEl.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        async function selectClaim(claimNumber) {
            currentClaim = null;
            resultEl.hidden = true;
            validationEl.hidden = true;
            processStatus.hidden = true;
            if (!claimNumber) {
                cardStep.hidden = true;
                processStep.hidden = true;
                return;
            }
            try {
                const res = await fetch(`/assessment/claims/${encodeURIComponent(claimNumber)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const c = await res.json();
                currentClaim = c;
                renderCard(c);
                cardStep.hidden = false;
                processStep.hidden = false;
                processBtn.disabled = false;
            } catch (err) {
                cardStep.hidden = true;
                processStep.hidden = true;
                emptyEl.hidden = false;
                emptyEl.textContent = 'Failed to load claim: ' + err.message;
            }
        }

        function renderCard(c) {
            const u = (c.urgency || '').toLowerCase();
            const urgClass = u === 'high' || u === 'medium' || u === 'low' ? u : 'medium';
            card.innerHTML = `
                <div class="row"><div class="k">Claim no.</div><div class="v mono">${escapeHtml(c.claimNumber)}</div></div>
                <div class="row"><div class="k">Created</div><div class="v">${escapeHtml((c.createdAt || '').replace('T', ' ').slice(0, 19))}</div></div>
                <div class="row"><div class="k">Customer</div><div class="v">${escapeHtml(c.customerName)}</div></div>
                <div class="row"><div class="k">Policy</div><div class="v mono">${escapeHtml(c.policyNumber)}</div></div>
                <div class="row"><div class="k">Claim type</div><div class="v">${escapeHtml(c.claimType)}</div></div>
                <div class="row"><div class="k">Incident date</div><div class="v">${escapeHtml(c.incidentDate)}</div></div>
                <div class="row span-2"><div class="k">Location</div><div class="v">${escapeHtml(c.incidentLocation)}</div></div>
                <div class="row span-2"><div class="k">Description</div><div class="v">${escapeHtml(c.incidentDescription)}</div></div>
                <div class="row"><div class="k">Estimated loss</div><div class="v">${escapeHtml(c.estimatedLoss)}</div></div>
                <div class="row"><div class="k">Preferred contact</div><div class="v">${escapeHtml(c.preferredContact)}</div></div>
                <div class="row span-2"><div class="k">Intake urgency</div><div class="v"><span class="urg-pill ${urgClass}">${escapeHtml(c.urgency)}</span> &nbsp;${escapeHtml(c.urgencyReason)}</div></div>
            `;
        }

        function classifyRecommendation(text) {
            const t = (text || '').toLowerCase();
            const m = t.match(/coverage recommendation[^\n]*?\n?[^a-z]*([a-z ]+)/);
            const head = (m && m[1]) ? m[1] : t.slice(0, 200);
            if (head.includes('approve') && head.includes('partial')) return { cls: 'partial', label: 'Partial Approve' };
            if (head.includes('partial')) return { cls: 'partial', label: 'Partial Approve' };
            if (head.includes('decline')) return { cls: 'decline', label: 'Decline' };
            if (head.includes('approve')) return { cls: 'approve', label: 'Approve' };
            if (head.includes('more info') || head.includes('need')) return { cls: 'info', label: 'Need More Info' };
            return { cls: 'info', label: 'Recommendation' };
        }

        function recommendationPillClass(rec) {
            switch ((rec || '').toLowerCase()) {
                case 'approve': return 'approve';
                case 'partialapprove': return 'partial';
                case 'decline': return 'decline';
                case 'needmoreinfo': return 'info';
                default: return 'info';
            }
        }

        function renderPolicy(p) {
            if (!p) {
                policyCard.innerHTML = '<div class="finding">No policy document on file.</div>';
                return;
            }
            const ent = (p.entitlements || []).map(e => `
                <li class="entitlement">
                    <span class="clause">${escapeHtml(e.clauseId)}</span>
                    <span class="title">${escapeHtml(e.title)}</span>
                    <span class="limit">${escapeHtml(e.limit)}</span>
                    <span class="desc">${escapeHtml(e.description)}</span>
                </li>`).join('');
            const exc = (p.exclusions || []).map(e => `
                <li class="exclusion">
                    <span class="clause">${escapeHtml(e.clauseId)}</span>
                    <span class="title">${escapeHtml(e.title)}</span>
                    <span class="desc">${escapeHtml(e.description)}</span>
                </li>`).join('');
            const cond = (p.conditions || []).map(e => `
                <li class="condition">
                    <span class="clause">${escapeHtml(e.clauseId)}</span>
                    <span class="title">${escapeHtml(e.title)}</span>
                    <span class="desc">${escapeHtml(e.description)}</span>
                </li>`).join('');
            policyCard.innerHTML = `
                <h4><span class="doc-emoji" aria-hidden="true">📄</span>${escapeHtml(p.productName)}</h4>
                <div class="policy-meta">
                    <div class="k">Policy no.</div><div class="v mono">${escapeHtml(p.policyNumber)}</div>
                    <div class="k">Insured</div><div class="v">${escapeHtml(p.policyHolder)}</div>
                    <div class="k">In force</div><div class="v">${escapeHtml(p.effectiveFrom)} → ${escapeHtml(p.effectiveTo)}</div>
                    <div class="k">Sum insured</div><div class="v">${escapeHtml(p.sumInsured)}</div>
                    <div class="k">Excess</div><div class="v">${escapeHtml(p.excess)}</div>
                </div>
                <p class="policy-preamble">${escapeHtml(p.schedulePreamble)}</p>
                <h5>Schedule of cover &amp; entitlements</h5>
                <ul class="policy-list">${ent}</ul>
                <h5>Exclusions</h5>
                <ul class="policy-list">${exc}</ul>
                <h5>Conditions</h5>
                <ul class="policy-list">${cond}</ul>
            `;
        }

        function renderChecklist(report) {
            const cls = recommendationPillClass(report.recommendation);
            checklistPill.textContent = report.recommendationLabel || 'Recommendation';
            checklistPill.className = 'assessment-result-pill ' + cls;
            decisionReason.textContent = report.recommendationReason || '';
            decisionSettlement.textContent = report.settlementPosition || '';
            const icon = (s) => s === 'pass' ? '✓' : (s === 'fail' ? '✗' : 'ⓘ');
            checklistEl.innerHTML = (report.items || []).map(it => `
                <li class="${escapeHtml(it.status)}">
                    <span class="icon ${escapeHtml(it.status)}" aria-hidden="true">${icon(it.status)}</span>
                    <div>
                        <div class="label">
                            <span>${escapeHtml(it.label)}</span>
                            ${it.clauseRef ? `<span class="clause-ref">${escapeHtml(it.clauseRef)}</span>` : ''}
                        </div>
                        <div class="finding">${escapeHtml(it.finding)}</div>
                    </div>
                </li>`).join('');
        }

        async function loadValidation(claim) {
            if (!claim) return;
            try {
                const [policyRes, checklistRes] = await Promise.all([
                    fetch(`/assessment/policy/${encodeURIComponent(claim.policyNumber)}`),
                    fetch(`/assessment/checklist/${encodeURIComponent(claim.claimNumber)}`)
                ]);
                const policy = policyRes.ok ? await policyRes.json() : null;
                if (!checklistRes.ok) throw new Error('HTTP ' + checklistRes.status);
                const report = await checklistRes.json();
                renderPolicy(policy);
                renderChecklist(report);
                validationEl.hidden = false;
            } catch (err) {
                validationEl.hidden = true;
            }
        }

        async function processClaim() {
            if (!currentClaim) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'assessment-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Claims Assessment Agent…';
            resultEl.hidden = true;
            validationEl.hidden = true;

            // Render the visual policy + checklist in parallel with the agent
            // call so the user sees the validation immediately.
            const validationPromise = loadValidation(currentClaim);

            try {
                let lastVerdict = null;
                const data = await window.zcAgentStream({
                    url: '/assessment/process',
                    body: { claimNumber: currentClaim.claimNumber },
                    onDelta: (_chunk, fullText) => {
                        // Show the agent's text live; markdown rendering is
                        // applied once the run completes.
                        resultEl.hidden = false;
                        resultBody.classList.add('agent-md-streaming');
                        resultBody.textContent = fullText;
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
                        const verdict = classifyRecommendation(fullText);
                        if (!lastVerdict || lastVerdict.cls !== verdict.cls) {
                            lastVerdict = verdict;
                            resultPill.textContent = verdict.label;
                            resultPill.className = 'assessment-result-pill ' + verdict.cls;
                        }
                    },
                    onError: (msg) => {
                        processStatus.className = 'assessment-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                processStatus.textContent = data.agentConfigured
                    ? 'Claims Assessment Agent reviewed the case against the policy.'
                    : 'Processed (Foundry agent not configured — using deterministic demo summary).';

                const verdict = classifyRecommendation(data.agentNotes);
                resultPill.textContent = verdict.label;
                resultPill.className = 'assessment-result-pill ' + verdict.cls;
                resultBody.classList.remove('agent-md-streaming');
                window.zcRenderMarkdown(resultBody, data.agentNotes || '(no output)');
                resultEl.hidden = false;

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }
            } catch (err) {
                processStatus.className = 'assessment-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
            } finally {
                // Make sure the visual checklist resolves even if the agent call failed.
                await validationPromise;
                processBtn.disabled = false;
            }
        }

        select.addEventListener('change', () => selectClaim(select.value));
        refreshBtn.addEventListener('click', loadClaims);
        processBtn.addEventListener('click', processClaim);

        loadClaims();
    }

    // Run on initial direct page load (DOM may already be parsed when this
    // permanent script executes, since it's at the end of <body>).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-run on every Blazor enhanced navigation. Inline <script> tags inside
    // razor pages do NOT re-execute on enhanced nav, so this listener — set
    // up once from a permanent <script src="..."> — is what keeps the panel
    // wired when the user navigates here from another page.
    if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
        Blazor.addEventListener('enhancedload', init);
    } else {
        document.addEventListener('enhancedload', init);
    }
})();

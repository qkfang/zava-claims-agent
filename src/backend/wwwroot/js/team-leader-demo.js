// Auto-extracted from the matching razor page.
// Loaded as a permanent script from App.razor so init runs reliably on full
// page load AND on Blazor enhanced navigation. Inline <script> tags inside
// razor pages do NOT re-execute on enhanced nav, which left dropdowns stuck
// on the SSR fallback (e.g. "— Loading claims —") until manual refresh.
    (function () {
        function init() {
        const root = document.querySelector('.leader-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const selectEl = $('#leader-claim-select');
        const refreshBtn = $('#leader-refresh-btn');
        const emptyEl = $('#leader-empty');
        const cardEl = $('#leader-claim-card');
        const step2El = $('#leader-step-2');
        const processBtn = $('#leader-process-btn');
        const processStatus = $('#leader-process-status');
        const engageScope = $('.engage-tabs-scope');

        let selectedClaim = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        function setSelectedClaim(claim) {
            selectedClaim = claim;
            if (!claim) {
                cardEl.hidden = true;
                if (step2El) step2El.hidden = true;
                processBtn.disabled = true;
                return;
            }
            $('#leader-claim-num').textContent = claim.claimNumber;
            $('#leader-claim-customer').textContent = claim.customerName || '—';
            $('#leader-claim-policy').textContent   = claim.policyNumber || '—';
            $('#leader-claim-type').textContent     = claim.claimType || '—';
            $('#leader-claim-date').textContent     = claim.incidentDate || '—';
            $('#leader-claim-location').textContent = claim.incidentLocation || '—';
            $('#leader-claim-desc').textContent     = claim.incidentDescription || '—';
            $('#leader-claim-loss').textContent     = claim.estimatedLoss || '—';
            $('#leader-claim-urgency').textContent  = claim.urgency || '—';
            cardEl.hidden = false;
            // Reveal step 2 (engage agent) now that a claim is picked.
            if (step2El) step2El.hidden = false;
            processBtn.disabled = false;
        }

        async function loadClaims() {
            selectEl.innerHTML = '<option value="">— Loading… —</option>';
            emptyEl.hidden = true;
            cardEl.hidden = true;
            if (step2El) step2El.hidden = true;
            processBtn.disabled = true;
            processStatus.hidden = true;

            try {
                const res = await fetch('/team-leader/claims');
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
                processStatus.className = 'leader-status error';
                processStatus.textContent = 'Failed to load claims: ' + err.message;
            }
        }

        async function selectClaim(claimNumber) {
            processStatus.hidden = true;
            if (!claimNumber) {
                setSelectedClaim(null);
                return;
            }
            try {
                const res = await fetch(`/team-leader/claims/${encodeURIComponent(claimNumber)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const claim = await res.json();
                setSelectedClaim(claim);
            } catch (err) {
                setSelectedClaim(null);
                processStatus.hidden = false;
                processStatus.className = 'leader-status error';
                processStatus.textContent = 'Failed to load claim: ' + err.message;
            }
        }

        async function processClaim() {
            if (!selectedClaim) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'leader-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Team Leader Agent…';

            try {
                const data = await window.zcAgentStream({
                    url: '/team-leader/process',
                    body: { claimNumber: selectedClaim.claimNumber },
                    onDelta: (_chunk, fullText) => {
                        if (window.engageTabsStreamNarrative) {
                            window.engageTabsStreamNarrative(engageScope, fullText);
                        }
                    },
                    onError: (msg) => {
                        processStatus.className = 'leader-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');

                if (data.agentNotes) {
                    processStatus.textContent = 'Team Leader Agent produced a report.';
                } else if (!data.agentConfigured) {
                    processStatus.className = 'leader-status error';
                    processStatus.textContent =
                        'Team Leader Foundry agent is not configured. ' +
                        'Set AZURE_AI_PROJECT_ENDPOINT and AZURE_AI_MODEL_DEPLOYMENT_NAME to enable it.';
                } else {
                    processStatus.className = 'leader-status error';
                    processStatus.textContent = data.agentError
                        ? 'Team Leader Agent failed: ' + data.agentError
                        : 'Team Leader Agent returned no narrative.';
                }

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    window.engageTabsRender(engageScope, data);
                }
            } catch (err) {
                processStatus.className = 'leader-status error';
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

        // ── Group Chat panel wiring ────────────────────────────────────
        function initGroupChat() {
            const root = document.querySelector('.groupchat-panel');
            if (!root || root.dataset.wired === '1') return;
            root.dataset.wired = '1';

            const $ = sel => root.querySelector(sel);
            const selectEl   = $('#gc-claim-select');
            const refreshBtn = $('#gc-refresh-btn');
            const emptyEl    = $('#gc-empty');
            const cardEl     = $('#gc-claim-card');
            const step2El    = $('#gc-step-2');
            const startBtn   = $('#gc-start-btn');
            const statusEl   = $('#gc-status');
            const rosterEl   = $('#gc-roster');
            const transcript = $('#gc-transcript');
            const transcriptStep = $('#gc-transcript-step');

            let selectedClaim = null;
            let activeStream = null;

            function escapeHtml(s) {
                return String(s ?? '').replace(/[&<>"']/g, c =>
                    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
            }

            function setSelectedClaim(claim) {
                selectedClaim = claim;
                if (!claim) {
                    cardEl.hidden = true;
                    if (step2El) step2El.hidden = true;
                    startBtn.disabled = true;
                    return;
                }
                $('#gc-claim-num').textContent = claim.claimNumber;
                $('#gc-claim-customer').textContent = claim.customerName || '—';
                $('#gc-claim-policy').textContent   = claim.policyNumber || '—';
                $('#gc-claim-type').textContent     = claim.claimType || '—';
                $('#gc-claim-date').textContent     = claim.incidentDate || '—';
                $('#gc-claim-desc').textContent     = claim.incidentDescription || '—';
                cardEl.hidden = false;
                // Reveal step 2 (start group chat) now that a claim is picked.
                if (step2El) step2El.hidden = false;
                startBtn.disabled = false;
            }

            async function loadClaims() {
                selectEl.innerHTML = '<option value="">— Loading… —</option>';
                emptyEl.hidden = true;
                cardEl.hidden = true;
                if (step2El) step2El.hidden = true;
                startBtn.disabled = true;
                statusEl.hidden = true;
                try {
                    const res = await fetch('/team-leader/claims');
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
                    statusEl.hidden = false;
                    statusEl.className = 'leader-status error';
                    statusEl.textContent = 'Failed to load claims: ' + err.message;
                }
            }

            async function selectClaim(claimNumber) {
                if (!claimNumber) { setSelectedClaim(null); return; }
                try {
                    const res = await fetch(`/team-leader/claims/${encodeURIComponent(claimNumber)}`);
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    setSelectedClaim(await res.json());
                } catch (err) {
                    setSelectedClaim(null);
                    statusEl.hidden = false;
                    statusEl.className = 'leader-status error';
                    statusEl.textContent = 'Failed to load claim: ' + err.message;
                }
            }

            async function loadRoster() {
                try {
                    const res = await fetch('/team-leader/groupchat/participants');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const parts = await res.json();
                    rosterEl.innerHTML =
                        `<span class="gc-chip leader">Theo — Claims Team Leader (chair)</span>` +
                        parts.map(p =>
                            `<span class="gc-chip">${escapeHtml(p.persona)} — ${escapeHtml(p.role)}</span>`
                        ).join('');
                } catch (err) {
                    rosterEl.innerHTML =
                        `<span class="gc-chip">Failed to load roster: ${escapeHtml(err.message)}</span>`;
                }
            }

            function appendTurn(turn) {
                const isLeader = turn.speakerId === 'team-leader';
                const cls = ['gc-msg'];
                if (isLeader) cls.push('gc-leader');
                if (turn.kind === 'info') cls.push('gc-info');
                if (turn.kind === 'error') cls.push('gc-error');
                if (turn.kind === 'conclude') cls.push('gc-conclude');

                const kindLabel = ({
                    info: 'orchestration', ask: 'asks', reply: 'replies',
                    conclude: 'concludes', error: 'error'
                })[turn.kind] || turn.kind;

                const div = document.createElement('div');
                div.className = cls.join(' ');
                div.innerHTML =
                    `<div class="gc-meta">` +
                        `<span class="gc-who">${escapeHtml(turn.persona)}</span>` +
                        `<span class="gc-role">${escapeHtml(turn.role)}</span>` +
                        `<span class="gc-kind">${escapeHtml(kindLabel)}</span>` +
                    `</div>` +
                    `<div class="gc-body"></div>`;
                div.querySelector('.gc-body').textContent = turn.text;
                transcript.appendChild(div);
                transcript.scrollTop = transcript.scrollHeight;
            }

            async function startGroupChat() {
                if (!selectedClaim) return;
                if (activeStream) { try { activeStream.close(); } catch { /* ignore — closing an already-closed stream */ } activeStream = null; }

                startBtn.disabled = true;
                statusEl.hidden = false;
                statusEl.className = 'leader-status';
                statusEl.innerHTML = '<span class="spinner"></span>Opening group chat…';
                transcript.innerHTML = '';
                transcriptStep.hidden = false;

                try {
                    const res = await fetch('/team-leader/groupchat/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ claimNumber: selectedClaim.claimNumber })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

                    statusEl.innerHTML = '<span class="spinner"></span>Theo is chairing the discussion…';
                    transcriptStep.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const sse = new EventSource(`/team-leader/groupchat/stream/${encodeURIComponent(data.sessionId)}`);
                    activeStream = sse;
                    sse.onmessage = ev => {
                        let turn;
                        try { turn = JSON.parse(ev.data); } catch { return; }
                        if (turn.kind === 'done') {
                            sse.close();
                            activeStream = null;
                            statusEl.className = 'leader-status';
                            statusEl.textContent = 'Group chat complete.';
                            startBtn.disabled = !selectedClaim;
                            return;
                        }
                        appendTurn(turn);
                    };
                    sse.onerror = () => {
                        sse.close();
                        activeStream = null;
                        if (!startBtn.disabled) return;
                        statusEl.className = 'leader-status error';
                        statusEl.textContent = 'Stream interrupted.';
                        startBtn.disabled = !selectedClaim;
                    };
                } catch (err) {
                    statusEl.className = 'leader-status error';
                    statusEl.textContent = 'Failed to start group chat: ' + err.message;
                    startBtn.disabled = !selectedClaim;
                }
            }

            selectEl.addEventListener('change', () => selectClaim(selectEl.value));
            refreshBtn.addEventListener('click', loadClaims);
            startBtn.addEventListener('click', startGroupChat);

            loadClaims();
            loadRoster();
        }

        init();
        initGroupChat();

        if (!window.__teamLeaderDemoEnhancedHook) {
            window.__teamLeaderDemoEnhancedHook = true;
            const hook = () => { init(); initGroupChat(); };
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

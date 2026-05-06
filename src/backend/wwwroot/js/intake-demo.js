// Claims Intake "Try It Out" demo wiring.
//
// This file is loaded globally from App.razor so it runs once on full page
// load AND re-binds on Blazor enhanced navigation (`enhancedload`). Inline
// <script> tags inside Razor pages are not reliably executed during
// enhanced navigation — when this script lived inline on the page, opening
// the page via SPA-style nav left the "Pick a sample email" section empty
// until a hard refresh. Loading it globally and wiring on `enhancedload`
// fixes that.
(function () {
    function init() {
        const root = document.querySelector('.intake-panel');
        if (!root || root.dataset.wired === '1') return;
        root.dataset.wired = '1';

        const $ = sel => root.querySelector(sel);
        const samplesEl = $('#intake-samples');
        const previewEl = $('#intake-preview');
        const processBtn = $('#intake-process-btn');
        const processStatus = $('#intake-process-status');
        const agentNotesEl = $('#intake-agent-notes');
        const agentNotesBody = $('#intake-agent-notes-body');
        const formWrap = $('#intake-form-wrap');
        const form = $('#intake-form');
        const urgencyEl = $('#intake-urgency');
        const urgencyPill = $('#intake-urgency-pill');
        const urgencyReason = $('#intake-urgency-reason');
        const submitBtn = $('#intake-submit-btn');
        const receipt = $('#intake-receipt');
        const receiptNum = $('#intake-receipt-num');
        const resetBtn = $('#intake-reset-btn');

        let selectedSampleId = null;
        let processed = null;

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }

        async function loadSamples() {
            samplesEl.innerHTML = '<div class="muted">Loading samples…</div>';
            try {
                const res = await fetch('/intake/samples');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const samples = await res.json();
                samplesEl.innerHTML = samples.map(s => `
                    <button type="button" class="intake-sample" data-id="${escapeHtml(s.id)}">
                        <div class="intake-sample-label">${escapeHtml(s.label)}</div>
                        <div class="intake-sample-meta"><span class="pill">${escapeHtml(s.claimType)}</span></div>
                        <div class="intake-sample-meta">📧 ${escapeHtml(s.emailSubject)}</div>
                        <div class="intake-sample-meta">📎 ${escapeHtml(s.formFileName)}</div>
                    </button>`).join('');
                samplesEl.querySelectorAll('.intake-sample').forEach(el => {
                    el.addEventListener('click', () => selectSample(el.dataset.id));
                });
            } catch (err) {
                samplesEl.innerHTML = `<div class="intake-status error">Failed to load samples: ${escapeHtml(err.message)}</div>`;
            }
        }

        async function selectSample(id) {
            selectedSampleId = id;
            samplesEl.querySelectorAll('.intake-sample').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            processed = null;
            processStatus.hidden = true;
            agentNotesEl.hidden = true;
            formWrap.hidden = true;
            urgencyEl.hidden = true;
            receipt.hidden = true;

            try {
                const res = await fetch(`/intake/samples/${encodeURIComponent(id)}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const s = await res.json();
                $('#intake-email-from').textContent = s.emailFrom;
                $('#intake-email-date').textContent = s.emailDate;
                $('#intake-email-subject').textContent = s.emailSubject;
                $('#intake-email-body').textContent = s.emailBody;
                $('#intake-form-name').textContent = s.formFileName;
                $('#intake-form-body').textContent = s.formDocumentText;
                previewEl.hidden = false;
                processBtn.disabled = false;
            } catch (err) {
                previewEl.hidden = true;
                processBtn.disabled = true;
                processStatus.hidden = false;
                processStatus.className = 'intake-status error';
                processStatus.textContent = 'Failed to load sample: ' + err.message;
            }
        }

        async function processSample() {
            if (!selectedSampleId) return;
            processBtn.disabled = true;
            processStatus.hidden = false;
            processStatus.className = 'intake-status';
            processStatus.innerHTML = '<span class="spinner"></span>Engaging Claims Intake Agent…';
            agentNotesEl.hidden = true;
            formWrap.hidden = true;
            urgencyEl.hidden = true;
            receipt.hidden = true;

            try {
                const data = await window.zcAgentStream({
                    url: '/intake/process',
                    body: { sampleId: selectedSampleId },
                    onDelta: (_chunk, fullText) => {
                        // Render incoming agent text live as plain preformatted
                        // text; markdown rendering is applied once the run is done.
                        agentNotesEl.hidden = false;
                        agentNotesBody.classList.add('agent-md-streaming');
                        agentNotesBody.textContent = fullText;
                    },
                    onError: (msg) => {
                        processStatus.className = 'intake-status error';
                        processStatus.textContent = 'Agent error: ' + msg;
                    }
                });
                if (!data) throw new Error('No response from agent');
                processed = data;

                processStatus.textContent = data.agentConfigured
                    ? 'Claims Intake Agent processed the email and form.'
                    : 'Processed (Foundry agent not configured — using deterministic demo extraction).';
                if (data.agentNotes) {
                    agentNotesEl.hidden = false;
                    agentNotesBody.classList.remove('agent-md-streaming');
                    window.zcRenderMarkdown(agentNotesBody, data.agentNotes);
                } else {
                    agentNotesEl.hidden = true;
                }

                const f = data.fields || {};
                form.customerName.value         = f.customerName || '';
                form.customerEmail.value        = f.customerEmail || '';
                form.customerPhone.value        = f.customerPhone || '';
                form.policyNumber.value         = f.policyNumber || '';
                form.claimType.value            = f.claimType || '';
                form.incidentDate.value         = f.incidentDate || '';
                form.incidentLocation.value     = f.incidentLocation || '';
                form.incidentDescription.value  = f.incidentDescription || '';
                form.estimatedLoss.value        = f.estimatedLoss || '';
                form.preferredContact.value     = f.preferredContact || '';
                formWrap.hidden = false;

                const level = (data.urgency || 'Medium').toString();
                urgencyPill.textContent = level;
                urgencyPill.className = 'intake-urgency-pill ' + level.toLowerCase();
                urgencyReason.textContent = data.urgencyReason || '';
                urgencyEl.hidden = false;

                // Surface input + raw output in the Engage Agent sub-tabs.
                if (window.engageTabsRender) {
                    const scope = document.querySelector('.intake-panel .engage-tabs-scope');
                    window.engageTabsRender(scope, data);
                }
            } catch (err) {
                processStatus.className = 'intake-status error';
                processStatus.textContent = 'Failed to process: ' + err.message;
                processBtn.disabled = false;
            }
        }

        async function submitForm(ev) {
            ev.preventDefault();
            if (!selectedSampleId || !processed) return;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting…';
            try {
                const payload = {
                    sampleId: selectedSampleId,
                    customerName: form.customerName.value,
                    customerEmail: form.customerEmail.value,
                    customerPhone: form.customerPhone.value,
                    policyNumber: form.policyNumber.value,
                    claimType: form.claimType.value,
                    incidentDate: form.incidentDate.value,
                    incidentLocation: form.incidentLocation.value,
                    incidentDescription: form.incidentDescription.value,
                    estimatedLoss: form.estimatedLoss.value,
                    preferredContact: form.preferredContact.value,
                    urgency: processed.urgency,
                    urgencyReason: processed.urgencyReason
                };
                const res = await fetch('/intake/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
                receiptNum.textContent = data.claimNumber;
                receipt.hidden = false;
                receipt.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (err) {
                alert('Failed to submit: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="intake-step-num inline">5</span>Submit claim';
            }
        }

        function reset() {
            selectedSampleId = null;
            processed = null;
            samplesEl.querySelectorAll('.intake-sample').forEach(el => el.classList.remove('selected'));
            previewEl.hidden = true;
            processBtn.disabled = true;
            processStatus.hidden = true;
            agentNotesEl.hidden = true;
            formWrap.hidden = true;
            urgencyEl.hidden = true;
            receipt.hidden = true;
            form.reset();
            samplesEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        processBtn.addEventListener('click', processSample);
        form.addEventListener('submit', submitForm);
        resetBtn.addEventListener('click', reset);

        loadSamples();
    }

    init();

    if (!window.__intakeDemoEnhancedHook) {
        window.__intakeDemoEnhancedHook = true;
        const hook = () => init();
        if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
            Blazor.addEventListener('enhancedload', hook);
        } else {
            document.addEventListener('enhancedload', hook);
        }
    }
})();

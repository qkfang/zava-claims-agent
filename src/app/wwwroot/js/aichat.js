// Document-query chatbot ("Ask AI") used on the Account page.
// Talks to /api/chat/ask and renders matching reference cards on the right.
// Ported from forex-trading-agent/src/research-analytics/Pages/Account/Index.cshtml.
// Self-guarded: no-ops if the panel markup is not present on the page.
(function () {
    const messagesEl = document.getElementById('aichat-messages');
    const inputEl    = document.getElementById('aichat-input');
    const sendBtn    = document.getElementById('aichat-send');
    const clearBtn   = document.getElementById('aichat-clear');
    const tempSlider = document.getElementById('aichat-temp');
    const tempLabel  = document.getElementById('aichat-temp-label');
    const refsEl     = document.getElementById('aichat-refs-list');
    const refsCount  = document.getElementById('aichat-refs-count');

    if (!messagesEl || !inputEl || !sendBtn || !tempSlider || !refsEl) return;

    tempSlider.addEventListener('input', () => {
        tempLabel.textContent = parseFloat(tempSlider.value).toFixed(2);
    });

    var history = [];

    function appendMsg(role, text) {
        var welcome = messagesEl.querySelector('.aichat-welcome');
        if (welcome) welcome.remove();

        var now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var div = document.createElement('div');
        div.className = 'aichat-msg aichat-msg-' + role;
        div.innerHTML =
            '<div class="aichat-bubble">' + escHtml(text) + '</div>' +
            '<div class="aichat-meta">' + (role === 'user' ? 'You' : 'AI') + ' · ' + now + '</div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    function appendTyping() {
        var div = document.createElement('div');
        div.className = 'aichat-msg aichat-msg-assistant aichat-typing';
        div.innerHTML = '<div class="aichat-bubble">Thinking…</div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    function renderRefs(refs) {
        refsCount.textContent = refs.length;
        if (!refs.length) {
            refsEl.innerHTML = '<div class="text-muted small text-center mt-4">No matching agents found for this query.</div>';
            return;
        }
        refsEl.innerHTML = refs.map(function (r, i) {
            return '<div class="aichat-ref-card">' +
                '<div class="d-flex justify-content-between align-items-start mb-1">' +
                '<span class="cat-badge">' + escHtml(r.category) + '</span>' +
                '</div>' +
                '<a href="' + r.url + '" target="_blank">[' + (i+1) + '] ' + escHtml(r.title) + '</a>' +
                '<p class="text-muted mb-1 mt-1" style="font-size:0.78rem;">' + escHtml((r.summary || '').substring(0, 120)) + '…</p>' +
                '<div class="text-muted" style="font-size:0.72rem;">' + escHtml(r.author || '') + ' · ' + escHtml(r.publishedDate || '') + '</div>' +
                '</div>';
        }).join('');
    }

    async function send() {
        var text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = '';
        sendBtn.disabled = true;

        appendMsg('user', text);
        var typing = appendTyping();

        history.push({ role: 'user', content: text });

        try {
            var res = await fetch('/api/chat/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    temperature: parseFloat(tempSlider.value),
                    history: history.slice(-10)
                })
            });
            var data = await res.json();
            typing.remove();
            appendMsg('assistant', data.response);
            history.push({ role: 'assistant', content: data.response });
            renderRefs(data.references || []);
        } catch (e) {
            typing.remove();
            appendMsg('assistant', 'Request failed. Please try again.');
        }
        sendBtn.disabled = false;
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            history = [];
            messagesEl.innerHTML =
                '<div class="aichat-welcome">' +
                '<i class="fa-solid fa-brain fa-2x mb-2"></i>' +
                '<p class="mb-1 fw-semibold">Zava Claims AI Assistant</p>' +
                '<p class="small text-muted">Ask about your claim, policy coverage, or how the claims office works.</p>' +
                '</div>';
            refsEl.innerHTML = '<div class="text-muted small text-center mt-4">References will appear here after your first query.</div>';
            refsCount.textContent = '0';
        });
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
})();

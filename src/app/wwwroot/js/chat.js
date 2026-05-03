// Floating chatbot widget — talks to /chatkit (SSE protocol).
// Ported from forex-trading-agent/src/research-analytics/wwwroot/js/chat.js.
// Self-guarded: no-ops if the widget markup is not present on the page.
(function () {
    var toggleBtn = document.getElementById('chatkit-toggle');
    var panel = document.getElementById('chatkit-panel');
    var messages = document.getElementById('chatkit-messages');
    var form = document.getElementById('chatkit-form');
    var input = document.getElementById('chatkit-input');
    var prompts = document.getElementById('chatkit-prompts');
    if (!toggleBtn || !panel || !messages || !form || !input || !prompts) return;

    var threadId = null;
    var sending = false;

    toggleBtn.addEventListener('click', function () {
        var isOpen = panel.style.display === 'block';
        panel.style.display = isOpen ? 'none' : 'block';
    });

    prompts.addEventListener('click', function (e) {
        var btn = e.target.closest('.chatkit-prompt-btn');
        if (btn) sendMessage(btn.getAttribute('data-prompt'));
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (text) sendMessage(text);
    });

    function appendMessage(role, text) {
        var div = document.createElement('div');
        div.className = 'chatkit-msg chatkit-msg-' + role;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    }

    function sendMessage(text) {
        if (sending) return;
        sending = true;
        input.value = '';
        prompts.style.display = 'none';

        appendMessage('user', text);
        var assistantDiv = appendMessage('assistant', '');

        var payload = threadId
            ? { type: 'threads.add_user_message', params: { thread_id: threadId, input: { content: text } } }
            : { type: 'threads.create', params: { input: { content: text } } };

        fetch('/chatkit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (res) {
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function read() {
                reader.read().then(function (result) {
                    if (result.done) { sending = false; return; }
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach(function (line) {
                        if (line.indexOf('data: ') !== 0) return;
                        try {
                            var evt = JSON.parse(line.substring(6));
                            if (evt.type === 'thread.created' && evt.thread) {
                                threadId = evt.thread.id;
                            }
                            if (evt.type === 'thread.item.done' && evt.item && evt.item.type === 'assistant_message') {
                                var parts = evt.item.content;
                                if (Array.isArray(parts)) {
                                    assistantDiv.textContent = parts.map(function (p) { return p.text || ''; }).join('');
                                } else if (typeof parts === 'string') {
                                    assistantDiv.textContent = parts;
                                }
                            }
                        } catch (_) {}
                    });
                    read();
                });
            }
            read();
        }).catch(function () {
            assistantDiv.textContent = 'Sorry, something went wrong. Please try again.';
            sending = false;
        });
    }
})();

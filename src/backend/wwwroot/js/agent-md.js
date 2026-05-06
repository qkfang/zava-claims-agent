/* Markdown rendering helper for agent response / output panels.
   Calls the server-side `/api/markdown` endpoint (Markdig) and injects the
   resulting HTML into the target element. Falls back to escaped pre-text
   if the request fails so the UI never breaks. */
(function () {
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function ensureClass(el) {
        if (el && !el.classList.contains('agent-md')) el.classList.add('agent-md');
    }

    /**
     * Render markdown text into the given element via the server-side Markdig
     * endpoint. Returns a Promise that resolves once the element is updated.
     * @param {Element|string} target  Element or CSS selector.
     * @param {string} text            Raw markdown text.
     */
    window.zcRenderMarkdown = function (target, text) {
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) return Promise.resolve();
        var raw = String(text == null ? '' : text);
        ensureClass(el);

        if (!raw) {
            el.innerHTML = '';
            return Promise.resolve();
        }

        return fetch('/api/markdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: raw })
        })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                el.innerHTML = (data && data.html) ? data.html : '';
            })
            .catch(function () {
                // Fallback — render as preformatted text so output is still readable.
                el.innerHTML = '<pre class="agent-md-fallback">' + escapeHtml(raw) + '</pre>';
            });
    };
})();

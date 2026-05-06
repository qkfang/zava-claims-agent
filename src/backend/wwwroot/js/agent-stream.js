/**
 * Shared SSE client used by every "Try It Out" agent page in /backend
 * to stream the live Foundry agent reply back from the matching
 * /{role}/process endpoint and surface it progressively in the UI.
 *
 * Each /process endpoint accepts `Accept: text/event-stream` and emits:
 *   - `event: delta`  with `{ "text": "..." }` per text chunk
 *   - `event: error`  with `{ "message": "..." }` on agent failure
 *   - `event: done`   with the same JSON envelope the non-streaming
 *                     response would have returned (fields, urgency,
 *                     agentNotes, agentRawOutput, etc).
 *
 * Usage from a page script:
 *   await window.zcAgentStream({
 *     url: '/intake/process',
 *     body: { sampleId },
 *     onDelta: (chunk, fullText) => { ... append chunk to UI ... },
 *     onError: (msg) => { ... },
 *     onDone:  (envelope) => { ... finalise UI ... }
 *   });
 *
 * Returns a Promise that resolves to the final envelope (or rejects on
 * transport / HTTP errors). When the browser does not support
 * ReadableStream (very old environments) the helper falls back to a
 * plain JSON POST so the page still works without streaming.
 */
(function () {
    function isStreamSupported() {
        return typeof window !== 'undefined'
            && typeof window.fetch === 'function'
            && typeof TextDecoder !== 'undefined'
            && window.ReadableStream;
    }

    /**
     * Parse a single SSE frame (text between two blank lines) into
     * { event, data } where `data` is the concatenation of all
     * `data:` lines. Lines starting with `:` are comments and ignored.
     */
    function parseFrame(frame) {
        let eventName = 'message';
        const dataLines = [];
        const lines = frame.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.charAt(0) === ':') continue;
            const colon = line.indexOf(':');
            const field = colon === -1 ? line : line.substring(0, colon);
            // Per SSE spec, a single space after the colon is stripped.
            let value = colon === -1 ? '' : line.substring(colon + 1);
            if (value.charAt(0) === ' ') value = value.substring(1);
            if (field === 'event') eventName = value;
            else if (field === 'data') dataLines.push(value);
        }
        return { event: eventName, data: dataLines.join('\n') };
    }

    async function streamWithFetch(opts) {
        const res = await fetch(opts.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(opts.body || {})
        });
        if (!res.ok) {
            // Best-effort error reporting — try to read the JSON body.
            let message = 'HTTP ' + res.status;
            try {
                const data = await res.json();
                if (data && data.error) message = data.error;
            } catch (_) { /* ignore */ }
            throw new Error(message);
        }

        const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
        // If the server replied with JSON (e.g. validation error or no
        // SSE upgrade), decode once and return the envelope directly.
        if (!ctype.includes('text/event-stream')) {
            const data = await res.json();
            if (typeof opts.onDone === 'function') opts.onDone(data);
            return data;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let envelope = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Frames are separated by a blank line. Handle both \n\n and \r\n\r\n.
            let separatorIndex;
            while (
                (separatorIndex = buffer.indexOf('\n\n')) !== -1
                || (separatorIndex = buffer.indexOf('\r\n\r\n')) !== -1
            ) {
                const sepLen = buffer.charAt(separatorIndex) === '\r' ? 4 : 2;
                const rawFrame = buffer.substring(0, separatorIndex);
                buffer = buffer.substring(separatorIndex + sepLen);
                if (!rawFrame) continue;

                const { event, data } = parseFrame(rawFrame);
                if (!data) continue;

                let payload;
                try { payload = JSON.parse(data); }
                catch (_) { continue; }

                if (event === 'delta') {
                    const chunk = (payload && typeof payload.text === 'string') ? payload.text : '';
                    if (chunk) {
                        fullText += chunk;
                        if (typeof opts.onDelta === 'function') opts.onDelta(chunk, fullText);
                    }
                } else if (event === 'error') {
                    const message = (payload && payload.message) || 'Agent error';
                    if (typeof opts.onError === 'function') opts.onError(message);
                } else if (event === 'done') {
                    envelope = payload;
                    if (typeof opts.onDone === 'function') opts.onDone(payload);
                }
            }
        }

        return envelope;
    }

    async function streamWithJsonFallback(opts) {
        const res = await fetch(opts.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts.body || {})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const message = (data && data.error) ? data.error : 'HTTP ' + res.status;
            throw new Error(message);
        }
        if (data && typeof data.agentNotes === 'string'
            && typeof opts.onDelta === 'function' && data.agentNotes) {
            opts.onDelta(data.agentNotes, data.agentNotes);
        }
        if (typeof opts.onDone === 'function') opts.onDone(data);
        return data;
    }

    window.zcAgentStream = function (opts) {
        if (!opts || !opts.url) {
            return Promise.reject(new Error('zcAgentStream: url is required'));
        }
        return isStreamSupported()
            ? streamWithFetch(opts)
            : streamWithJsonFallback(opts);
    };
})();

// Customer Communications page — Voice chat tab (real-time speech-to-speech).
// Externalised so init runs reliably on Blazor enhanced navigation.

    // Voice chat tab — real-time speech-to-speech via Azure AI Foundry
    // Voice Live API. The backend at /communications/voice-live proxies a
    // bearer-authenticated WebSocket to the Customer Communications
    // Foundry agent (Cara). The browser captures 24 kHz mono PCM16 from
    // the mic and plays returned PCM16 audio chunks back through the Web
    // Audio API. Server-side VAD on the Voice Live side decides when Cara
    // replies, so the user can talk naturally and even barge in.
    (function () {
        function initVoice() {
            const root = document.querySelector('.voice-panel');
            if (!root || root.dataset.wired === '1') return;
            root.dataset.wired = '1';

            const $ = sel => root.querySelector(sel);
            const claimSelect = $('#voice-claim-select');
            const refreshBtn = $('#voice-refresh-btn');
            const micBtn = $('#voice-mic-btn');
            const micLabel = micBtn.querySelector('.voice-mic-label');
            const wave = $('#voice-wave');
            const statusEl = $('#voice-status');
            const textInput = $('#voice-text-input');
            const sendBtn = $('#voice-text-send');
            const ttsToggle = $('#voice-tts-toggle');
            const transcriptEl = $('#voice-transcript');

            const SAMPLE_RATE = 24000;
            const FRAME_MS = 50;
            const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;

            const waveBars = Array.from(wave.querySelectorAll('span'));

            let ws = null;
            let connected = false;
            let connecting = false;
            let voiceEnabled = false;
            let micStream = null;
            let micCtx = null;
            let scriptNode = null;
            let analyserIn = null;
            let analyserOut = null;
            let waveRaf = 0;
            let playbackCtx = null;
            let playbackTime = 0;
            let activeSources = [];
            let userTranscriptEl = null;
            let caraTranscriptEl = null;
            let caraSpeaking = false;

            function escapeHtml(s) {
                return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
            }
            function setStatus(text, isError) {
                statusEl.textContent = text;
                statusEl.classList.toggle('error', !!isError);
            }
            function clearEmpty() {
                const empty = transcriptEl.querySelector('.voice-empty');
                if (empty) empty.remove();
            }
            function appendMessage(role, text) {
                clearEmpty();
                const div = document.createElement('div');
                div.className = 'voice-msg ' + (role === 'user' ? 'user' : 'cara');
                const roleSpan = document.createElement('span');
                roleSpan.className = 'voice-msg-role';
                roleSpan.textContent = role === 'user' ? 'You' : 'Cara';
                const textSpan = document.createElement('span');
                textSpan.className = 'voice-msg-text';
                textSpan.textContent = text;
                div.appendChild(roleSpan);
                div.appendChild(textSpan);
                transcriptEl.appendChild(div);
                transcriptEl.scrollTop = transcriptEl.scrollHeight;
                return div;
            }
            function appendOrUpdate(role, text, currentRef) {
                if (currentRef && currentRef.parentNode) {
                    currentRef.querySelector('.voice-msg-text').textContent = text;
                    transcriptEl.scrollTop = transcriptEl.scrollHeight;
                    return currentRef;
                }
                return appendMessage(role, text);
            }

            function startWaveLoop() {
                if (waveRaf) return;
                const bufIn = analyserIn ? new Uint8Array(analyserIn.frequencyBinCount) : null;
                const bufOut = analyserOut ? new Uint8Array(analyserOut.frequencyBinCount) : null;
                const tick = () => {
                    let useOut = caraSpeaking && analyserOut;
                    let buf;
                    if (useOut) { analyserOut.getByteFrequencyData(bufOut); buf = bufOut; }
                    else if (analyserIn) { analyserIn.getByteFrequencyData(bufIn); buf = bufIn; }
                    if (buf) {
                        for (let i = 0; i < waveBars.length; i++) {
                            const v = buf[i % buf.length] / 255;
                            const h = Math.max(8, Math.min(46, 8 + v * 60));
                            waveBars[i].style.height = h + 'px';
                        }
                    }
                    wave.classList.toggle('speaking', caraSpeaking);
                    waveRaf = requestAnimationFrame(tick);
                };
                wave.classList.add('active');
                waveRaf = requestAnimationFrame(tick);
            }
            function stopWaveLoop() {
                if (waveRaf) cancelAnimationFrame(waveRaf);
                waveRaf = 0;
                wave.classList.remove('active', 'speaking');
                waveBars.forEach(b => { b.style.height = ''; });
            }

            async function probeConfig() {
                try {
                    const res = await fetch('/communications/voice-live/config');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const cfg = await res.json();
                    voiceEnabled = !!cfg.enabled;
                } catch (_) {
                    voiceEnabled = false;
                }
                if (!voiceEnabled) {
                    micBtn.classList.add('disabled');
                    micBtn.disabled = true;
                    micLabel.textContent = 'Mic unavailable';
                    setStatus('Voice Live is not configured on the server. Set AZURE_AI_PROJECT_ENDPOINT to enable real-time voice. You can still type below once connected.', true);
                } else {
                    setStatus('Idle. Press the mic to start a live conversation with Cara.');
                }
            }

            async function loadClaims() {
                claimSelect.disabled = true;
                claimSelect.innerHTML = '<option value="">Loading claims…</option>';
                try {
                    const res = await fetch('/communications/claims');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const claims = await res.json();
                    const opts = ['<option value="">No claim context — open conversation</option>']
                        .concat(claims.map(c => '<option value="' + escapeHtml(c.claimNumber) + '">' +
                            escapeHtml(c.claimNumber) + ' · ' + escapeHtml(c.customerName) + ' · ' + escapeHtml(c.claimType) +
                            '</option>'));
                    claimSelect.innerHTML = opts.join('');
                    claimSelect.disabled = false;
                } catch (_) {
                    claimSelect.innerHTML = '<option value="">No claim context — open conversation</option>';
                    claimSelect.disabled = false;
                }
            }

            async function loadClaimDetail(claimNumber) {
                if (!claimNumber) return null;
                try {
                    const res = await fetch('/communications/claims/' + encodeURIComponent(claimNumber));
                    if (!res.ok) return null;
                    return await res.json();
                } catch (_) { return null; }
            }

            function floatToPcm16(f32) {
                const out = new Int16Array(f32.length);
                for (let i = 0; i < f32.length; i++) {
                    let s = Math.max(-1, Math.min(1, f32[i]));
                    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                return out;
            }
            function pcm16ToFloat(int16) {
                const out = new Float32Array(int16.length);
                for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 0x8000;
                return out;
            }
            function arrayBufferToBase64(buf) {
                let bin = '';
                const bytes = new Uint8Array(buf);
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                return btoa(bin);
            }
            function base64ToArrayBuffer(b64) {
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return bytes.buffer;
            }
            function downsample(buf, srcRate, dstRate) {
                if (dstRate === srcRate) return buf;
                const ratio = srcRate / dstRate;
                const newLen = Math.round(buf.length / ratio);
                const out = new Float32Array(newLen);
                let pos = 0, idx = 0;
                while (pos < newLen) {
                    const next = Math.round((pos + 1) * ratio);
                    let sum = 0, count = 0;
                    for (; idx < next && idx < buf.length; idx++) { sum += buf[idx]; count++; }
                    out[pos++] = count ? sum / count : 0;
                }
                return out;
            }

            async function startCapture() {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                try {
                    micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
                } catch (_) {
                    micCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (micCtx.state === 'suspended') await micCtx.resume();

                const source = micCtx.createMediaStreamSource(micStream);
                analyserIn = micCtx.createAnalyser();
                analyserIn.fftSize = 64;
                source.connect(analyserIn);

                const bufferSize = 2048;
                scriptNode = micCtx.createScriptProcessor(bufferSize, 1, 1);
                let pending = [];

                scriptNode.onaudioprocess = (e) => {
                    if (!ws || ws.readyState !== WebSocket.OPEN) return;
                    let f32 = e.inputBuffer.getChannelData(0);
                    if (Math.abs(micCtx.sampleRate - SAMPLE_RATE) > 1) {
                        f32 = downsample(f32, micCtx.sampleRate, SAMPLE_RATE);
                    }
                    pending.push(new Float32Array(f32));
                    let total = pending.reduce((s, a) => s + a.length, 0);
                    while (total >= FRAME_SAMPLES) {
                        const frame = new Float32Array(FRAME_SAMPLES);
                        let written = 0;
                        while (written < FRAME_SAMPLES && pending.length) {
                            const chunk = pending[0];
                            const need = FRAME_SAMPLES - written;
                            if (chunk.length <= need) {
                                frame.set(chunk, written);
                                written += chunk.length;
                                pending.shift();
                            } else {
                                frame.set(chunk.subarray(0, need), written);
                                pending[0] = chunk.subarray(need);
                                written = FRAME_SAMPLES;
                            }
                        }
                        const pcm = floatToPcm16(frame);
                        const b64 = arrayBufferToBase64(pcm.buffer);
                        try {
                            ws.send(JSON.stringify({
                                type: 'input_audio_buffer.append',
                                audio: b64
                            }));
                        } catch (_) {}
                        total -= FRAME_SAMPLES;
                    }
                };
                source.connect(scriptNode);
                scriptNode.connect(micCtx.destination);
            }

            function stopCapture() {
                try { if (scriptNode) scriptNode.disconnect(); } catch (_) {}
                scriptNode = null;
                if (micStream) {
                    micStream.getTracks().forEach(t => t.stop());
                    micStream = null;
                }
                if (micCtx) {
                    try { micCtx.close(); } catch (_) {}
                    micCtx = null;
                }
                analyserIn = null;
            }

            function ensurePlayback() {
                if (playbackCtx) return playbackCtx;
                try {
                    playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
                } catch (_) {
                    playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                analyserOut = playbackCtx.createAnalyser();
                analyserOut.fftSize = 64;
                analyserOut.connect(playbackCtx.destination);
                playbackTime = playbackCtx.currentTime;
                return playbackCtx;
            }
            function enqueuePcm16(int16) {
                const ctx = ensurePlayback();
                if (ctx.state === 'suspended') ctx.resume();
                const f32 = pcm16ToFloat(int16);
                const buf = ctx.createBuffer(1, f32.length, SAMPLE_RATE);
                buf.getChannelData(0).set(f32);
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(analyserOut);
                const startAt = Math.max(playbackTime, ctx.currentTime + 0.02);
                src.start(startAt);
                playbackTime = startAt + buf.duration;
                src.onended = () => {
                    activeSources = activeSources.filter(s => s !== src);
                    if (!activeSources.length) {
                        caraSpeaking = false;
                        micBtn.classList.remove('speaking');
                    }
                };
                activeSources.push(src);
                if (!caraSpeaking) {
                    caraSpeaking = true;
                    micBtn.classList.add('speaking');
                }
            }
            function flushPlayback() {
                activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
                activeSources = [];
                if (playbackCtx) playbackTime = playbackCtx.currentTime;
                caraSpeaking = false;
                micBtn.classList.remove('speaking');
            }

            function onServerEvent(evt) {
                switch (evt.type) {
                    case 'session.created':
                    case 'session.updated':
                        setStatus('Connected. Speak naturally — Cara is listening.');
                        break;
                    case 'input_audio_buffer.speech_started':
                        flushPlayback();
                        caraTranscriptEl = null;
                        setStatus('Listening…');
                        break;
                    case 'input_audio_buffer.speech_stopped':
                        setStatus('Cara is thinking…');
                        break;
                    case 'conversation.item.input_audio_transcription.delta': {
                        const prev = userTranscriptEl ? userTranscriptEl.querySelector('.voice-msg-text').textContent : '';
                        userTranscriptEl = appendOrUpdate('user', prev + (evt.delta || ''), userTranscriptEl);
                        break;
                    }
                    case 'conversation.item.input_audio_transcription.completed':
                        if (evt.transcript) {
                            userTranscriptEl = appendOrUpdate('user', evt.transcript, userTranscriptEl);
                        }
                        userTranscriptEl = null;
                        break;
                    case 'response.audio_transcript.delta': {
                        const prev = caraTranscriptEl ? caraTranscriptEl.querySelector('.voice-msg-text').textContent : '';
                        caraTranscriptEl = appendOrUpdate('cara', prev + (evt.delta || ''), caraTranscriptEl);
                        break;
                    }
                    case 'response.audio_transcript.done':
                        if (evt.transcript) {
                            caraTranscriptEl = appendOrUpdate('cara', evt.transcript, caraTranscriptEl);
                        }
                        caraTranscriptEl = null;
                        break;
                    case 'response.audio.delta':
                        if (evt.delta && ttsToggle.checked) {
                            const buf = base64ToArrayBuffer(evt.delta);
                            const i16 = new Int16Array(buf);
                            enqueuePcm16(i16);
                        }
                        break;
                    case 'response.done':
                        setStatus('Ready. Keep talking, or press the mic to end the call.');
                        break;
                    case 'error': {
                        const msg = (evt.error && (evt.error.message || evt.error.code)) || 'Voice Live error';
                        setStatus('Voice Live error: ' + msg, true);
                        break;
                    }
                }
            }

            async function connect() {
                if (connected || connecting) return;
                connecting = true;
                setStatus('Connecting to Voice Live…');

                const claim = await loadClaimDetail(claimSelect.value);

                const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const url = proto + '//' + location.host + '/communications/voice-live';

                ws = new WebSocket(url);
                ws.binaryType = 'arraybuffer';

                ws.onopen = async () => {
                    connected = true;
                    connecting = false;
                    micBtn.classList.add('listening');
                    micBtn.setAttribute('aria-pressed', 'true');
                    micLabel.textContent = 'End call';
                    ensurePlayback();

                    // Configure the Voice Live session — PCM16 24 kHz both
                    // ways, server VAD, noise suppression / echo
                    // cancellation, automatic input transcription so we
                    // can show what the user said. The "instructions"
                    // property is intentionally omitted: when using a
                    // custom Foundry agent (Cara) the agent already has
                    // its own instructions configured server-side.
                    const sessionUpdate = {
                        type: 'session.update',
                        session: {
                            modalities: ['audio', 'text'],
                            input_audio_format: 'pcm16',
                            output_audio_format: 'pcm16',
                            input_audio_sampling_rate: SAMPLE_RATE,
                            input_audio_noise_reduction: { type: 'azure_deep_noise_suppression' },
                            input_audio_echo_cancellation: { type: 'server_echo_cancellation' },
                            turn_detection: {
                                type: 'azure_semantic_vad',
                                silence_duration_ms: 500,
                                threshold: 0.5
                            },
                            input_audio_transcription: { model: 'whisper-1' },
                            voice: {
                                name: 'en-US-Ava:DragonHDLatestNeural',
                                type: 'azure-standard'
                            }
                        }
                    };
                    try { ws.send(JSON.stringify(sessionUpdate)); } catch (_) {}

                    if (claim) {
                        const ctxText =
                            'Context for this call (do not read this aloud unless asked):\n' +
                            'Claim number: ' + (claim.claimNumber || '') + '\n' +
                            'Customer: ' + (claim.customerName || '') + '\n' +
                            'Policy: ' + (claim.policyNumber || '') + '\n' +
                            'Claim type: ' + (claim.claimType || '') + '\n' +
                            'Incident: ' + (claim.incidentDate || '') + ' · ' + (claim.incidentLocation || '') + '\n' +
                            'Description: ' + (claim.incidentDescription || '') + '\n' +
                            'Urgency: ' + (claim.urgency || '') + '\n' +
                            'Stage: Lodged, awaiting Claims Assessment.';
                        try {
                            ws.send(JSON.stringify({
                                type: 'conversation.item.create',
                                item: {
                                    type: 'message',
                                    role: 'user',
                                    content: [{ type: 'input_text', text: ctxText }]
                                }
                            }));
                        } catch (_) {}
                    }

                    try {
                        await startCapture();
                        startWaveLoop();
                        setStatus('Connected. Say hello — Cara can hear you.');
                    } catch (err) {
                        setStatus('Could not access microphone: ' + (err.message || err) + '. You can still type below.', true);
                    }
                };

                ws.onmessage = (e) => {
                    if (typeof e.data !== 'string') return;
                    try {
                        const evt = JSON.parse(e.data);
                        onServerEvent(evt);
                    } catch (_) { /* ignore */ }
                };

                ws.onerror = () => {
                    setStatus('Voice Live connection error. Please retry.', true);
                };

                ws.onclose = () => {
                    teardown();
                    setStatus('Call ended.');
                };
            }

            function teardown() {
                connected = false;
                connecting = false;
                stopCapture();
                stopWaveLoop();
                flushPlayback();
                micBtn.classList.remove('listening', 'speaking');
                micBtn.setAttribute('aria-pressed', 'false');
                micLabel.textContent = 'Press to talk';
                userTranscriptEl = null;
                caraTranscriptEl = null;
                if (ws) {
                    try { ws.close(); } catch (_) {}
                    ws = null;
                }
            }

            async function toggleMic() {
                if (connected || connecting) {
                    teardown();
                    setStatus('Call ended.');
                    return;
                }
                if (!voiceEnabled) {
                    setStatus('Voice Live is not configured on the server. You can still type below once connected.', true);
                    return;
                }
                try {
                    await connect();
                } catch (err) {
                    setStatus('Could not start call: ' + (err.message || err), true);
                    teardown();
                }
            }

            function sendText(text) {
                if (!text) return;
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    setStatus('Start a call first to chat with Cara via Voice Live.', true);
                    return;
                }
                appendMessage('user', text);
                try {
                    ws.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: 'user',
                            content: [{ type: 'input_text', text }]
                        }
                    }));
                    ws.send(JSON.stringify({ type: 'response.create' }));
                } catch (_) {}
            }

            micBtn.addEventListener('click', toggleMic);
            refreshBtn.addEventListener('click', loadClaims);
            sendBtn.addEventListener('click', () => {
                const v = textInput.value.trim();
                if (!v) return;
                textInput.value = '';
                sendText(v);
            });
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendBtn.click();
                }
            });

            probeConfig();
            loadClaims();
        }

        initVoice();

        if (!window.__commsVoiceEnhancedHook) {
            window.__commsVoiceEnhancedHook = true;
            const hook = () => initVoice();
            if (typeof Blazor !== 'undefined' && typeof Blazor.addEventListener === 'function') {
                Blazor.addEventListener('enhancedload', hook);
            } else {
                document.addEventListener('enhancedload', hook);
            }
        }
    })();

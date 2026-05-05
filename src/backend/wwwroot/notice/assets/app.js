// Shared header / navigation injected on every page.
const NAV = [
  { href: 'index.html', label: 'Home' },
  { href: 'pages/extract-di.html', label: 'Extract (DI)' },
  { href: 'pages/extract-cu.html', label: 'Extract (CU)' },
  { href: 'pages/extract-agent.html', label: 'Extract (Agent)' },
  { href: 'pages/notification.html', label: 'Notification Agent' },
  { href: 'pages/correspondence.html', label: 'Correspondence Agent' }
];

function renderHeader(activeKey) {
  const inPages = location.pathname.includes('/pages/');
  const prefix = inPages ? '../' : '';
  const links = NAV.map(n => {
    const href = prefix + n.href;
    const cls = n.label === activeKey ? 'active' : '';
    return `<a class="${cls}" href="${href}">${n.label}</a>`;
  }).join('');
  document.body.insertAdjacentHTML('afterbegin', `
    <header>
      <div class="brand">Notice Intelligence</div>
      <nav>${links}</nav>
    </header>
  `);
}

function esc(v) {
  if (v == null || v === '') return '—';
  return String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const SAMPLE_DOCS = [
  { id: 1, src: '/notice/samples/sample1.png', label: 'IRS Notice CP14' },
  { id: 2, src: '/notice/samples/sample2.png', label: 'IRS Letter CP14' },
  { id: 3, src: '/notice/samples/sample3.png', label: 'NY State Tax Bill' },
  { id: 4, src: '/notice/samples/sample4.png', label: 'NY Audit Notice' }
];

function renderSampleGallery(containerId, onPick) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const inPages = location.pathname.includes('/pages/');
  const prefix = inPages ? '../' : '';
  el.classList.add('sample-grid');
  el.innerHTML = SAMPLE_DOCS.map(s => `
    <div class="sample-tile" data-id="${s.id}">
      <img src="${s.src}" alt="${s.label}" loading="lazy" />
      <div class="sample-label">${s.label}</div>
      <div class="sample-actions">
        <button type="button" class="btn-secondary btn-view">View</button>
        <button type="button" class="btn-pick">Use</button>
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.sample-tile').forEach(tile => {
    const id = Number(tile.dataset.id);
    const sample = { ...SAMPLE_DOCS.find(s => s.id === id), src: SAMPLE_DOCS.find(s => s.id === id).src };
    tile.querySelector('.btn-view').addEventListener('click', () => openSampleLightbox(sample));
    tile.querySelector('img').addEventListener('click', () => openSampleLightbox(sample));
    tile.querySelector('.btn-pick').addEventListener('click', () => {
      el.querySelectorAll('.sample-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      if (typeof onPick === 'function') onPick(sample);
    });
  });
}

// Reusable hover-triggered "Sample Docs" popover.
// Inserts a trigger (text) into the host element; on hover/focus it opens a
// popover containing the sample tiles. Calls options.onPick(sample) when
// a sample is chosen via the "Use" button.
function mountSampleDocsPopover(hostId, options) {
  const host = document.getElementById(hostId);
  if (!host) return null;
  options = options || {};
  const inPages = location.pathname.includes('/pages/');
  const prefix = inPages ? '../' : '';
  const tiles = SAMPLE_DOCS.map(s => `
    <div class="sample-tile" data-id="${s.id}">
      <img src="${s.src}" alt="${s.label}" loading="lazy" />
      <div class="sample-label">${s.label}</div>
      <div class="sample-actions">
        <button type="button" class="btn-secondary btn-view">View</button>
        <button type="button" class="btn-pick">Use</button>
      </div>
    </div>`).join('');
  host.classList.add('sample-docs-wrapper');
  host.innerHTML = `
    <span class="sample-docs-trigger" tabindex="0" role="button" aria-haspopup="true">📎 Sample Docs</span>
    <div class="sample-docs-popover" role="dialog" aria-label="Sample documents">
      <div class="sample-docs-title">Sample Documents</div>
      <div class="sample-docs-hint">Click an image to preview, or "Use" to pick it.</div>
      <div class="sample-grid">${tiles}</div>
    </div>`;

  const trigger = host.querySelector('.sample-docs-trigger');
  const popover = host.querySelector('.sample-docs-popover');
  let closeTimer = null;
  const open = () => { clearTimeout(closeTimer); popover.classList.add('open'); };
  const scheduleClose = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => popover.classList.remove('open'), 180); };
  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('focus', open);
  trigger.addEventListener('mouseleave', scheduleClose);
  trigger.addEventListener('blur', scheduleClose);
  popover.addEventListener('mouseenter', open);
  popover.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') popover.classList.remove('open'); });

  popover.querySelectorAll('.sample-tile').forEach(tile => {
    const id = Number(tile.dataset.id);
    const baseSample = SAMPLE_DOCS.find(s => s.id === id);
    const sample = { ...baseSample, src: baseSample.src };
    tile.querySelector('.btn-view').addEventListener('click', () => openSampleLightbox(sample));
    tile.querySelector('img').addEventListener('click', () => openSampleLightbox(sample));
    tile.querySelector('.btn-pick').addEventListener('click', () => {
      popover.querySelectorAll('.sample-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      popover.classList.remove('open');
      if (typeof options.onPick === 'function') options.onPick(sample);
    });
  });

  return {
    clearSelection() {
      popover.querySelectorAll('.sample-tile').forEach(t => t.classList.remove('selected'));
    }
  };
}

function openSampleLightbox(sample) {
  let lb = document.getElementById('sample-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'sample-lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = '<div class="lightbox-inner"><img alt="" /><button class="lightbox-close" type="button" aria-label="Close">&times;</button></div>';
    document.body.appendChild(lb);
    lb.addEventListener('click', e => {
      if (e.target === lb || e.target.classList.contains('lightbox-close')) lb.classList.remove('open');
    });
  }
  lb.querySelector('img').src = sample.src;
  lb.classList.add('open');
}

async function fetchSampleAsFile(sample) {
  const res = await fetch(sample.src);
  if (!res.ok) throw new Error(`Failed to load sample: HTTP ${res.status}`);
  const blob = await res.blob();
  const name = sample.src.split('/').pop();
  return new File([blob], name, { type: blob.type || 'image/png' });
}

// Hover-triggered popover that shows the system instructions for one or more
// agents. Fetches /agents/instructions on first use and caches the result.
let _agentInstructionsPromise = null;
function loadAgentInstructions() {
  if (!_agentInstructionsPromise) {
    _agentInstructionsPromise = fetch('/notice/agents/instructions')
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
  }
  return _agentInstructionsPromise;
}

function mountAgentInstructionsPanel(hostId, agentIds) {
  const host = document.getElementById(hostId);
  if (!host || !Array.isArray(agentIds) || agentIds.length === 0) return;
  host.classList.add('agent-info-wrapper');
  host.innerHTML = `
    <span class="agent-info-trigger" tabindex="0" role="button" aria-haspopup="true">ℹ Agent Instructions</span>
    <div class="agent-info-popover" role="dialog" aria-label="Agent instructions">
      <div class="agent-info-title">Agent Instructions</div>
      <div class="agent-info-hint">System prompts used by the agents on this page.</div>
      <div class="agent-info-body"><div class="empty">Loading...</div></div>
    </div>`;

  const trigger = host.querySelector('.agent-info-trigger');
  const popover = host.querySelector('.agent-info-popover');
  const body = host.querySelector('.agent-info-body');
  let closeTimer = null;
  let loaded = false;
  const open = async () => {
    clearTimeout(closeTimer);
    popover.classList.add('open');
    if (!loaded) {
      const map = await loadAgentInstructions();
      body.innerHTML = agentIds.map(id => {
        const text = map[id];
        if (!text) return `<div class="agent-info-block"><div class="agent-info-name">${esc(id)}</div><div class="empty">Instructions not available.</div></div>`;
        return `<div class="agent-info-block"><div class="agent-info-name">${esc(id)}</div><div class="agent-info-instructions">${esc(text)}</div></div>`;
      }).join('');
      loaded = true;
    }
  };
  const scheduleClose = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => popover.classList.remove('open'), 200); };
  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('focus', open);
  trigger.addEventListener('mouseleave', scheduleClose);
  trigger.addEventListener('blur', scheduleClose);
  popover.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  popover.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') popover.classList.remove('open'); });
}

// Markdown rendering powered by marked + DOMPurify (loaded via CDN in pages that need it).
function renderMarkdown(md) {
  if (md == null || md === '') return '<div class="empty">No content.</div>';
  const src = String(md);
  if (typeof window.marked !== 'undefined') {
    try {
      window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
      const html = window.marked.parse(src);
      return typeof window.DOMPurify !== 'undefined' ? window.DOMPurify.sanitize(html) : html;
    } catch (e) {
      return `<pre>${esc(src)}</pre>`;
    }
  }
  // Fallback: show raw markdown if the library failed to load.
  return `<pre>${esc(src)}</pre>`;
}

// Tracks the currently chosen file/sample as a previewable image URL for side-by-side display.
function setupDocPreview({ fileInputId, previewIds }) {
  const ids = Array.isArray(previewIds) ? previewIds : [previewIds];
  let currentUrl = null;
  let currentObjectUrl = null;
  const renderEmpty = () => ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="empty">No document selected.</div>';
  });
  const renderImage = (url, alt) => ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<img src="${esc(url)}" alt="${esc(alt || 'document preview')}" />`;
  });
  const renderUnsupported = (name) => ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="empty">Preview unavailable for <strong>${esc(name)}</strong></div>`;
  });
  renderEmpty();
  const fileInput = document.getElementById(fileInputId);
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      const f = fileInput.files[0];
      if (!f) { currentUrl = null; renderEmpty(); return; }
      if (/^image\//.test(f.type)) {
        currentObjectUrl = URL.createObjectURL(f);
        currentUrl = currentObjectUrl;
        renderImage(currentUrl, f.name);
      } else {
        currentUrl = null;
        renderUnsupported(f.name);
      }
    });
  }
  return {
    setSample(s) {
      if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      currentUrl = s.src;
      renderImage(s.src, s.label);
    },
    clear() {
      if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      currentUrl = null;
      renderEmpty();
    }
  };
}

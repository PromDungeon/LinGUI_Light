/**
 * Text Recolor — popup script
 */

const patternListEl  = document.getElementById('patternList');
const emptyStateEl   = document.getElementById('emptyState');
const masterToggleEl = document.getElementById('masterToggle');
const addFormEl      = document.getElementById('addForm');
const patternInputEl = document.getElementById('patternInput');
const caseSensEl     = document.getElementById('caseSensitive');
const wholeWordEl    = document.getElementById('wholeWord');

// ─── custom colour picker (replaces <input type="color"> to avoid browser crash) ──

const clrSwatchBtn = document.getElementById('clrSwatchBtn');
const clrPanel     = document.getElementById('clrPanel');
const clrSL        = document.getElementById('clrSL');
const clrCursor    = document.getElementById('clrCursor');
const clrHueEl     = document.getElementById('clrHue');
const clrPreviewEl = document.getElementById('clrPreview');
const clrHexEl     = document.getElementById('clrHex');

// Internal state: HSV colour model
let cpH = 0, cpS = 100, cpV = 100;

// ── colour math ────────────────────────────────────────────────────────────────

function hsvToHex(h, s, v) {
  s /= 100; v /= 100;
  const f = (n, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return '#' + [f(5), f(3), f(1)]
    .map(x => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('');
}

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 };
}

// ── picker rendering ───────────────────────────────────────────────────────────

function cpRender() {
  const hex = hsvToHex(cpH, cpS, cpV);
  clrSL.style.backgroundColor  = `hsl(${cpH},100%,50%)`;
  clrCursor.style.left          = cpS + '%';
  clrCursor.style.top           = (100 - cpV) + '%';
  clrHueEl.value                = Math.round(cpH);
  clrPreviewEl.style.background = hex;
  clrSwatchBtn.style.background = hex;
  if (document.activeElement !== clrHexEl) clrHexEl.value = hex;
}

function cpSetHex(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  ({ h: cpH, s: cpS, v: cpV } = hexToHsv(hex));
  cpRender();
}

// ── picker events ──────────────────────────────────────────────────────────────

// Toggle the panel open/closed
clrSwatchBtn.addEventListener('click', () => {
  clrPanel.toggleAttribute('hidden');
});

// Hue slider
clrHueEl.addEventListener('input', () => {
  cpH = +clrHueEl.value;
  cpRender();
});

// Hex text input
clrHexEl.addEventListener('input', () => {
  const val = clrHexEl.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    ({ h: cpH, s: cpS, v: cpV } = hexToHsv(val));
    // Update visuals without overwriting the hex input
    clrSL.style.backgroundColor  = `hsl(${cpH},100%,50%)`;
    clrCursor.style.left          = cpS + '%';
    clrCursor.style.top           = (100 - cpV) + '%';
    clrHueEl.value                = Math.round(cpH);
    clrPreviewEl.style.background = val;
    clrSwatchBtn.style.background = val;
  }
});

clrHexEl.addEventListener('blur', () => {
  if (!/^#[0-9a-fA-F]{6}$/.test(clrHexEl.value.trim())) {
    clrHexEl.value = hsvToHex(cpH, cpS, cpV);
  }
});

// SL gradient drag
function onSLPointer(e) {
  const rect = clrSL.getBoundingClientRect();
  cpS = Math.max(0, Math.min(100, ((e.clientX - rect.left)  / rect.width)  * 100));
  cpV = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100));
  cpRender();
}

clrSL.addEventListener('mousedown', e => {
  e.preventDefault();
  onSLPointer(e);
  const move = e2 => onSLPointer(e2);
  const up   = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup',   up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup',   up);
});

// Initialise picker to the default colour
cpSetHex('#ff4d4d');

// ─── state ────────────────────────────────────────────────────────────────────

let patterns = [];
let enabled  = true;

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── storage helpers ──────────────────────────────────────────────────────────

function save() {
  browser.storage.local.set({ patterns, enabled });
}

// ─── render ───────────────────────────────────────────────────────────────────

function renderPatterns() {
  patternListEl.innerHTML = '';

  if (!patterns.length) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  for (const p of patterns) {
    const row = document.createElement('div');
    row.className  = 'pattern-row';
    row.dataset.id = p.id;

    const swatch = document.createElement('span');
    swatch.className        = 'swatch';
    swatch.style.background = p.color;

    const label = document.createElement('span');
    label.className   = 'pattern-text';
    label.textContent = p.text;
    label.style.color = p.color;

    const tags = document.createElement('span');
    tags.className = 'pattern-tags';
    if (p.caseSensitive) {
      const t = document.createElement('span');
      t.className = 'tag'; t.textContent = 'Aa'; t.title = 'Case sensitive';
      tags.appendChild(t);
    }
    if (p.wholeWord) {
      const t = document.createElement('span');
      t.className = 'tag'; t.textContent = '\\b'; t.title = 'Whole word';
      tags.appendChild(t);
    }

    const del = document.createElement('button');
    del.className   = 'btn-delete';
    del.title       = 'Remove';
    del.textContent = '×';
    del.dataset.id  = p.id;
    del.addEventListener('click', onDelete);

    row.append(swatch, label, tags, del);
    patternListEl.appendChild(row);
  }
}

// ─── event handlers ───────────────────────────────────────────────────────────

masterToggleEl.addEventListener('change', () => {
  enabled = masterToggleEl.checked;
  save();
});

addFormEl.addEventListener('submit', e => {
  e.preventDefault();

  const text = patternInputEl.value.trim();
  if (!text) return;

  patterns.push({
    id:            nextId(),
    text,
    color:         hsvToHex(cpH, cpS, cpV),
    caseSensitive: caseSensEl.checked,
    wholeWord:     wholeWordEl.checked
  });

  save();
  renderPatterns();

  patternInputEl.value = '';
  caseSensEl.checked   = false;
  wholeWordEl.checked  = false;
  clrPanel.setAttribute('hidden', '');
  patternInputEl.focus();
});

function onDelete(e) {
  const id = e.currentTarget.dataset.id;
  patterns = patterns.filter(p => p.id !== id);
  save();
  renderPatterns();
}

// ─── init ─────────────────────────────────────────────────────────────────────

browser.storage.local.get({ patterns: [], enabled: true }).then(data => {
  patterns = data.patterns;
  enabled  = data.enabled;
  masterToggleEl.checked = enabled;
  renderPatterns();
  patternInputEl.focus();
});

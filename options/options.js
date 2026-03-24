/**
 * Text Recolor — options page script
 */

// ─── element refs ─────────────────────────────────────────────────────────────

const masterToggleEl = document.getElementById('masterToggle');
const patternBodyEl  = document.getElementById('patternBody');
const patternCountEl = document.getElementById('patternCount');
const emptyStateEl   = document.getElementById('emptyState');
const formTitleEl    = document.getElementById('formTitle');
const patternFormEl  = document.getElementById('patternForm');
const editIdEl       = document.getElementById('editId');
const patternInputEl = document.getElementById('patternInput');
const caseSensEl     = document.getElementById('caseSensitive');
const wholeWordEl    = document.getElementById('wholeWord');
const formPreviewEl  = document.getElementById('formPreview');
const submitBtnEl    = document.getElementById('submitBtn');
const cancelBtnEl    = document.getElementById('cancelBtn');
const exportBtnEl    = document.getElementById('exportBtn');
const importFileEl   = document.getElementById('importFile');
const ioStatusEl     = document.getElementById('ioStatus');
const toastEl        = document.getElementById('toast');

// ─── custom colour picker (replaces <input type="color"> to avoid browser crash) ──

const clrSL        = document.getElementById('clrSL');
const clrCursor    = document.getElementById('clrCursor');
const clrHueEl     = document.getElementById('clrHue');
const clrPreviewEl = document.getElementById('clrPreview');
const colorHexEl   = document.getElementById('colorHex');  // hex text input

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
  if (document.activeElement !== colorHexEl) colorHexEl.value = hex;
}

function cpSetHex(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  ({ h: cpH, s: cpS, v: cpV } = hexToHsv(hex));
  cpRender();
  updatePreview();
}

function cpGetHex() {
  return hsvToHex(cpH, cpS, cpV);
}

// ── picker events ──────────────────────────────────────────────────────────────

// Hue slider
clrHueEl.addEventListener('input', () => {
  cpH = +clrHueEl.value;
  cpRender();
  updatePreview();
});

// Hex text input
colorHexEl.addEventListener('input', () => {
  const val = colorHexEl.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    ({ h: cpH, s: cpS, v: cpV } = hexToHsv(val));
    clrSL.style.backgroundColor  = `hsl(${cpH},100%,50%)`;
    clrCursor.style.left          = cpS + '%';
    clrCursor.style.top           = (100 - cpV) + '%';
    clrHueEl.value                = Math.round(cpH);
    clrPreviewEl.style.background = val;
    updatePreview();
  }
});

colorHexEl.addEventListener('blur', () => {
  if (!/^#[0-9a-fA-F]{6}$/.test(colorHexEl.value.trim())) {
    colorHexEl.value = cpGetHex();
  }
});

// SL gradient drag
function onSLPointer(e) {
  const rect = clrSL.getBoundingClientRect();
  cpS = Math.max(0, Math.min(100, ((e.clientX - rect.left)  / rect.width)  * 100));
  cpV = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100));
  cpRender();
  updatePreview();
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

// ─── state ────────────────────────────────────────────────────────────────────

let patterns = [];
let enabled  = true;

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── storage ──────────────────────────────────────────────────────────────────

function save() {
  return browser.storage.local.set({ patterns, enabled });
}

// ─── toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ─── live preview ─────────────────────────────────────────────────────────────

function updatePreview() {
  const color = cpGetHex();
  const text  = patternInputEl.value.trim() || 'sample text';
  formPreviewEl.textContent = text;
  formPreviewEl.style.color = color;
}

// ─── render ───────────────────────────────────────────────────────────────────

function renderTable() {
  patternCountEl.textContent = patterns.length;
  patternBodyEl.innerHTML    = '';

  if (!patterns.length) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  for (const p of patterns) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;

    // color
    const tdColor = document.createElement('td');
    tdColor.innerHTML = `
      <div class="swatch-cell">
        <span class="swatch" style="background:${p.color}"></span>
        <span class="color-code">${p.color}</span>
      </div>`;

    // pattern text
    const tdText = document.createElement('td');
    tdText.className   = 'pattern-cell';
    tdText.textContent = p.text;

    // preview
    const tdPreview = document.createElement('td');
    tdPreview.className        = 'preview-cell';
    tdPreview.textContent      = p.text;
    tdPreview.style.color      = p.color;
    tdPreview.style.fontWeight = '600';

    // flags
    const tdFlags = document.createElement('td');
    const chips   = [];
    if (p.caseSensitive) chips.push('<span class="chip" title="Case sensitive">Aa</span>');
    if (p.wholeWord)     chips.push('<span class="chip" title="Whole word">\\b</span>');
    tdFlags.innerHTML = `<div class="flag-chips">${chips.join('')}</div>`;

    // actions
    const tdActions = document.createElement('td');
    const editBtn   = document.createElement('button');
    editBtn.className   = 'btn-icon';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startEdit(p.id));

    const delBtn = document.createElement('button');
    delBtn.className   = 'btn-icon danger';
    delBtn.textContent = 'Remove';
    delBtn.addEventListener('click', () => deletePattern(p.id));

    const actWrap = document.createElement('div');
    actWrap.className = 'row-actions';
    actWrap.append(editBtn, delBtn);
    tdActions.appendChild(actWrap);

    tr.append(tdColor, tdText, tdPreview, tdFlags, tdActions);
    patternBodyEl.appendChild(tr);
  }
}

// ─── form helpers ─────────────────────────────────────────────────────────────

function resetForm() {
  editIdEl.value        = '';
  patternInputEl.value  = '';
  caseSensEl.checked    = false;
  wholeWordEl.checked   = false;
  formTitleEl.textContent   = 'Add pattern';
  submitBtnEl.textContent   = 'Add pattern';
  cancelBtnEl.style.display = 'none';
  cpSetHex('#ff4d4d');
}

function startEdit(id) {
  const p = patterns.find(x => x.id === id);
  if (!p) return;

  editIdEl.value       = p.id;
  patternInputEl.value = p.text;
  caseSensEl.checked   = p.caseSensitive;
  wholeWordEl.checked  = p.wholeWord;
  formTitleEl.textContent   = 'Edit pattern';
  submitBtnEl.textContent   = 'Save changes';
  cancelBtnEl.style.display = '';
  cpSetHex(p.color);

  patternFormEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  patternInputEl.focus();
}

function deletePattern(id) {
  patterns = patterns.filter(p => p.id !== id);
  save();
  renderTable();
  showToast('Pattern removed.');
}

// ─── form submit ──────────────────────────────────────────────────────────────

patternInputEl.addEventListener('input', updatePreview);

patternFormEl.addEventListener('submit', e => {
  e.preventDefault();

  const text  = patternInputEl.value.trim();
  const color = cpGetHex();
  if (!text) return;

  const id = editIdEl.value;

  if (id) {
    const idx = patterns.findIndex(p => p.id === id);
    if (idx !== -1) {
      patterns[idx] = { id, text, color, caseSensitive: caseSensEl.checked, wholeWord: wholeWordEl.checked };
    }
    showToast('Pattern updated.');
  } else {
    patterns.push({ id: nextId(), text, color, caseSensitive: caseSensEl.checked, wholeWord: wholeWordEl.checked });
    showToast('Pattern added.');
  }

  save();
  renderTable();
  resetForm();
});

cancelBtnEl.addEventListener('click', resetForm);

// ─── master toggle ────────────────────────────────────────────────────────────

masterToggleEl.addEventListener('change', () => {
  enabled = masterToggleEl.checked;
  save();
  showToast(enabled ? 'Text Recolor enabled.' : 'Text Recolor disabled.');
});

// ─── export ───────────────────────────────────────────────────────────────────

exportBtnEl.addEventListener('click', () => {
  const data   = JSON.stringify({ version: 1, patterns }, null, 2);
  const blob   = new Blob([data], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = 'text-recolor-patterns.json';
  anchor.click();
  URL.revokeObjectURL(url);
  setIoStatus('Exported successfully.', 'success');
});

// ─── import ───────────────────────────────────────────────────────────────────

importFileEl.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed   = JSON.parse(ev.target.result);
      const incoming = Array.isArray(parsed) ? parsed : (parsed.patterns ?? []);

      const valid = incoming.filter(p =>
        typeof p.text === 'string' && p.text.length > 0 &&
        typeof p.color === 'string'
      ).map(p => ({
        id:            p.id ?? nextId(),
        text:          p.text,
        color:         p.color,
        caseSensitive: !!p.caseSensitive,
        wholeWord:     !!p.wholeWord
      }));

      if (!valid.length) throw new Error('No valid patterns found.');

      let added = 0;
      for (const p of valid) {
        const exists = patterns.some(x => x.text === p.text && x.color === p.color);
        if (!exists) { patterns.push(p); added++; }
      }

      save();
      renderTable();
      setIoStatus(`Imported ${added} pattern${added !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      setIoStatus(`Import failed: ${err.message}`, 'error');
    }
    importFileEl.value = '';
  };
  reader.readAsText(file);
});

function setIoStatus(msg, type = '') {
  ioStatusEl.textContent = msg;
  ioStatusEl.className   = `io-status ${type}`;
}

// ─── theme ────────────────────────────────────────────────────────────────────

const themeBtnEl = document.getElementById('themeToggle');
const THEME_KEY  = 'foxdye-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtnEl.textContent = theme === 'light' ? '☾' : '☀';
  themeBtnEl.title       = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

themeBtnEl.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ─── init ─────────────────────────────────────────────────────────────────────

browser.storage.local.get({ patterns: [], enabled: true }).then(data => {
  patterns = data.patterns;
  enabled  = data.enabled;
  masterToggleEl.checked = enabled;
  renderTable();
  cpSetHex('#ff4d4d');
});

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
const isRegexEl      = document.getElementById('isRegex');
const submitBtnEl    = document.getElementById('submitBtn');
const cancelEditEl   = document.getElementById('cancelEditBtn');
const folderSelectEl = document.getElementById('folderSelect');

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

// ── palette swatches (shared module: common/palettes.js) ──────────────────────

const paletteUI = initPaletteUI({
  selectEl:   document.getElementById('palSelect'),
  swatchesEl: document.getElementById('palSwatches'),
  onPick:     hex => cpSetHex(hex)
});
paletteUI.refresh();

// ─── state ────────────────────────────────────────────────────────────────────

let patterns     = [];
let folders      = [];
let siteRules    = [];
let enabled      = true;
let editingId    = null;   // id of the pattern loaded into the form, or null when adding
let currentHost  = null;   // hostname of the active tab, when reachable
let currentTabId = null;
let matchCounts  = null;   // { patternId: n } from the content script, or null
let scope        = 'global';   // 'global' | 'site' — what the folder toggles edit

// remembered collapsed folder sections
const COLLAPSE_KEY = 'foxdye-collapsed';
const collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
function saveCollapsed() {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
}

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── storage helpers ──────────────────────────────────────────────────────────

function save() {
  browser.storage.local.set({ patterns, enabled, folders, siteRules });
  scheduleCountRefresh();
}

// ─── active tab, scope switcher & match counts ────────────────────────────────

const siteBarEl     = document.getElementById('siteBar');
const scopeGlobalEl = document.getElementById('scopeGlobal');
const scopeSiteEl   = document.getElementById('scopeSite');
const ruleResetEl   = document.getElementById('ruleReset');

/** The rule saved for exactly this host (editing always targets this). */
function exactRule() {
  return siteRules.find(r => r.host === currentHost) ?? null;
}

/** Folder ids considered "on" in the current scope. */
function effectiveFolderSet() {
  if (scope === 'site' && currentHost) {
    return activeFolderIds(currentHost, folders, siteRules);
  }
  return new Set(folders.filter(f => f.enabled !== false).map(f => f.id));
}

function setScope(next) {
  scope = next;
  scopeGlobalEl.classList.toggle('active', scope === 'global');
  scopeSiteEl.classList.toggle('active', scope === 'site');
  ruleResetEl.hidden = !(scope === 'site' && exactRule());
  renderPatterns();
}

scopeGlobalEl.addEventListener('click', () => setScope('global'));
scopeSiteEl.addEventListener('click', () => setScope('site'));

ruleResetEl.addEventListener('click', () => {
  siteRules = siteRules.filter(r => r.host !== currentHost);
  save();
  setScope('site');
});

/** Toggle a folder in the current scope. */
function toggleFolder(folderId) {
  if (scope === 'site' && currentHost) {
    let rule = exactRule();
    if (!rule) {
      // First site-specific change: seed a rule from what runs here today
      rule = { host: currentHost, folders: [...activeFolderIds(currentHost, folders, siteRules)] };
      siteRules.push(rule);
    }
    rule.folders = rule.folders.includes(folderId)
      ? rule.folders.filter(id => id !== folderId)
      : [...rule.folders, folderId];
  } else {
    const f = folders.find(x => x.id === folderId);
    if (f) f.enabled = f.enabled === false;
  }
  ruleResetEl.hidden = !(scope === 'site' && exactRule());
  save();
  renderPatterns();
}

function fetchStatus() {
  if (currentTabId === null) return;
  browser.tabs.sendMessage(currentTabId, { type: 'tr-status' }).then(res => {
    matchCounts = res?.counts ?? null;
    renderPatterns();
  }).catch(() => {
    // No content script on this page (about:, addons pages, …)
    matchCounts = null;
  });
}

let countTimer = null;
function scheduleCountRefresh() {
  // Give the content script a moment to reapply after a storage change
  clearTimeout(countTimer);
  countTimer = setTimeout(fetchStatus, 400);
}

browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  const tab = tabs[0];
  if (!tab?.url || !/^https?:/.test(tab.url)) return;

  currentTabId = tab.id;
  currentHost  = new URL(tab.url).hostname;

  scopeSiteEl.textContent = currentHost;
  siteBarEl.hidden        = false;
  ruleResetEl.hidden      = !(scope === 'site' && exactRule());

  fetchStatus();
}).catch(() => {});

// ─── render ───────────────────────────────────────────────────────────────────

function buildPatternRow(p) {
  const isOn = p.enabled !== false;

  const row = document.createElement('div');
  row.className  = 'pattern-row' + (isOn ? '' : ' row-off');
  row.dataset.id = p.id;

  const led = document.createElement('button');
  led.className  = 'mini-toggle' + (isOn ? ' on' : '');
  led.title      = isOn ? 'Pattern is on — click to pause' : 'Pattern is paused — click to enable';
  led.setAttribute('aria-label', led.title);
  led.setAttribute('aria-pressed', String(isOn));
  led.dataset.id = p.id;
  led.addEventListener('click', onToggleEnabled);

  const swatch = document.createElement('span');
  swatch.className        = 'swatch';
  swatch.style.background = p.color;

  const label = document.createElement('span');
  label.className   = 'pattern-text';
  label.textContent = p.text;
  label.style.color = p.color;

  const count = document.createElement('span');
  count.className = 'count-chip';
  if (matchCounts && isOn) {
    const n = matchCounts[p.id] ?? 0;
    count.textContent = n;
    count.title = `${n} match${n === 1 ? '' : 'es'} on this page`;
    if (n === 0) count.classList.add('zero');
  } else {
    count.hidden = true;
  }

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
  if (p.isRegex) {
    const t = document.createElement('span');
    t.className = 'tag'; t.textContent = '.*'; t.title = 'Regular expression';
    tags.appendChild(t);
  }

  const edit = document.createElement('button');
  edit.className   = 'btn-edit';
  edit.title       = 'Edit';
  edit.textContent = '✎';
  edit.dataset.id  = p.id;
  edit.addEventListener('click', onEdit);

  const del = document.createElement('button');
  del.className   = 'btn-delete';
  del.title       = 'Remove';
  del.textContent = '×';
  del.dataset.id  = p.id;
  del.addEventListener('click', onDelete);

  row.append(led, swatch, label, count, tags, edit, del);
  return row;
}

function renderPatterns() {
  patternListEl.innerHTML = '';

  if (!patterns.length) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  const activeSet  = effectiveFolderSet();
  const siteScoped = scope === 'site' && currentHost;

  for (const f of folders) {
    const pats = patterns.filter(p => p.folderId === f.id);
    if (!pats.length) continue;   // empty folders are managed on the options page

    const folderOn    = activeSet.has(f.id);
    const isCollapsed = collapsed.has(f.id);

    const section = document.createElement('div');
    section.className = 'folder-section' + (folderOn ? '' : ' folder-off');

    const head = document.createElement('div');
    head.className = 'folder-head';

    const caret = document.createElement('button');
    caret.className   = 'folder-caret';
    caret.textContent = isCollapsed ? '▸' : '▾';
    caret.title       = isCollapsed ? 'Expand folder' : 'Collapse folder';
    caret.addEventListener('click', () => {
      collapsed.has(f.id) ? collapsed.delete(f.id) : collapsed.add(f.id);
      saveCollapsed();
      renderPatterns();
    });

    const name = document.createElement('span');
    name.className   = 'folder-name';
    name.textContent = f.name;

    const count = document.createElement('span');
    count.className = 'count-chip';
    if (matchCounts && folderOn) {
      const total = pats.reduce((sum, p) => sum + (matchCounts[p.id] ?? 0), 0);
      count.textContent = total;
      count.title = `${total} match${total === 1 ? '' : 'es'} on this page`;
      if (total === 0) count.classList.add('zero');
    } else {
      count.hidden = true;
    }

    const toggle = document.createElement('button');
    toggle.className = 'mini-toggle' + (folderOn ? ' on' : '');
    toggle.title = siteScoped
      ? (folderOn ? `"${f.name}" runs on ${currentHost} — click to exclude`
                  : `"${f.name}" is off on ${currentHost} — click to include`)
      : (folderOn ? `"${f.name}" is on by default — click to pause everywhere`
                  : `"${f.name}" is paused everywhere — click to enable`);
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-pressed', String(folderOn));
    toggle.addEventListener('click', () => toggleFolder(f.id));

    head.append(caret, name, count, toggle);
    section.appendChild(head);

    if (!isCollapsed) {
      const body = document.createElement('div');
      body.className = 'folder-body';
      for (const p of pats) body.appendChild(buildPatternRow(p));
      section.appendChild(body);
    }

    patternListEl.appendChild(section);
  }
}

function onToggleEnabled(e) {
  const p = patterns.find(x => x.id === e.currentTarget.dataset.id);
  if (!p) return;
  p.enabled = p.enabled === false;
  save();
  renderPatterns();
}

// ─── event handlers ───────────────────────────────────────────────────────────

masterToggleEl.addEventListener('change', () => {
  enabled = masterToggleEl.checked;
  save();
});

// Whole-word doesn't apply to regex patterns (write your own \b)
isRegexEl.addEventListener('change', () => {
  wholeWordEl.disabled = isRegexEl.checked;
  if (isRegexEl.checked) wholeWordEl.checked = false;
});

// Clear any "invalid regex" error as soon as the pattern is edited
patternInputEl.addEventListener('input', () => {
  patternInputEl.setCustomValidity('');
});

addFormEl.addEventListener('submit', e => {
  e.preventDefault();

  const text = patternInputEl.value.trim();
  if (!text) return;

  if (isRegexEl.checked) {
    try {
      new RegExp(text);
    } catch (err) {
      patternInputEl.setCustomValidity(`Invalid regex: ${err.message}`);
      patternInputEl.reportValidity();
      return;
    }
  }

  const entry = {
    id:            editingId ?? nextId(),
    text,
    color:         hsvToHex(cpH, cpS, cpV),
    caseSensitive: caseSensEl.checked,
    wholeWord:     wholeWordEl.checked,
    isRegex:       isRegexEl.checked,
    enabled:       true,
    folderId:      folderSelectEl.value || GENERAL_FOLDER_ID
  };

  if (editingId) {
    const idx = patterns.findIndex(p => p.id === editingId);
    if (idx !== -1) {
      entry.enabled = patterns[idx].enabled !== false;  // editing keeps pause state
      patterns[idx] = entry;
    }
  } else {
    patterns.push(entry);
  }

  save();
  renderPatterns();
  resetForm();
});

function resetForm() {
  editingId            = null;
  patternInputEl.value = '';
  caseSensEl.checked   = false;
  wholeWordEl.checked  = true;   // whole word is the default; opt out per pattern
  isRegexEl.checked    = false;
  wholeWordEl.disabled = false;
  submitBtnEl.textContent = 'Add pattern';
  cancelEditEl.hidden  = true;
  clrPanel.setAttribute('hidden', '');
  patternInputEl.setCustomValidity('');
  patternInputEl.focus();
}

function onEdit(e) {
  const p = patterns.find(x => x.id === e.currentTarget.dataset.id);
  if (!p) return;

  editingId            = p.id;
  patternInputEl.value = p.text;
  caseSensEl.checked   = p.caseSensitive;
  wholeWordEl.checked  = p.wholeWord;
  isRegexEl.checked    = !!p.isRegex;
  wholeWordEl.disabled = !!p.isRegex;
  folderSelectEl.value = p.folderId ?? GENERAL_FOLDER_ID;
  cpSetHex(p.color);
  submitBtnEl.textContent = 'Save changes';
  cancelEditEl.hidden  = false;
  patternInputEl.focus();
}

cancelEditEl.addEventListener('click', resetForm);

function onDelete(e) {
  const id = e.currentTarget.dataset.id;
  patterns = patterns.filter(p => p.id !== id);
  if (editingId === id) resetForm();
  save();
  renderPatterns();
}

// ─── preferences shortcut ─────────────────────────────────────────────────────

document.getElementById('prefsBtn').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
  window.close();
});

// ─── theme ────────────────────────────────────────────────────────────────────

const themeBtnEl  = document.getElementById('themeToggle');
const THEME_KEY   = 'foxdye-theme';

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

function renderFolderSelect() {
  const prev = folderSelectEl.value;
  folderSelectEl.innerHTML = '';
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    folderSelectEl.appendChild(opt);
  }
  if (folders.some(f => f.id === prev)) folderSelectEl.value = prev;
}

browser.storage.local.get({
  patterns: [], enabled: true, folders: null, siteRules: null, disabledSites: []
}).then(data => {
  ensureSchema(data);   // normalize locally; background persists the migration
  patterns  = data.patterns;
  folders   = data.folders;
  siteRules = data.siteRules;
  enabled   = data.enabled;
  masterToggleEl.checked = enabled;
  ruleResetEl.hidden = !(scope === 'site' && exactRule());
  renderFolderSelect();
  renderPatterns();
  patternInputEl.focus();
});

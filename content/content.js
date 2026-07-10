/**
 * Text Recolor — content script
 *
 * Walks all text nodes in the page, finds matches for user-defined
 * patterns, and wraps them in <span> elements with the assigned color.
 * Only the text color is changed; no layout or other styling is touched.
 */

const ATTR      = 'data-tr-id';   // attribute placed on every injected span
const WRAP_TAG  = 'span';

// Tags whose text content should never be touched
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME',
  'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'SVG', 'MATH'
]);

// model helpers (activeFolderIds, ensureSchema, …) come from common/model.js,
// which the manifest loads before this file.

let patterns    = [];   // [{ id, text, color, caseSensitive, wholeWord, isRegex, enabled, folderId }]
let folders     = [];   // [{ id, name, enabled }]
let siteRules   = [];   // [{ host, folders: [folderId, ...] }]
let enabled     = true;
let mutObserver = null;
let processing  = false;

/** Patterns that should run on this page: enabled, and in an active folder. */
function activePatterns() {
  const activeSet = activeFolderIds(location.hostname, folders, siteRules);
  return patterns.filter(p => p.enabled !== false && activeSet.has(p.folderId));
}

/** Should we be recoloring on this page right now? */
function isActive() {
  return enabled && activePatterns().length > 0;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Build an array of { regex, color } objects, one per active pattern. */
function buildPatternRegexes(patternList) {
  return patternList
    .filter(p => p.text && p.text.length > 0 && p.enabled !== false)
    .map(p => {
      // Regex patterns are compiled as-is; whole-word only applies to
      // literal patterns (regex authors write their own \b).
      let src = p.isRegex ? p.text : escapeRegex(p.text);
      if (p.wholeWord && !p.isRegex) src = `\\b${src}\\b`;
      const flags = p.caseSensitive ? 'g' : 'gi';
      try {
        return { regex: new RegExp(src, flags), color: p.color, id: p.id };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ─── DOM processing ───────────────────────────────────────────────────────────

/**
 * Given plain text, return an HTML string with all pattern matches wrapped,
 * or null if nothing matched (so we can skip DOM surgery).
 */
function buildReplacedHtml(text, patternRegexes) {
  // Collect all non-overlapping matches, sorted by start position.
  const matches = [];

  for (const { regex, color, id } of patternRegexes) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      // A regex like \d* can match the empty string; skip it and advance
      // manually or exec() would loop forever on the same position.
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({
        start: m.index,
        end:   m.index + m[0].length,
        color,
        id,
        raw:   m[0]
      });
    }
  }

  if (!matches.length) return null;

  // Sort; resolve overlaps by keeping the first match (earliest start wins,
  // longer match wins on ties).
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start >= cursor) {
      kept.push(m);
      cursor = m.end;
    }
  }

  // Build the output HTML string
  let html = '';
  let pos   = 0;
  for (const m of kept) {
    html += escapeHtml(text.slice(pos, m.start));
    html += `<${WRAP_TAG} ${ATTR}="${m.id}" style="color:${m.color} !important;background:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;">${escapeHtml(m.raw)}</${WRAP_TAG}>`;
    pos   = m.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/** Replace a single text node with the recolored equivalent. */
function processTextNode(node, patternRegexes) {
  const text = node.textContent;
  if (!text.trim()) return;

  const html = buildReplacedHtml(text, patternRegexes);
  if (html === null) return;

  const wrapper = document.createElement(WRAP_TAG);
  wrapper.innerHTML = html;

  // Move all children out of the wrapper and insert them before the text node,
  // then remove the text node — this way we avoid adding an extra wrapper element.
  const parent = node.parentNode;
  const frag   = document.createDocumentFragment();
  while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
  parent.replaceChild(frag, node);
}

/** Walk a subtree collecting text nodes that are eligible for processing. */
function collectTextNodes(root) {
  const results = [];
  const walker  = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;

        // Skip inside tags we never touch
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;

        // Skip inside contenteditable elements — modifying them resets the cursor
        if (el.closest('[contenteditable]')) return NodeFilter.FILTER_REJECT;

        // Skip inside spans we already injected
        if (el.closest(`[${ATTR}]`)) return NodeFilter.FILTER_REJECT;

        // Skip empty/whitespace-only nodes
        if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let n;
  while ((n = walker.nextNode())) results.push(n);
  return results;
}

/** Remove every span we previously injected (restores original text nodes). */
function unwrapAll() {
  // querySelectorAll returns a static list, so we can mutate the DOM freely.
  const spans = document.querySelectorAll(`[${ATTR}]`);
  spans.forEach(span => {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent), span);
  });
  // Merge adjacent text nodes created by the unwrapping
  document.body && document.body.normalize();
}

/**
 * Count the matches a user can actually see: injected spans that have a
 * rendered box. Wrapped matches inside display:none menus, templates, etc.
 * are excluded — Cmd+F wouldn't find those either.
 */
function spanIsVisible(span) {
  // checkVisibility covers display:none AND visibility:hidden (Firefox 106+);
  // getClientRects is the fallback and still catches display:none.
  if (typeof span.checkVisibility === 'function') {
    return span.checkVisibility({ checkVisibilityCSS: true });
  }
  return span.getClientRects().length > 0;
}

function computeVisibleCounts() {
  const counts = {};
  for (const span of document.querySelectorAll(`[${ATTR}]`)) {
    if (!spanIsVisible(span)) continue;
    const id = span.getAttribute(ATTR);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Apply all active patterns to a subtree (defaults to document.body). */
function applyPatterns(root = document.body) {
  if (!root || !isActive()) return;

  const patternRegexes = buildPatternRegexes(activePatterns());
  if (!patternRegexes.length) return;

  const nodes = collectTextNodes(root);
  for (const node of nodes) {
    processTextNode(node, patternRegexes);
  }
}

/** Unwrap then re-apply — called when patterns change. */
function reapply() {
  unwrapAll();
  if (isActive()) applyPatterns();
}

// ─── mutation observer ────────────────────────────────────────────────────────

function startObserver() {
  if (mutObserver) return;

  mutObserver = new MutationObserver(mutations => {
    if (processing || !isActive()) return;
    processing = true;

    for (const { addedNodes, target } of mutations) {
      // Skip mutations inside contenteditable elements — reprocessing them resets the cursor
      if (target.closest && target.closest('[contenteditable]')) continue;
      for (const node of addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Don't reprocess subtrees we already own
          if (!node.closest(`[${ATTR}]`)) applyPatterns(node);
        }
      }
    }

    processing = false;
  });

  mutObserver.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (mutObserver) {
    mutObserver.disconnect();
    mutObserver = null;
  }
}

// ─── storage & messaging ──────────────────────────────────────────────────────

function loadAndApply() {
  browser.storage.local.get({
    patterns: [], enabled: true, folders: null, siteRules: null, disabledSites: []
  }).then(data => {
    ensureSchema(data);   // normalize locally; background persists the migration
    patterns  = data.patterns;
    folders   = data.folders;
    siteRules = data.siteRules;
    enabled   = data.enabled;

    if (isActive()) {
      applyPatterns();
      startObserver();
    }
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.patterns)  patterns  = changes.patterns.newValue  ?? [];
  if (changes.enabled)   enabled   = changes.enabled.newValue   ?? true;
  if (changes.folders)   folders   = changes.folders.newValue   ?? [];
  if (changes.siteRules) siteRules = changes.siteRules.newValue ?? [];

  stopObserver();
  reapply();
  if (isActive()) startObserver();
});

// ─── boot ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAndApply);
} else {
  loadAndApply();
}

// ─── context menu inline picker ───────────────────────────────────────────────

// Track where the right-click happened so we can position the picker there.
let lastCtxPos = { x: 0, y: 0 };
document.addEventListener('contextmenu', e => {
  lastCtxPos = { x: e.clientX, y: e.clientY };
});

function pickerNextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function removePicker() {
  const host = document.getElementById('tr-picker-host');
  if (host) host.remove();
}

function showPicker(text) {
  removePicker();

  // Shadow-DOM host — zero-size, fixed, max z-index
  const host = document.createElement('div');
  host.id = 'tr-picker-host';
  Object.assign(host.style, {
    all:      'initial',
    position: 'fixed',
    top:      '0',
    left:     '0',
    width:    '0',
    height:   '0',
    zIndex:   '2147483647',
    overflow: 'visible'
  });

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :host { all: initial; }

      /* "Graphite" skin — machined dark plates, ember-orange accents */
      .card {
        position: fixed;
        width: 276px;
        background: linear-gradient(180deg, #2b2c31, #1f2024);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        box-shadow: 0 14px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
        font-family: "DIN Alternate", "Bahnschrift", "Franklin Gothic Medium", "Segoe UI", sans-serif;
        font-size: 13px;
        color: #d8d8dc;
        overflow: hidden;
        pointer-events: all;
      }

      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 9px;
        background: rgba(0,0,0,0.25);
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .titlebar-text {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.03em;
        color: #d8d8dc;
      }
      .titlebar-text::before {
        content: '●';
        color: #ff7a2f;
        font-size: 8px;
        margin-right: 6px;
        vertical-align: 2px;
      }
      .titlebar-btns { display: flex; align-items: center; gap: 6px; }
      .close-btn,
      .prefs-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #8b8c95;
        font-size: 16px;
        line-height: 1;
        padding: 0 2px;
        border-radius: 4px;
        transition: color 0.15s;
      }
      .close-btn:hover { color: #ff5c5c; }
      .prefs-btn { font-size: 13px; }
      .prefs-btn:hover { color: #ff7a2f; }

      .body { padding: 13px 14px 14px; display: flex; flex-direction: column; gap: 10px; }

      /* preview — inset well */
      .preview {
        background: #1a1b1f;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 7px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
        padding: 7px 10px;
        font-size: 14px;
        font-weight: 700;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        word-break: break-all;
        min-height: 34px;
        display: flex;
        align-items: center;
      }

      /* color row */
      .color-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .color-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #8b8c95;
        flex-shrink: 0;
      }
      input[type="color"] {
        width: 36px;
        height: 32px;
        padding: 3px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 7px;
        background: linear-gradient(180deg, #2f3035, #26272c);
        cursor: pointer;
        flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
      }
      input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
      input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }

      .hex-input {
        flex: 1;
        background: #1a1b1f;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 7px;
        color: #d8d8dc;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 12px;
        padding: 6px 8px;
        outline: none;
        transition: border-color 0.15s;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
      }
      .hex-input:focus { border-color: rgba(255,122,47,0.35); }

      /* checkboxes */
      .opts { display: flex; gap: 14px; }
      .opt-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: #8b8c95;
        user-select: none;
      }
      .opt-label:hover { color: #d8d8dc; }
      .opt-label input { accent-color: #ff7a2f; cursor: pointer; }

      /* buttons */
      .btns { display: flex; gap: 7px; }
      .btn {
        flex: 1;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.08);
        cursor: pointer;
        font-family: "DIN Alternate", "Bahnschrift", "Franklin Gothic Medium", "Segoe UI", sans-serif;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
        padding: 8px 0;
        transition: color 0.15s, box-shadow 0.15s;
      }
      .btn:active { transform: translateY(1px); }
      .btn-add {
        background: linear-gradient(180deg, #35363c, #232428);
        color: #ff8b47;
        box-shadow: 0 2px 5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 3px rgba(0,0,0,0.25);
      }
      .btn-add:hover { color: #ff9d5c; }
      .btn-add:active { box-shadow: inset 0 2px 4px rgba(0,0,0,0.4); }
      .btn-cancel {
        background: transparent;
        color: #8b8c95;
      }
      .btn-cancel:hover { color: #d8d8dc; border-color: rgba(255,255,255,0.2); }
    </style>

    <div class="card" id="card">
      <div class="titlebar">
        <span class="titlebar-text">Add to FoxDye</span>
        <span class="titlebar-btns">
          <button class="prefs-btn" id="prefsBtn" title="Open preferences">⚙</button>
          <button class="close-btn" id="closeBtn" title="Close">×</button>
        </span>
      </div>
      <div class="body">
        <div class="preview" id="preview">${text.length > 60 ? text.slice(0, 60) + '…' : text}</div>
        <div class="color-row">
          <span class="color-label">Color</span>
          <input type="color" id="colorPicker" value="#ff4d4d">
          <input type="text" class="hex-input" id="hexInput" value="#ff4d4d" maxlength="7" spellcheck="false">
        </div>
        <div class="opts">
          <label class="opt-label"><input type="checkbox" id="caseSens"> Case sensitive</label>
          <label class="opt-label"><input type="checkbox" id="wholeWord" checked> Whole word</label>
        </div>
        <div class="btns">
          <button class="btn btn-cancel" id="cancelBtn">Cancel</button>
          <button class="btn btn-add" id="addBtn">Add pattern</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  // ── position the card ──────────────────────────────────────────────────────
  const card    = shadow.getElementById('card');
  const W       = 276;
  const H       = 220; // approximate
  const vw      = window.innerWidth;
  const vh      = window.innerHeight;
  const margin  = 10;

  let x = lastCtxPos.x + 4;
  let y = lastCtxPos.y + 4;
  if (x + W + margin > vw) x = vw - W - margin;
  if (y + H + margin > vh) y = Math.max(margin, lastCtxPos.y - H - 4);
  x = Math.max(margin, x);

  card.style.left = `${x}px`;
  card.style.top  = `${y}px`;

  // ── element refs ───────────────────────────────────────────────────────────
  const previewEl = shadow.getElementById('preview');
  const picker    = shadow.getElementById('colorPicker');
  const hexInput  = shadow.getElementById('hexInput');
  const caseSens  = shadow.getElementById('caseSens');
  const wholeWord = shadow.getElementById('wholeWord');

  function updatePreview() {
    previewEl.style.color = picker.value;
  }
  updatePreview();

  picker.addEventListener('input', () => {
    hexInput.value = picker.value;
    updatePreview();
  });

  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      picker.value = v;
      updatePreview();
    }
  });

  hexInput.addEventListener('blur', () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hexInput.value.trim())) {
      hexInput.value = picker.value;
    }
  });

  // ── close / cancel / preferences ───────────────────────────────────────────
  shadow.getElementById('closeBtn').addEventListener('click', removePicker);
  shadow.getElementById('cancelBtn').addEventListener('click', removePicker);
  shadow.getElementById('prefsBtn').addEventListener('click', () => {
    // content scripts can't call openOptionsPage — the background does it
    browser.runtime.sendMessage({ type: 'tr-open-options' });
    removePicker();
  });

  // ── add button ─────────────────────────────────────────────────────────────
  shadow.getElementById('addBtn').addEventListener('click', () => {
    const newPattern = {
      id:            pickerNextId(),
      text,
      color:         picker.value,
      caseSensitive: caseSens.checked,
      wholeWord:     wholeWord.checked
    };

    browser.storage.local.get({ patterns: [] }).then(data => {
      const updated = [...data.patterns, newPattern];
      browser.storage.local.set({ patterns: updated });
    });

    removePicker();
  });

  // ── close on outside click ─────────────────────────────────────────────────
  function outsideClick(e) {
    if (!e.composedPath().includes(host)) {
      removePicker();
      document.removeEventListener('mousedown', outsideClick, true);
    }
  }
  document.addEventListener('mousedown', outsideClick, true);

  // ── close on Escape ────────────────────────────────────────────────────────
  function onKey(e) {
    if (e.key === 'Escape') {
      removePicker();
      document.removeEventListener('keydown', onKey, true);
    }
  }
  document.addEventListener('keydown', onKey, true);
}

// ─── message listener ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(msg => {
  if (msg.type === 'tr-show-picker') showPicker(msg.text);

  // Popup asks for this page's state: host, activity, and per-pattern counts
  if (msg.type === 'tr-status') {
    return Promise.resolve({
      hostname: location.hostname,
      active:   isActive(),
      counts:   computeVisibleCounts()
    });
  }
});

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

let patterns    = [];   // [{ id, text, color, caseSensitive, wholeWord }]
let enabled     = true;
let mutObserver = null;
let processing  = false;

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

/** Build a single RegExp that matches any of the active patterns. */
function buildRegex(patternList) {
  if (!patternList.length) return null;

  // We combine all patterns into one alternation so we make a single pass.
  // Each pattern gets a named-style capture group index so we can map a
  // match back to its color.  We use numbered groups via the index.
  const parts = patternList.map((p, i) => {
    let src = escapeRegex(p.text);
    if (p.wholeWord) src = `\\b${src}\\b`;
    // Wrap in a capturing group
    return `(${src})`;
  });

  // Use case-insensitive if ANY pattern is case-insensitive is too coarse;
  // instead we keep per-pattern flags by handling them in buildPerPatternRegexes.
  // This combined regex is only used for the fast "does any pattern match?" check;
  // actual replacement uses per-pattern regexes.
  try {
    return new RegExp(parts.join('|'), 'gi');
  } catch {
    return null;
  }
}

/** Build an array of { regex, color } objects, one per active pattern. */
function buildPatternRegexes(patternList) {
  return patternList
    .filter(p => p.text && p.text.length > 0)
    .map(p => {
      let src = escapeRegex(p.text);
      if (p.wholeWord) src = `\\b${src}\\b`;
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

/** Apply all active patterns to a subtree (defaults to document.body). */
function applyPatterns(root = document.body) {
  if (!root || !enabled || !patterns.length) return;

  const patternRegexes = buildPatternRegexes(patterns);
  if (!patternRegexes.length) return;

  const nodes = collectTextNodes(root);
  for (const node of nodes) {
    processTextNode(node, patternRegexes);
  }
}

/** Unwrap then re-apply — called when patterns change. */
function reapply() {
  unwrapAll();
  if (enabled && patterns.length) applyPatterns();
}

// ─── mutation observer ────────────────────────────────────────────────────────

function startObserver() {
  if (mutObserver) return;

  mutObserver = new MutationObserver(mutations => {
    if (processing || !enabled || !patterns.length) return;
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
  browser.storage.local.get({ patterns: [], enabled: true }).then(data => {
    patterns = data.patterns;
    enabled  = data.enabled;

    if (enabled && patterns.length) {
      applyPatterns();
      startObserver();
    }
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.patterns) patterns = changes.patterns.newValue ?? [];
  if (changes.enabled)  enabled  = changes.enabled.newValue  ?? true;

  stopObserver();
  reapply();
  if (enabled && patterns.length) startObserver();
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

      .card {
        position: fixed;
        width: 276px;
        background: #151a0d;
        border: 1px solid #2e3820;
        border-radius: 4px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.75), 0 0 0 1px #38c8a022;
        font-family: "Courier New", Courier, monospace;
        font-size: 13px;
        color: #c8d4a0;
        overflow: hidden;
        pointer-events: all;
      }

      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 9px;
        background: #0e0f08;
        border-bottom: 1px solid #38c8a044;
      }
      .titlebar-text {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #38c8a0;
      }
      .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #6a7a50;
        font-size: 16px;
        line-height: 1;
        padding: 0 2px;
        border-radius: 2px;
        transition: color 0.15s;
      }
      .close-btn:hover { color: #cc2800; }

      .body { padding: 13px 14px 14px; display: flex; flex-direction: column; gap: 10px; }

      /* preview */
      .preview {
        background: #0e0f08;
        border: 1px solid #2e3820;
        border-radius: 4px;
        padding: 7px 10px;
        font-size: 14px;
        font-weight: 700;
        word-break: break-all;
        min-height: 34px;
        display: flex;
        align-items: center;
        letter-spacing: 0.04em;
      }

      /* color row */
      .color-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .color-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #6a7a50;
        flex-shrink: 0;
      }
      input[type="color"] {
        width: 36px;
        height: 32px;
        padding: 3px;
        border: 1px solid #2e3820;
        border-radius: 4px;
        background: #1c2212;
        cursor: pointer;
        flex-shrink: 0;
      }
      input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
      input[type="color"]::-webkit-color-swatch { border: none; border-radius: 2px; }

      .hex-input {
        flex: 1;
        background: #1c2212;
        border: 1px solid #2e3820;
        border-radius: 4px;
        color: #c8d4a0;
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        padding: 6px 8px;
        outline: none;
        transition: border-color 0.15s;
      }
      .hex-input:focus { border-color: #38c8a0; }

      /* checkboxes */
      .opts { display: flex; gap: 14px; }
      .opt-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 12px;
        color: #6a7a50;
        user-select: none;
      }
      .opt-label:hover { color: #c8d4a0; }
      .opt-label input { accent-color: #38c8a0; cursor: pointer; }

      /* buttons */
      .btns { display: flex; gap: 7px; }
      .btn {
        flex: 1;
        border-radius: 4px;
        border: 1px solid transparent;
        cursor: pointer;
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 7px 0;
        transition: opacity 0.15s, background 0.15s;
      }
      .btn:active { transform: scale(0.97); }
      .btn-add {
        background: #38c8a0;
        color: #0e0f08;
        border-color: #38c8a0;
      }
      .btn-add:hover { background: #4eddb8; border-color: #4eddb8; }
      .btn-cancel {
        background: transparent;
        color: #6a7a50;
        border-color: #2e3820;
      }
      .btn-cancel:hover { color: #c8d4a0; border-color: #6a7a50; background: #1c2212; }
    </style>

    <div class="card" id="card">
      <div class="titlebar">
        <span class="titlebar-text">Add to FoxDye</span>
        <button class="close-btn" id="closeBtn" title="Close">×</button>
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
          <label class="opt-label"><input type="checkbox" id="wholeWord"> Whole word</label>
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

  // ── close / cancel ─────────────────────────────────────────────────────────
  shadow.getElementById('closeBtn').addEventListener('click', removePicker);
  shadow.getElementById('cancelBtn').addEventListener('click', removePicker);

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
});

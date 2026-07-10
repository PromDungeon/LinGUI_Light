/**
 * FoxDye — shared color palettes
 *
 * Plain script loaded by both the popup and the options page (before their
 * own scripts). Provides the built-in palettes, storage access for custom
 * palettes, and a small helper that wires a palette <select> + swatch grid
 * to a color picker.
 *
 * Custom palettes live in storage.local under `customPalettes`:
 *   [{ name: "My palette", colors: ["#aabbcc", ...] }, ...]
 * The currently selected palette name is remembered under `activePalette`.
 */

/* IDE mainstay themes — each palette is the theme's canonical accent set. */
const DEFAULT_PALETTES = [
  {
    name: 'Catppuccin',   // Mocha
    builtin: true,
    colors: ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89b4fa', '#cba6f7', '#f5c2e7']
  },
  {
    name: 'Dracula',
    builtin: true,
    colors: ['#ff5555', '#ffb86c', '#f1fa8c', '#50fa7b', '#8be9fd', '#bd93f9', '#ff79c6', '#6272a4']
  },
  {
    name: 'Monokai',
    builtin: true,
    colors: ['#f92672', '#fd971f', '#e6db74', '#a6e22e', '#66d9ef', '#ae81ff', '#f8f8f2', '#75715e']
  },
  {
    name: 'Tokyo Night',
    builtin: true,
    colors: ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#73daca', '#7dcfff', '#7aa2f7', '#bb9af7']
  },
  {
    name: 'Gruvbox',
    builtin: true,
    colors: ['#fb4934', '#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598', '#d3869b', '#ebdbb2']
  },
  {
    name: 'Material',
    builtin: true,
    colors: ['#ff5370', '#f78c6c', '#ffcb6b', '#c3e88d', '#89ddff', '#82aaff', '#c792ea', '#f07178']
  },
  {
    name: 'Ayu',          // Mirage
    builtin: true,
    colors: ['#f28779', '#ffa759', '#ffd580', '#bae67e', '#95e6cb', '#73d0ff', '#d4bfff', '#f29e74']
  },
  {
    // Okabe-Ito — distinguishable under common color-vision deficiencies
    name: 'Colorblind safe',
    builtin: true,
    colors: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#999999']
  }
];

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Validate an imported palette object; returns a clean copy or null. */
function sanitizePalette(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim()) return null;
  if (!Array.isArray(p.colors)) return null;
  const colors = p.colors.filter(isHexColor).map(c => c.toLowerCase());
  if (!colors.length) return null;
  return { name: p.name.trim().slice(0, 40), colors: colors.slice(0, 32) };
}

/** All palettes: built-ins followed by the user's custom ones. */
function loadPalettes() {
  return browser.storage.local.get({ customPalettes: [] }).then(data => {
    const custom = data.customPalettes
      .map(sanitizePalette)
      .filter(Boolean)
      .map(p => ({ ...p, builtin: false }));
    return [...DEFAULT_PALETTES, ...custom];
  });
}

/**
 * Wire a palette <select> + swatch grid to a color picker.
 *
 * opts:
 *   selectEl   — the <select> to fill with palette names
 *   swatchesEl — container that receives one button per color
 *   onPick     — called with a hex color when a swatch is clicked
 *
 * Returns { refresh, getActive }:
 *   refresh()   — reload palettes from storage and re-render (call after import/delete)
 *   getActive() — the currently selected palette object
 */
function initPaletteUI({ selectEl, swatchesEl, onPick }) {
  let palettes = [];

  function getActive() {
    return palettes.find(p => p.name === selectEl.value) ?? palettes[0];
  }

  function renderSwatches() {
    const pal = getActive();
    swatchesEl.innerHTML = '';
    if (!pal) return;
    for (const color of pal.colors) {
      const b = document.createElement('button');
      b.type  = 'button';
      b.className = 'pal-swatch';
      b.style.background = color;
      b.title = color;
      b.addEventListener('click', () => onPick(color));
      swatchesEl.appendChild(b);
    }
  }

  selectEl.addEventListener('change', () => {
    renderSwatches();
    browser.storage.local.set({ activePalette: selectEl.value });
  });

  function refresh() {
    return Promise.all([
      loadPalettes(),
      browser.storage.local.get({ activePalette: DEFAULT_PALETTES[0].name })
    ]).then(([list, { activePalette }]) => {
      palettes = list;
      selectEl.innerHTML = '';
      for (const p of list) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.builtin ? p.name : `${p.name} (custom)`;
        selectEl.appendChild(opt);
      }
      selectEl.value = list.some(p => p.name === activePalette)
        ? activePalette
        : list[0].name;
      renderSwatches();
    });
  }

  return { refresh, getActive };
}

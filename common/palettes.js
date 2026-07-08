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

const DEFAULT_PALETTES = [
  {
    name: 'Classic',
    builtin: true,
    colors: ['#ff4d4d', '#ff9f1a', '#ffd60a', '#4dd964', '#38c8a0', '#4da6ff', '#9b6bff', '#ff66c4']
  },
  {
    name: 'Neon',
    builtin: true,
    colors: ['#39ff14', '#00f0ff', '#ff2079', '#ffea00', '#ff00ff', '#ff5f1f', '#7df9ff', '#ccff00']
  },
  {
    name: 'Pastel',
    builtin: true,
    colors: ['#ffb3ba', '#ffdfba', '#fff5ba', '#baffc9', '#bae1ff', '#e3baff', '#ffc9de', '#c9f0e8']
  },
  {
    name: 'Earth',
    builtin: true,
    colors: ['#a0522d', '#8b5a2b', '#6b8e23', '#556b2f', '#b8860b', '#cd853f', '#8fbc8f', '#d2b48c']
  },
  {
    // Okabe-Ito palette — distinguishable under common color-vision deficiencies
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

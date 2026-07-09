/**
 * Text Recolor — background script
 */

// ─── schema migration (v2: folders + site rules) ─────────────────────────────

function migrateStorage() {
  browser.storage.local.get({
    patterns: [], folders: null, siteRules: null, disabledSites: []
  }).then(data => {
    if (!ensureSchema(data)) return;
    browser.storage.local.set({
      patterns:  data.patterns,
      folders:   data.folders,
      siteRules: data.siteRules
    }).then(() => browser.storage.local.remove('disabledSites'));
  });
}

browser.runtime.onInstalled.addListener(migrateStorage);
browser.runtime.onStartup.addListener(migrateStorage);

// ─── context menu ─────────────────────────────────────────────────────────────

function createContextMenu() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id:       'tr-add-pattern',
      title:    'Add "%s" to Text Recolor…',
      contexts: ['selection']
    });
  });
}

browser.runtime.onInstalled.addListener(createContextMenu);
browser.runtime.onStartup.addListener(createContextMenu);

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tr-add-pattern') return;
  const text = info.selectionText?.trim();
  if (!text || !tab?.id) return;

  browser.tabs.sendMessage(tab.id, { type: 'tr-show-picker', text });
});

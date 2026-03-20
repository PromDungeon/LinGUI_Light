/**
 * Text Recolor — background script
 */

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

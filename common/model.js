/**
 * FoxDye — shared data model helpers (schema v2)
 *
 * Loaded by the background page, popup, options page, and as a content
 * script (declared before content.js in the manifest). Keep it
 * dependency-free and side-effect-free.
 *
 * Schema v2:
 *   folders:   [{ id, name, enabled }]
 *   patterns:  [{ id, text, color, caseSensitive, wholeWord, isRegex,
 *                 enabled, folderId }]
 *   siteRules: [{ host, folders: [folderId, ...] }]  // [] = off on that host
 *
 * A host with no matching rule uses the global default: every folder
 * whose enabled !== false.
 */

const GENERAL_FOLDER_ID = 'general';

/** Does a rule host cover this hostname? (exact match or parent domain) */
function hostMatchesRule(host, ruleHost) {
  return host === ruleHost || host.endsWith('.' + ruleHost);
}

/** The most specific rule for a hostname (longest matching host), or null. */
function findSiteRule(host, siteRules) {
  let best = null;
  for (const rule of siteRules ?? []) {
    if (!hostMatchesRule(host, rule.host)) continue;
    if (!best || rule.host.length > best.host.length) best = rule;
  }
  return best;
}

/** Set of folder ids that should run on a hostname. */
function activeFolderIds(host, folders, siteRules) {
  const rule = findSiteRule(host, siteRules);
  if (rule) return new Set(rule.folders);
  return new Set((folders ?? []).filter(f => f.enabled !== false).map(f => f.id));
}

/**
 * Normalize any pre-v2 storage shape in place:
 * - guarantees a folders array with a General folder when needed
 * - gives every pattern a valid folderId
 * - converts legacy disabledSites entries into empty-set site rules
 * Returns true if `data` was modified (caller should persist it).
 */
function ensureSchema(data) {
  let changed = false;

  if (!Array.isArray(data.folders)) {
    data.folders = [];
    changed = true;
  }

  function ensureGeneral() {
    if (!data.folders.some(f => f.id === GENERAL_FOLDER_ID)) {
      data.folders.unshift({ id: GENERAL_FOLDER_ID, name: 'General', enabled: true });
      changed = true;
    }
  }

  if (!data.folders.length) ensureGeneral();

  const known = new Set(data.folders.map(f => f.id));
  for (const p of data.patterns ?? []) {
    if (!p.folderId || !known.has(p.folderId)) {
      ensureGeneral();
      p.folderId = GENERAL_FOLDER_ID;
      changed = true;
    }
  }

  if (!Array.isArray(data.siteRules)) {
    data.siteRules = (data.disabledSites ?? []).map(host => ({ host, folders: [] }));
    changed = true;
  }

  return changed;
}

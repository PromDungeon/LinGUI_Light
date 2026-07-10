/**
 * FoxDye — starter packs
 *
 * Curated pattern sets installable from the options page. Installing a
 * pack creates (or reuses) a folder with the pack's name and adds its
 * patterns tagged with packId, so installs are idempotent and removal
 * can target exactly what a pack added.
 *
 * Keep regexes linear (no nested quantifiers) — they run on every page.
 */

const STARTER_PACKS = [
  {
    id: 'code-review',
    name: 'Code review',
    description: 'Comment markers that deserve attention in code and diffs.',
    patterns: [
      { text: 'TODO',       color: '#ffb224', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'FIXME',      color: '#ff5c64', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'HACK',       color: '#ff7a2f', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'BUG',        color: '#ff2079', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'XXX',        color: '#ff5c64', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'NOTE',       color: '#38e0b0', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'DEPRECATED', color: '#9d7cff', caseSensitive: true, wholeWord: true, isRegex: false }
    ]
  },
  {
    id: 'log-levels',
    name: 'Log levels',
    description: 'Severity keywords for scanning logs and consoles.',
    patterns: [
      { text: 'FATAL',   color: '#ff2079', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'ERROR',   color: '#ff5c64', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'WARN',    color: '#ffb224', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'WARNING', color: '#ffb224', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'INFO',    color: '#5aa9ff', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'DEBUG',   color: '#9d7cff', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'TRACE',   color: '#8b8c95', caseSensitive: true, wholeWord: true, isRegex: false }
    ]
  },
  {
    id: 'numbers-codes',
    name: 'Numbers & codes',
    description: 'Six-digit codes, IPv4 addresses, UUIDs, and hex colors.',
    patterns: [
      { text: '\\b\\d{6}\\b',                                          color: '#ffd60a', caseSensitive: false, wholeWord: false, isRegex: true },
      { text: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',                      color: '#38e0b0', caseSensitive: false, wholeWord: false, isRegex: true },
      { text: '\\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\b',     color: '#9d7cff', caseSensitive: false, wholeWord: false, isRegex: true },
      { text: '#[0-9a-f]{6}\\b',                                       color: '#ff66c4', caseSensitive: false, wholeWord: false, isRegex: true }
    ]
  },
  {
    id: 'contact-info',
    name: 'Contact info',
    description: 'Email addresses, North-American phone numbers, and URLs.',
    patterns: [
      { text: '\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+\\b',                    color: '#5aa9ff', caseSensitive: false, wholeWord: false, isRegex: true },
      { text: '\\b\\(?\\d{3}\\)?[ .-]?\\d{3}[ .-]?\\d{4}\\b',          color: '#ffb224', caseSensitive: false, wholeWord: false, isRegex: true },
      { text: 'https?://[^\\s<>"\']+',                                 color: '#38e0b0', caseSensitive: false, wholeWord: false, isRegex: true }
    ]
  },
  {
    id: 'status-priority',
    name: 'Status & priority',
    description: 'Ticket and task keywords: urgency, state, and blockers.',
    patterns: [
      { text: 'URGENT',  color: '#ff2079', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'ASAP',    color: '#ff2079', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'HIGH',    color: '#ff7a2f', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'MEDIUM',  color: '#ffd60a', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'LOW',     color: '#4dd964', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'BLOCKED', color: '#ff5c64', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'WIP',     color: '#5aa9ff', caseSensitive: true, wholeWord: true, isRegex: false },
      { text: 'DONE',    color: '#38e0b0', caseSensitive: true, wholeWord: true, isRegex: false }
    ]
  }
];

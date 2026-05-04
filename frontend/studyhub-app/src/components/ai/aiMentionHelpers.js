/* ═══════════════════════════════════════════════════════════════════════════
 * aiMentionHelpers.js — Helpers for the @-mention popover.
 *
 * Split out of AiMentionMenu.jsx so the menu file only exports components
 * (react-refresh constraint).
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Detect a trailing `@word` token at the cursor position. Returns
 * `{ trigger, start, end }` or `null` if no mention is active.
 */
export function detectMentionTrigger(text, cursorIndex) {
  if (typeof text !== 'string') return null
  if (typeof cursorIndex !== 'number') return null
  const slice = text.slice(0, cursorIndex)
  const m = slice.match(/(^|\s)(@[A-Za-z0-9_-]*)$/)
  if (!m) return null
  const trigger = m[2]
  const start = cursorIndex - trigger.length
  return { trigger, start, end: cursorIndex }
}

/**
 * Get total option count for keyboard navigation.
 */
export function countMentionOptions({ sheets = [], notes = [], courses = [] }) {
  return sheets.length + notes.length + courses.length
}

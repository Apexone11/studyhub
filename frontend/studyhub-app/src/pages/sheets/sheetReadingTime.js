/* ═══════════════════════════════════════════════════════════════════════════
 * sheetReadingTime.js — "X min read" helpers for sheet viewers and cards.
 *
 * Mirrors the pattern used by NoteViewerPage: 220 WPM (Brysbaert 2019 median
 * silent-reading rate, the same baseline Bear and Notion use). The notes
 * module has its own copies of `wordCount` / `countWordsFromHtml` — we
 * intentionally re-implement them here rather than cross-import from
 * `pages/notes/`, both to keep the sheets module self-contained and because
 * the task constraints explicitly forbid touching `pages/notes/`.
 * ═══════════════════════════════════════════════════════════════════════════ */

// 220 wpm matches the notes viewer baseline so the estimate is consistent
// across the two surfaces. Bumping this in one place without the other
// would tell two different stories for the same kind of content.
export const SHEET_WORDS_PER_MINUTE = 220

/**
 * Word count for plain text / markdown input. Whitespace-split, no
 * markdown stripping — matches the notes helper exactly.
 */
export function wordCount(text) {
  if (typeof text !== 'string' || !text.trim()) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Word count for HTML input. Parses with DOMParser, drops script/style/noscript
 * subtrees so embedded code blocks don't pollute the estimate, then walks
 * text nodes and joins their trimmed values. SSR-safe: returns 0 when
 * `DOMParser` / `document` are unavailable (e.g. during prerender).
 */
export function countWordsFromHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return 0
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    // Fallback: strip tags with a regex when DOMParser isn't around.
    const stripped = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return wordCount(stripped)
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  doc.body?.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  const walker = document.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT)
  const textParts = []
  let node = walker.nextNode()
  while (node) {
    const value = node.textContent?.trim()
    if (value) textParts.push(value)
    node = walker.nextNode()
  }
  const text = textParts.join(' ')
  return wordCount(text)
}

/**
 * Count words in a sheet, branching on `contentFormat`. HTML sheets use the
 * DOM parser; markdown / richtext / unknown formats fall through to the
 * plain whitespace count.
 */
export function sheetWordCount(sheet) {
  if (!sheet) return 0
  const content = typeof sheet.content === 'string' ? sheet.content : ''
  if (!content) return 0
  const format = String(sheet.contentFormat || '').toLowerCase()
  if (format === 'html') return countWordsFromHtml(content)
  return wordCount(content)
}

/**
 * Convert a word count to a "X min read" minute integer using 220 wpm.
 * Floor + max(1) keeps short sheets from displaying "0 min read" while
 * still being honest about long-form content — same shape as the notes
 * viewer estimate.
 */
export function readingMinutes(words) {
  if (!Number.isFinite(words) || words <= 0) return 0
  return Math.max(1, Math.ceil(words / SHEET_WORDS_PER_MINUTE))
}

/**
 * Full pipeline: sheet -> "X min read" minutes. Returns 0 when we can't
 * compute a meaningful estimate so callers can hide the chip rather than
 * render "0 min read".
 */
export function estimateSheetReadingMinutes(sheet) {
  return readingMinutes(sheetWordCount(sheet))
}

/**
 * noteHtml.js — single source of truth for converting note HTML into the
 * plain-text variants the rest of the notes UI needs.
 *
 * Notes are stored as TipTap-emitted HTML. Three independent surfaces
 * used to do their own ad-hoc stripping (NotesList sidebar preview,
 * useNotesData search index, NoteEditor title auto-derivation), and each
 * had its own list of entity replacements. That meant the sidebar would
 * decode `&amp;` to `&` while the search index left it as `&amp;`,
 * which produced confusing "search misses" and a sidebar/title that
 * disagreed about what the note's first line actually said.
 *
 * Centralizing here so all three call sites apply the exact same rules.
 */

const ENTITY_REPLACEMENTS = [
  [/<style[\s\S]*?<\/style>/gi, ''],
  [/<script[\s\S]*?<\/script>/gi, ''],
  [/<[^>]*>/g, ' '],
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
  [/&#\d+;/g, ' '],
]

/**
 * Strip every HTML tag and decode the common HTML entities we ever emit
 * from the note editor. Returns a single trimmed line of plain text;
 * collapses any internal whitespace (so multi-line notes flatten to one
 * line for sidebar previews).
 */
export function stripHtmlForPreview(html) {
  if (typeof html !== 'string' || !html.trim()) return ''
  let out = html
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Pick a clean title candidate out of the editor's HTML. We prefer the
 * first `<h1>` (or `<h2>` as a fallback if no H1 exists) because that
 * mirrors how most documents are titled — the rule matches Google Docs
 * / Notion / iA Writer. If neither is present we fall back to the first
 * non-empty line of plain text. Returns null when nothing usable is
 * found so the caller can leave the manual title alone.
 *
 * The 80-character cap matches the StudySheet title input so a derived
 * title cannot exceed what the user could type by hand.
 */
export function deriveTitleFromHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return null

  const headingMatch =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  let candidate = headingMatch ? headingMatch[1] : ''

  if (!candidate) {
    const plain = stripHtmlForPreview(html)
    candidate = plain.split(/(?<=[.!?])\s+|\n+/)[0] || plain
  }

  const cleaned = stripHtmlForPreview(candidate)
  if (!cleaned) return null
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trim()}…` : cleaned
}

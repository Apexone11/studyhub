/**
 * extractPreviewText.js
 *
 * Extracts a short plain-text preview from a sheet's HTML/markdown
 * content for the Sheets Grid view card. Called on every sheet
 * create/update and by the one-time backfill script.
 *
 * Why a server-extracted column instead of computing in the frontend:
 * the Sheets Grid view shows N cards at once; doing the strip+truncate
 * in the browser for each card every render would re-do work that can
 * be cached at write-time. The DB column also lets future search /
 * recommendation features key off the preview without re-parsing.
 *
 * The strip+entity-decode shape mirrors backend/src/modules/feed/
 * feed.service.js:stripHtml — same regex set, kept independent so a
 * future change to feed previews can't accidentally alter the persisted
 * sheet preview format. The two helpers can be unified into a shared
 * lib once a third caller appears.
 *
 * Output is capped at 240 chars (under the VARCHAR(280) column limit
 * with headroom for the Grid card's CSS line-clamp). Returns null for
 * empty / non-string input so the DB column stays NULL rather than ''.
 */

const PREVIEW_MAX_CHARS = 240
const ELLIPSIS = '...'

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractPreviewText(content) {
  if (typeof content !== 'string' || content.length === 0) return null
  const plain = stripHtml(content).replace(/\s+/g, ' ').trim()
  if (plain.length === 0) return null
  if (plain.length <= PREVIEW_MAX_CHARS) return plain
  return plain.slice(0, PREVIEW_MAX_CHARS - ELLIPSIS.length) + ELLIPSIS
}

module.exports = {
  extractPreviewText,
  PREVIEW_MAX_CHARS,
}

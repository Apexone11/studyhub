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

function stripMarkdown(text) {
  return String(text)
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/(^|\s)[-*+]\s+/g, '$1')
    .replace(/(^|\s)>\s+/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[*_~]/g, '')
}

function extractPreviewText(content) {
  if (typeof content !== 'string' || content.length === 0) return null
  const plain = stripHtml(content).replace(/\s+/g, ' ').trim()
  const normalized = stripMarkdown(plain).replace(/\s+/g, ' ').trim()
  if (plain.length === 0) return null
  if (normalized.length === 0) return null
  if (normalized.length <= PREVIEW_MAX_CHARS) return normalized
  const cutoff = PREVIEW_MAX_CHARS - ELLIPSIS.length
  const sliced = normalized.slice(0, cutoff)
  const endsWithHighSurrogate = /[\uD800-\uDBFF]$/.test(sliced)
  let safeSliced = sliced
  if (endsWithHighSurrogate) {
    safeSliced = safeSliced.slice(0, -1)
  }
  return safeSliced + ELLIPSIS
}

module.exports = {
  extractPreviewText,
  PREVIEW_MAX_CHARS,
}

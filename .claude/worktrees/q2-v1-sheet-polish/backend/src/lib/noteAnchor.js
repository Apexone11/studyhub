/**
 * noteAnchor.js — Anchor context extraction and validation for inline note comments.
 *
 * Stores surrounding text (prefix + suffix) alongside the selected anchor text so that
 * anchored comments can be re-matched even after the note content is edited.
 */

const CONTEXT_CHARS = 60

/**
 * Extract surrounding context from note content for an anchor.
 * Returns a JSON string: { prefix, suffix } — the text before and after the anchor.
 */
function buildAnchorContext(noteContent, anchorText, anchorOffset) {
  if (!noteContent || !anchorText || typeof anchorOffset !== 'number') return null

  const idx = anchorOffset >= 0 ? noteContent.indexOf(anchorText, Math.max(0, anchorOffset - 10)) : -1
  const resolvedIdx = idx >= 0 ? idx : noteContent.indexOf(anchorText)
  if (resolvedIdx < 0) return null

  const prefix = noteContent.slice(Math.max(0, resolvedIdx - CONTEXT_CHARS), resolvedIdx)
  const endIdx = resolvedIdx + anchorText.length
  const suffix = noteContent.slice(endIdx, endIdx + CONTEXT_CHARS)

  const json = JSON.stringify({ prefix, suffix })
  if (json.length > 1000) return null
  return json
}

/**
 * Validate anchor input fields. Returns sanitized { anchorText, anchorOffset } or null.
 */
function validateAnchorInput(body) {
  const anchorText = typeof body.anchorText === 'string' ? body.anchorText.slice(0, 500) : null
  if (!anchorText || anchorText.trim().length === 0) return null

  const anchorOffset = typeof body.anchorOffset === 'number'
    && Number.isInteger(body.anchorOffset)
    && body.anchorOffset >= 0
    ? body.anchorOffset
    : null

  return { anchorText: anchorText.trim(), anchorOffset }
}

module.exports = { buildAnchorContext, validateAnchorInput, CONTEXT_CHARS }

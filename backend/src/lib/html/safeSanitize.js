/**
 * safeSanitize.js — thin wrapper around sanitize-html that closes the
 * `<xmp>` (and related raw-text element) bypass disclosed in 2026-05.
 *
 * sanitize-html ≤ 2.17.3 special-cases a small set of raw-text elements
 * (textarea, xmp) in its discard path: the text INSIDE them is appended
 * to the sanitized output unescaped. Because htmlparser2 treats `<xmp>`
 * as raw-text on input, markup inside `<xmp>` is parsed as text and
 * then concatenated back into the output as live markup — turning a
 * sanitized string into stored XSS.
 *
 *   sanitizeHtml('<xmp><script>alert(1)</script></xmp>')
 *     → '<script>alert(1)</script>'
 *
 * Fix: add every spec-defined raw-text / escapable-raw-text element to
 * `nonTextTags` on every call. nonTextTags entries are dropped along
 * with their content — they never reach the unescaped-text path. This
 * covers `xmp` (the active exploit) plus `noscript`, `noframes`,
 * `iframe`, `noembed`, `plaintext` (same parser class, same family of
 * future bypasses).
 *
 * Every backend call site MUST go through this wrapper instead of
 * importing sanitize-html directly. There is no patched upstream yet
 * (advisory states "Patched version: None"), so the wrapper is the only
 * line of defense.
 */
const sanitizeHtml = require('sanitize-html')

const SAFE_NON_TEXT_TAGS = Object.freeze([
  'script',
  'style',
  'textarea',
  'option',
  'noscript',
  'noframes',
  'iframe',
  'noembed',
  'plaintext',
  'xmp',
])

function mergeNonTextTags(existing) {
  if (!existing || !existing.length) return SAFE_NON_TEXT_TAGS.slice()
  return Array.from(new Set([...existing, ...SAFE_NON_TEXT_TAGS]))
}

function safeSanitize(html, options = {}) {
  return sanitizeHtml(html, {
    ...options,
    nonTextTags: mergeNonTextTags(options.nonTextTags),
  })
}

safeSanitize.simpleTransform = sanitizeHtml.simpleTransform.bind(sanitizeHtml)
safeSanitize.defaults = sanitizeHtml.defaults
safeSanitize.SAFE_NON_TEXT_TAGS = SAFE_NON_TEXT_TAGS

module.exports = safeSanitize

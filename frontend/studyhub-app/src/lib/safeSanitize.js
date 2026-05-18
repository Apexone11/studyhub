/**
 * safeSanitize.js — frontend wrapper around sanitize-html that closes
 * the `<xmp>` (and related raw-text element) bypass disclosed in 2026-05.
 *
 * Mirrors backend/src/lib/html/safeSanitize.js. Both must stay in sync.
 * See that file for the full advisory write-up.
 */
import sanitizeHtml from 'sanitize-html'

export const SAFE_NON_TEXT_TAGS = Object.freeze([
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

export default safeSanitize

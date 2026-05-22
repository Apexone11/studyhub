/**
 * readingTime.js — estimate "X min read" from a text/HTML content blob.
 *
 * 220 words per minute is the median silent reading rate (Brysbaert 2019),
 * matching what Bear, Notion, and Medium use. Round up to the nearest
 * minute; floor at 1 so even a one-sentence preview reads "1 min."
 * Returns null for empty/missing content so callers can hide the chip
 * cleanly rather than render "0 min read".
 */

const WORDS_PER_MINUTE = 220

export function estimateReadingMinutes(text) {
  if (!text || typeof text !== 'string') return null
  // Strip HTML tags so a sanitized HTML body counts only its visible
  // words. Cheap regex — not bulletproof, but accurate enough for
  // reading-time estimates (which themselves are approximate).
  const plain = text.replace(/<[^>]+>/g, ' ')
  const words = plain.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const minutes = Math.ceil(words.length / WORDS_PER_MINUTE)
  return Math.max(1, minutes)
}

/** Convenience: returns the human-formatted label or null. */
export function formatReadingTime(text) {
  const minutes = estimateReadingMinutes(text)
  if (minutes == null) return null
  return `${minutes} min read`
}

export default estimateReadingMinutes

/* ═══════════════════════════════════════════════════════════════════════════
 * contentFingerprint.js — Lightweight content fingerprinting for plagiarism
 *
 * Computes two fingerprints per piece of text:
 *   - exactHash: SHA-256 of normalized text (detects exact copies)
 *   - simhash: 64-bit SimHash for fuzzy similarity (detects paraphrasing)
 *
 * SimHash algorithm:
 *   1. Break text into overlapping n-gram shingles
 *   2. Hash each shingle to a 64-bit value via FNV-1a
 *   3. Build a weighted vector of bit positions
 *   4. Collapse to a single 64-bit fingerprint
 *
 * Similarity = 1 - (hamming distance / 64)
 * Threshold: ≥0.85 = likely copy, ≥0.70 = suspicious
 * ═══════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto')

const SHINGLE_SIZE = 3 // 3-word shingles

/**
 * Normalize text for comparison:
 * - lowercase, strip HTML tags, collapse whitespace, remove punctuation
 */
function normalizeText(text) {
  if (!text) return ''
  return text
    .replace(/<[^>]+>/g, ' ')       // strip HTML
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation (Unicode-safe)
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
    .toLowerCase()
}

/**
 * SHA-256 hash of normalized text (for exact match detection).
 */
function exactHash(text) {
  const normalized = normalizeText(text)
  if (!normalized) return null
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * FNV-1a 64-bit hash (as two 32-bit integers for JS compatibility).
 * Returns a BigInt for bit manipulation.
 */
function fnv1a64(str) {
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i))
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h
}

/**
 * Compute a 64-bit SimHash from text.
 * Returns a hex string (16 chars) representing the 64-bit fingerprint.
 */
function simhash(text) {
  const normalized = normalizeText(text)
  if (!normalized) return null

  const words = normalized.split(' ').filter(Boolean)
  if (words.length < SHINGLE_SIZE) {
    // Too short for shingles — hash the whole thing
    return fnv1a64(normalized).toString(16).padStart(16, '0')
  }

  // Build weighted bit vector
  const v = new Array(64).fill(0)

  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    const shingle = words.slice(i, i + SHINGLE_SIZE).join(' ')
    const hash = fnv1a64(shingle)
    for (let bit = 0; bit < 64; bit++) {
      if ((hash >> BigInt(bit)) & 1n) {
        v[bit] += 1
      } else {
        v[bit] -= 1
      }
    }
  }

  // Collapse to fingerprint
  let fp = 0n
  for (let bit = 0; bit < 64; bit++) {
    if (v[bit] > 0) fp |= (1n << BigInt(bit))
  }

  return fp.toString(16).padStart(16, '0')
}

/**
 * Hamming distance between two 64-bit hex fingerprints.
 */
function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB) return 64
  const a = BigInt('0x' + hexA)
  const b = BigInt('0x' + hexB)
  let xor = a ^ b
  let dist = 0
  while (xor > 0n) {
    dist += Number(xor & 1n)
    xor >>= 1n
  }
  return dist
}

/**
 * Similarity score between two SimHash fingerprints.
 * Returns a number between 0 (completely different) and 1 (identical).
 */
function similarity(hexA, hexB) {
  return 1 - hammingDistance(hexA, hexB) / 64
}

/**
 * Compute fingerprints for a piece of content.
 * Returns { exactHash, simhash, wordCount }.
 */
function fingerprint(text) {
  const normalized = normalizeText(text)
  const words = normalized.split(' ').filter(Boolean)
  return {
    exactHash: exactHash(text),
    simhash: simhash(text),
    wordCount: words.length,
  }
}

module.exports = {
  normalizeText,
  exactHash,
  simhash,
  hammingDistance,
  similarity,
  fingerprint,
}

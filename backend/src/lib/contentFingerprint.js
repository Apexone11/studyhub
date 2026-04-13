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

const SHINGLE_SIZE = 3 // legacy default for single-window compat
// Phase 4: multi-window shingles for better detection.
const SHINGLE_WINDOWS = [3, 5, 7]

/**
 * Normalize text for comparison:
 * - lowercase, strip HTML tags, collapse whitespace, remove punctuation
 */
function normalizeText(text) {
  if (!text) return ''
  return text
    .replace(/<[^>]+>/g, ' ') // strip HTML
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation (Unicode-safe)
    .replace(/\s+/g, ' ') // collapse whitespace
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
    if (v[bit] > 0) fp |= 1n << BigInt(bit)
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

// ── Phase 4: Multi-window SimHash ──────────────────────────────────

/**
 * Compute SimHash fingerprints at multiple window sizes (3, 5, 7).
 * Returns an object with { w3, w5, w7 } hex strings.
 */
function simhashMultiWindow(text) {
  const normalized = normalizeText(text)
  if (!normalized) return { w3: null, w5: null, w7: null }

  const words = normalized.split(' ').filter(Boolean)
  const results = {}

  for (const windowSize of SHINGLE_WINDOWS) {
    if (words.length < windowSize) {
      results[`w${windowSize}`] = fnv1a64(normalized).toString(16).padStart(16, '0')
      continue
    }

    const v = new Array(64).fill(0)
    for (let i = 0; i <= words.length - windowSize; i++) {
      const shingle = words.slice(i, i + windowSize).join(' ')
      const hash = fnv1a64(shingle)
      for (let bit = 0; bit < 64; bit++) {
        if ((hash >> BigInt(bit)) & 1n) v[bit] += 1
        else v[bit] -= 1
      }
    }

    let fp = 0n
    for (let bit = 0; bit < 64; bit++) {
      if (v[bit] > 0) fp |= 1n << BigInt(bit)
    }
    results[`w${windowSize}`] = fp.toString(16).padStart(16, '0')
  }

  return results
}

/**
 * Best similarity across all window sizes between two texts.
 * Uses pre-computed multi-window hashes if available, otherwise computes.
 */
function multiWindowSimilarity(hashesA, hashesB) {
  let best = 0
  for (const w of SHINGLE_WINDOWS) {
    const key = `w${w}`
    const a = hashesA?.[key]
    const b = hashesB?.[key]
    if (a && b) {
      const sim = similarity(a, b)
      if (sim > best) best = sim
    }
  }
  return best
}

// ── Phase 4: N-gram frequency analysis ────────────────────────────

/**
 * Compute the frequency distribution of 2-grams and 3-grams in text.
 * Returns a Map<string, number> where keys are n-grams and values are
 * normalized frequencies (0-1).
 */
function ngramFrequency(text, n = 2) {
  const normalized = normalizeText(text)
  const words = normalized.split(' ').filter(Boolean)
  if (words.length < n) return new Map()

  const counts = new Map()
  let total = 0
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ')
    counts.set(gram, (counts.get(gram) || 0) + 1)
    total++
  }

  // Normalize to frequency
  if (total > 0) {
    for (const [key, val] of counts) {
      counts.set(key, val / total)
    }
  }
  return counts
}

/**
 * Cosine similarity between two frequency maps.
 */
function cosineSimilarity(freqA, freqB) {
  if (!freqA || !freqB || freqA.size === 0 || freqB.size === 0) return 0

  let dotProduct = 0
  let magA = 0
  let magB = 0

  // Use the smaller map for iteration efficiency
  const [smaller, larger] = freqA.size <= freqB.size ? [freqA, freqB] : [freqB, freqA]

  for (const [key, valA] of smaller) {
    const valB = larger.get(key) || 0
    dotProduct += valA * valB
  }

  for (const val of freqA.values()) magA += val * val
  for (const val of freqB.values()) magB += val * val

  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)

  return magA > 0 && magB > 0 ? dotProduct / (magA * magB) : 0
}

// ── Phase 4: Structural fingerprinting ────────────────────────────

/**
 * Extract the heading/section structure of HTML or markdown content.
 * Returns an array of heading strings in order, which can be compared
 * structurally between two documents.
 */
function extractStructure(text) {
  if (!text) return []
  // HTML headings
  const htmlHeadings = [...text.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)].map(
    (m) => `h${m[1]}:${normalizeText(m[2])}`,
  )
  if (htmlHeadings.length > 0) return htmlHeadings

  // Markdown headings
  const mdHeadings = [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(
    (m) => `h${m[1].length}:${normalizeText(m[2])}`,
  )
  return mdHeadings
}

/**
 * Compare two documents' section structures. Returns a 0-1 score where
 * 1 = identical structure (same headings in same order).
 */
function structuralSimilarity(textA, textB) {
  const structA = extractStructure(textA)
  const structB = extractStructure(textB)

  if (structA.length === 0 || structB.length === 0) return 0
  if (structA.length === 0 && structB.length === 0) return 0

  // Simple: what fraction of headings match in order?
  const maxLen = Math.max(structA.length, structB.length)
  let matches = 0
  for (let i = 0; i < Math.min(structA.length, structB.length); i++) {
    if (structA[i] === structB[i]) matches++
  }

  return matches / maxLen
}

/**
 * Phase 4: comprehensive similarity analysis between two texts.
 * Returns { simhash, ngram2, ngram3, structural, best } scores.
 */
function comprehensiveSimilarity(textA, textB) {
  const hashesA = simhashMultiWindow(textA)
  const hashesB = simhashMultiWindow(textB)
  const simhashScore = multiWindowSimilarity(hashesA, hashesB)

  const ngram2A = ngramFrequency(textA, 2)
  const ngram2B = ngramFrequency(textB, 2)
  const ngram2Score = cosineSimilarity(ngram2A, ngram2B)

  const ngram3A = ngramFrequency(textA, 3)
  const ngram3B = ngramFrequency(textB, 3)
  const ngram3Score = cosineSimilarity(ngram3A, ngram3B)

  const structScore = structuralSimilarity(textA, textB)

  // Best = highest of any individual metric
  const best = Math.max(simhashScore, ngram2Score, ngram3Score, structScore)

  return {
    simhash: Math.round(simhashScore * 1000) / 1000,
    ngram2: Math.round(ngram2Score * 1000) / 1000,
    ngram3: Math.round(ngram3Score * 1000) / 1000,
    structural: Math.round(structScore * 1000) / 1000,
    best: Math.round(best * 1000) / 1000,
  }
}

module.exports = {
  normalizeText,
  exactHash,
  simhash,
  simhashMultiWindow,
  hammingDistance,
  similarity,
  multiWindowSimilarity,
  ngramFrequency,
  cosineSimilarity,
  extractStructure,
  structuralSimilarity,
  comprehensiveSimilarity,
  fingerprint,
  SHINGLE_WINDOWS,
}

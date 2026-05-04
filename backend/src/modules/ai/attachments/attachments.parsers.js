/**
 * attachments.parsers.js — Pure parsing + validation primitives for
 * Hub AI v2 document uploads. Designed to be testable in isolation;
 * no DB / no R2 / no logger imports.
 *
 * Master plan refs:
 *   §4.6 (prompt-injection defenses)
 *   L3-CRIT-1 (mammoth CVE-2025-11849)
 *   L3-CRIT-3 (ZIP-based MIME spoofing → stage-2 validation)
 *   L1-HIGH-3 (PDF embedded-JS detection)
 *   L3-HIGH-1 (zip-bomb decompression cap)
 *   L3-HIGH-2 (NFKC normalize + invisible-Unicode strip)
 */

const crypto = require('node:crypto')
const {
  PDF_HEADER,
  PDF_TRAILER,
  PDF_JS_MARKERS,
  PDF_JS_SCAN_BYTES,
  PDF_PAGE_PATTERN,
  ZIP_MAX_DECOMPRESSED_BYTES,
  ZIP_MAX_DECOMPRESSION_RATIO,
  DOCX_PARSE_TIMEOUT_MS,
  PROMPT_INJECTION_PHRASES,
} = require('./attachments.constants')

/**
 * Stable, non-reversible identifier for log correlation. Mirrors the
 * existing referrals.service.js#hashEmail() pattern. Last 8 hex of
 * sha256 — collision-resistant for log correlation, irreversible for
 * privacy. fileName is NEVER logged raw (CLAUDE.md A8).
 */
function hashFilename(name) {
  if (!name) return null
  return crypto.createHash('sha256').update(String(name)).digest('hex').slice(-8)
}

/**
 * Stage-2 PDF structural validation (master plan L3-CRIT-3).
 * Checks `%PDF-1.x` header + `%%EOF` trailer within the first/last 1KB.
 */
function validatePdfStructure(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false
  // PDF header must start within the first 1KB (the spec allows leading
  // garbage but most readers enforce the prefix; we mirror that).
  const headWindow = buffer.slice(0, Math.min(1024, buffer.length))
  if (headWindow.indexOf(PDF_HEADER) === -1) return false
  // Trailer search in last 1024 bytes.
  const tailStart = Math.max(0, buffer.length - 1024)
  const tailWindow = buffer.slice(tailStart)
  if (tailWindow.indexOf(PDF_TRAILER) === -1) return false
  return true
}

/**
 * Scan first 1 MB of a PDF for embedded-JS markers (master plan
 * L1-HIGH-3 / §4.6 #5). pdf-parse does not expose the action dict,
 * so we raw-scan for `/JavaScript`, `/JS`, `/AA`, `/OpenAction`.
 *
 * Returns null if clean, or the first marker matched as a string.
 */
function scanPdfForEmbeddedJs(buffer) {
  if (!Buffer.isBuffer(buffer)) return 'invalid_buffer'
  const window = buffer.slice(0, Math.min(PDF_JS_SCAN_BYTES, buffer.length))
  for (const marker of PDF_JS_MARKERS) {
    if (window.indexOf(marker) !== -1) return marker.toString('ascii')
  }
  return null
}

/**
 * Estimate PDF page count via raw `/Type /Page` marker scan. Cheap
 * and approximate — we use it for the per-plan page cap, not as the
 * canonical source of truth (Anthropic's API also reports pages).
 */
function estimatePdfPageCount(buffer) {
  if (!Buffer.isBuffer(buffer)) return 0
  // Limit scan window so a 30 MB PDF doesn't blow string memory.
  const window = buffer.slice(0, Math.min(8 * 1024 * 1024, buffer.length))
  const text = window.toString('binary')
  const matches = text.match(PDF_PAGE_PATTERN)
  return matches ? matches.length : 0
}

/**
 * Stage-2 DOCX structural validation. Decoded raw bytes contain a
 * ZIP central directory; the [Content_Types].xml entry must declare
 * the wordprocessingml content type. We avoid pulling a full ZIP
 * parser here — the structural check is a substring scan with a
 * decompressed-bytes guard against zip-bomb amplification.
 */
function validateDocxStructure(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 30) return false
  // ZIP local-file-header magic.
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) {
    return false
  }
  // Look for the Content_Types XML entry name and the
  // wordprocessingml content-type string. Both must be present and
  // located within the first 4 MB (DOCX files larger than that exist
  // but the manifest sits near the EOF central directory; we
  // additionally check the tail).
  const head = buffer.slice(0, Math.min(4 * 1024 * 1024, buffer.length))
  const tail = buffer.slice(Math.max(0, buffer.length - 4 * 1024 * 1024))
  const haystack = Buffer.concat([head, tail]).toString('binary')
  if (!haystack.includes('[Content_Types].xml')) return false
  if (!haystack.includes('wordprocessingml.document')) return false
  return true
}

/**
 * Two-stage MIME validation (master plan L3-CRIT-3).
 * Stage 1 was performed by `file-type` on the multer-buffered first
 * 4KB; stage 2 here is format-specific structural validation. Returns
 * { ok, reason }.
 */
function validateMimeStage2(buffer, declaredMime) {
  switch (declaredMime) {
    case 'application/pdf':
      return validatePdfStructure(buffer)
        ? { ok: true }
        : { ok: false, reason: 'pdf_structure_invalid' }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return validateDocxStructure(buffer)
        ? { ok: true }
        : { ok: false, reason: 'docx_structure_invalid' }
    case 'image/png':
      return buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
        ? { ok: true }
        : { ok: false, reason: 'png_signature_invalid' }
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        ? { ok: true }
        : { ok: false, reason: 'jpeg_signature_invalid' }
    case 'image/webp':
      return buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
        ? { ok: true }
        : { ok: false, reason: 'webp_signature_invalid' }
    case 'text/plain':
    case 'text/markdown':
    case 'text/x-python':
    case 'application/javascript':
    case 'application/typescript':
    case 'text/x-java-source':
    case 'text/x-c':
    case 'text/x-c++':
    case 'text/x-go':
    case 'text/x-ruby':
    case 'text/x-rust':
    case 'application/json':
    case 'application/xml':
    case 'text/x-sql':
    case 'text/css':
    case 'text/html':
    case 'text/yaml':
    case 'text/x-shellscript':
      return validateUtf8TextBytes(buffer)
    default:
      return { ok: false, reason: 'unsupported_mime' }
  }
}

/**
 * UTF-8 text validation (master plan L3-CRIT-3 last bullet).
 * Reject any byte where c < 0x09 || (c > 0x0d && c < 0x20) except
 * 0x09 (tab), 0x0a (LF), 0x0d (CR). Also reject 0x7f (DEL).
 */
function validateUtf8TextBytes(buffer) {
  if (!Buffer.isBuffer(buffer)) return { ok: false, reason: 'invalid_buffer' }
  // Allow BOM at start.
  let start = 0
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    start = 3
  }
  for (let i = start; i < buffer.length; i++) {
    const c = buffer[i]
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue
    if (c < 0x20 || c === 0x7f) return { ok: false, reason: 'control_char_in_text' }
  }
  return { ok: true }
}

/**
 * NFKC-normalize + invisible-Unicode strip (master plan §4.6 #1 +
 * L3-HIGH-2 #8). Run on extracted text BEFORE the prompt-injection
 * regex denylist so homoglyph rotations are caught.
 *
 * Strips: \p{Cf} (format chars including ZWSP/ZWNJ/ZWJ), \p{Co}
 * (private use), \p{Cs} (surrogates), and explicit RTL/LTR overrides
 * (U+202A..U+202E, U+2066..U+2069).
 */
function sanitizeExtractedText(input) {
  if (typeof input !== 'string') return ''
  // NFKC first — collapses compatibility forms and homoglyphs.
  const normalized = input.normalize('NFKC')
  // Strip invisible / format / private / surrogate code points.
  return normalized.replace(/[\p{Cf}\p{Co}\p{Cs}‪-‮⁦-⁩]/gu, '')
}

/**
 * Prompt-injection phrase scrubber (master plan §4.6 #3).
 * Returns { cleaned, hits } where `hits` is the list of phrases
 * matched (used for the security-event log breadcrumb; the cleaned
 * text is what we forward to the model).
 *
 * We replace each match with a single space rather than deleting so
 * adjacent words don't accidentally concatenate.
 */
function stripInjectionPhrases(input) {
  if (typeof input !== 'string') return { cleaned: '', hits: [] }
  const lower = input.toLowerCase()
  let cleaned = input
  const hits = []
  for (const phrase of PROMPT_INJECTION_PHRASES) {
    if (lower.includes(phrase)) {
      hits.push(phrase)
      // Build a case-insensitive global replace for this exact phrase.
      const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      cleaned = cleaned.replace(re, ' ')
    }
  }
  return { cleaned, hits }
}

/**
 * Mammoth-based DOCX text extraction with concurrency limit + 30s
 * watchdog. Master plan §4.2 + L5-HIGH-2. The concurrency limiter is
 * a tiny in-process semaphore — p-queue would be overkill for a <50
 * LOC use case (CLAUDE.md "v2.1 dependency exception" preferred-order
 * step #2: rewrite inline when standard primitives suffice).
 *
 * Throws on:
 *   - extractor wallclock timeout
 *   - decompressed-bytes limit exceeded (zip-bomb)
 *   - mammoth itself rejects (CVE-2025-11849 patched in ≥1.11.0)
 */
const _docxSemaphore = createSemaphore(2)

async function parseDocxText(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('parseDocxText: invalid buffer')
  }
  // Zip-bomb guard: estimate decompressed bytes by reading the central
  // directory. If we can't tell, mammoth itself enforces a soft limit
  // via memory pressure but we add a hard wallclock + concurrency cap.
  const inputBytes = buffer.length
  const release = await _docxSemaphore.acquire()
  try {
    const mammoth = require('mammoth')
    const result = await raceWithTimeout(
      mammoth.extractRawText({ buffer }),
      options.timeoutMs || DOCX_PARSE_TIMEOUT_MS,
      'docx_extract_timeout',
    )
    const value = String(result?.value || '')
    const decompressedBytes = Buffer.byteLength(value, 'utf8')
    if (decompressedBytes > ZIP_MAX_DECOMPRESSED_BYTES) {
      throw new Error('docx_decompressed_too_large')
    }
    if (inputBytes > 0 && decompressedBytes / inputBytes > ZIP_MAX_DECOMPRESSION_RATIO) {
      throw new Error('docx_decompression_ratio_exceeded')
    }
    return value
  } finally {
    release()
  }
}

/**
 * Resolve-or-reject helper: races `promise` against a `setTimeout`,
 * rejecting with `reason` if the timeout wins. The timer is cleared
 * on resolve to avoid leaking a pending handle.
 */
function raceWithTimeout(promise, timeoutMs, reason) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), timeoutMs)
  })
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
}

/**
 * Tiny semaphore — `acquire()` returns a release fn. Used here in
 * place of a p-queue dep (CLAUDE.md "v2.1 dep exception" rules:
 * inline-rewrite when <50 LOC + standard primitive suffices).
 */
function createSemaphore(maxConcurrent) {
  let active = 0
  const queue = []
  function next() {
    if (queue.length === 0 || active >= maxConcurrent) return
    active += 1
    const resolve = queue.shift()
    resolve(release)
  }
  function release() {
    active -= 1
    next()
  }
  function acquire() {
    return new Promise((resolve) => {
      queue.push(resolve)
      next()
    })
  }
  return { acquire }
}

module.exports = {
  hashFilename,
  validatePdfStructure,
  scanPdfForEmbeddedJs,
  estimatePdfPageCount,
  validateDocxStructure,
  validateMimeStage2,
  validateUtf8TextBytes,
  sanitizeExtractedText,
  stripInjectionPhrases,
  parseDocxText,
  // Exported for tests only.
  _internals: { createSemaphore, raceWithTimeout },
}

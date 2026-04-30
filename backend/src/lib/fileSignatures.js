const fs = require('node:fs')
const path = require('node:path')

function bytesToAscii(buffer, start = 0, end = buffer.length) {
  return buffer.subarray(start, end).toString('ascii')
}

function detectBufferSignature(input) {
  const head = Buffer.isBuffer(input)
    ? input.subarray(0, 32)
    : Buffer.from(input || '').subarray(0, 32)

  if (head.length >= 5 && bytesToAscii(head, 0, 5) === '%PDF-') {
    return { mime: 'application/pdf', type: 'pdf' }
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: 'image/jpeg', type: 'image' }
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    bytesToAscii(head, 1, 4) === 'PNG' &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return { mime: 'image/png', type: 'image' }
  }
  if (head.length >= 6) {
    const gifHeader = bytesToAscii(head, 0, 6)
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return { mime: 'image/gif', type: 'image' }
    }
  }
  if (
    head.length >= 12 &&
    bytesToAscii(head, 0, 4) === 'RIFF' &&
    bytesToAscii(head, 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', type: 'image' }
  }
  if (head.length >= 12 && bytesToAscii(head, 4, 8) === 'ftyp') {
    const brand = bytesToAscii(head, 8, 12).toLowerCase()
    if (brand === 'avif') return { mime: 'image/avif', type: 'image' }
    return { mime: 'video/mp4', type: 'video' }
  }
  if (head.length >= 8 && bytesToAscii(head, 4, 8) === 'moov') {
    return { mime: 'video/mp4', type: 'video' }
  }
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    return { mime: 'video/webm', type: 'video' }
  }
  // ZIP-based formats (DOCX, XLSX, PPTX, plain ZIP)
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    return { mime: 'application/zip', type: 'archive' }
  }

  return null
}

function detectFileSignature(filePath) {
  const resolvedPath = path.resolve(String(filePath || ''))
  const buffer = Buffer.alloc(32)
  let fd

  try {
    fd = fs.openSync(resolvedPath, 'r')
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    const head = buffer.subarray(0, bytesRead)

    return detectBufferSignature(head)
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // Ignore close errors while returning best-effort signature detection.
      }
    }
  }
}

// MIME types that share the same magic bytes (ZIP-based Office formats)
const ZIP_COMPATIBLE_MIMES = new Set([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const MP4_COMPATIBLE_MIMES = new Set(['video/mp4', 'video/quicktime'])

function isSignatureCompatible(detectedMime, declaredMime) {
  if (detectedMime === declaredMime) return true
  if (detectedMime === 'image/jpeg' && declaredMime === 'image/jpg') return true
  if (detectedMime === 'application/zip' && ZIP_COMPATIBLE_MIMES.has(declaredMime)) return true
  if (detectedMime === 'video/mp4' && MP4_COMPATIBLE_MIMES.has(declaredMime)) return true
  return false
}

function signatureMatchesAnyExpected(detectedMime, expectedMimes = []) {
  const normalizedExpected = new Set(
    expectedMimes.map((value) => String(value || '').toLowerCase()).filter(Boolean),
  )
  return (
    normalizedExpected.size === 0 ||
    normalizedExpected.has(detectedMime) ||
    Array.from(normalizedExpected).some((expected) => isSignatureCompatible(detectedMime, expected))
  )
}

function validateMagicBytes(filePath, declaredMimeType) {
  const detected = detectFileSignature(filePath)
  const declared = String(declaredMimeType || '').toLowerCase()

  if (!detected) {
    return { valid: false, detectedType: null, declaredType: declared }
  }

  if (isSignatureCompatible(detected.mime, declared)) {
    return { valid: true, detectedType: detected.mime, declaredType: declared }
  }

  return { valid: false, detectedType: detected.mime, declaredType: declared }
}

function validateMagicBytesFromBuffer(buffer, declaredMimeType) {
  const detected = detectBufferSignature(buffer)
  const declared = String(declaredMimeType || '').toLowerCase()

  if (!detected) {
    return { valid: false, detectedType: null, declaredType: declared }
  }

  if (isSignatureCompatible(detected.mime, declared)) {
    return { valid: true, detectedType: detected.mime, declaredType: declared }
  }

  return { valid: false, detectedType: detected.mime, declaredType: declared }
}

function signatureMatchesExpected(filePath, expectedMimes = []) {
  const detected = detectFileSignature(filePath)
  if (!detected) {
    return {
      ok: false,
      detected: null,
    }
  }

  return {
    ok: signatureMatchesAnyExpected(detected.mime, expectedMimes),
    detected,
  }
}

function signatureMatchesExpectedFromBuffer(buffer, expectedMimes = []) {
  const detected = detectBufferSignature(buffer)
  if (!detected) {
    return {
      ok: false,
      detected: null,
    }
  }

  return {
    ok: signatureMatchesAnyExpected(detected.mime, expectedMimes),
    detected,
  }
}

/**
 * Basic SVG content safety check — rejects SVGs containing script execution
 * vectors (inline scripts, event handlers, javascript: URIs, external data
 * loading). SVG is XML-based so magic-byte detection doesn't apply; instead
 * we scan the text content for dangerous patterns.
 */
const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /\bon\w+\s*=/i, // onclick=, onerror=, onload=, etc.
  /javascript\s*:/i, // javascript: URIs
  /data\s*:\s*text\/html/i, // data:text/html embeds
  /<foreignObject[\s>]/i, // can embed arbitrary HTML
  /<iframe[\s>]/i,
  /<embed[\s>]/i,
  /<object[\s>]/i,
]

function validateSvgContent(filePath) {
  try {
    const content = fs.readFileSync(path.resolve(String(filePath || '')), 'utf8')

    // Must look like an SVG (starts with XML declaration or <svg)
    const trimmed = content.trimStart()
    if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<svg')) {
      return { safe: false, reason: 'File does not appear to be a valid SVG.' }
    }

    for (const pattern of SVG_DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        return {
          safe: false,
          reason: `SVG contains potentially dangerous content: ${pattern.source}`,
        }
      }
    }

    return { safe: true, reason: null }
  } catch {
    return { safe: false, reason: 'Could not read SVG file.' }
  }
}

module.exports = {
  detectBufferSignature,
  detectFileSignature,
  signatureMatchesExpectedFromBuffer,
  signatureMatchesExpected,
  validateMagicBytesFromBuffer,
  validateMagicBytes,
  validateSvgContent,
}

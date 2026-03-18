const fs = require('node:fs')
const path = require('node:path')

function bytesToAscii(buffer, start = 0, end = buffer.length) {
  return buffer.subarray(start, end).toString('ascii')
}

function detectFileSignature(filePath) {
  const resolvedPath = path.resolve(String(filePath || ''))
  const buffer = Buffer.alloc(32)
  let fd

  try {
    fd = fs.openSync(resolvedPath, 'r')
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    const head = buffer.subarray(0, bytesRead)

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

    return null
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

function signatureMatchesExpected(filePath, expectedMimes = []) {
  const detected = detectFileSignature(filePath)
  if (!detected) {
    return {
      ok: false,
      detected: null,
    }
  }

  const normalizedExpected = new Set(
    expectedMimes
      .map((value) => String(value || '').toLowerCase())
      .filter(Boolean),
  )

  return {
    ok: normalizedExpected.size === 0 || normalizedExpected.has(detected.mime),
    detected,
  }
}

module.exports = {
  detectFileSignature,
  signatureMatchesExpected,
}

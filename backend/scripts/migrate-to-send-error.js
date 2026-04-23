#!/usr/bin/env node
/**
 * migrate-to-send-error.js — one-shot codemod for Day 3 of the tech-debt week.
 *
 * Rewrites `res.status(XXX).json({ error: '...' })` → `sendError(res, XXX, '...', ERROR_CODES.Y)`
 * and inserts the `sendError` import if absent. Supports:
 *
 *  - inline:    res.status(400).json({ error: 'x' })
 *  - `return` prefix: return res.status(400).json({ error: 'x' })
 *  - multi-line error body with { error: '...' } on its own line
 *  - object with extra fields (code, details, etc.) → passed as 5th arg
 *
 * Skips files that already look fully migrated (no raw `res.status(4xx|5xx).json({ error`).
 *
 * Usage: node scripts/migrate-to-send-error.js <file1> <file2> ...
 */

const fs = require('fs')

const STATUS_TO_CODE = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION',
  422: 'VALIDATION',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  502: 'INTERNAL',
  503: 'INTERNAL',
  504: 'INTERNAL',
}

function codeFor(status) {
  return STATUS_TO_CODE[status] || 'INTERNAL'
}

function rewriteFile(file) {
  const orig = fs.readFileSync(file, 'utf8')
  let src = orig
  let changes = 0

  // Pattern 1: single-line — res.status(XXX).json({ error: 'msg' })
  // Allow leading `return ` / whitespace / `.await/` etc. — we only touch the res.status... segment.
  const singleLine = /res\.status\((\d{3})\)\.json\(\{\s*error:\s*('[^']*'|"[^"]*"|`[^`]*`)\s*\}\)/g
  src = src.replace(singleLine, (match, status, msg) => {
    changes++
    return `sendError(res, ${status}, ${msg}, ERROR_CODES.${codeFor(Number(status))})`
  })

  // Pattern 2: single-line with code — res.status(XXX).json({ error: 'msg', code: 'X' })
  const withCode =
    /res\.status\((\d{3})\)\.json\(\{\s*error:\s*('[^']*'|"[^"]*"|`[^`]*`)\s*,\s*code:\s*('[^']*'|"[^"]*")\s*\}\)/g
  src = src.replace(withCode, (match, status, msg, code) => {
    changes++
    return `sendError(res, ${status}, ${msg}, ${code})`
  })

  // Pattern 3: multiline — res.status(XXX).json({\n  error: 'msg',\n  ...extra fields\n})
  // Captures the multiline object and converts to sendError with extras.
  const multiline = /res\.status\((\d{3})\)\.json\(\{\s*\n([\s\S]*?)\}\)/g
  src = src.replace(multiline, (match, status, body) => {
    // Parse key:value pairs. Must contain `error:`; other keys become extras.
    const pairs = body
      .split(/,\s*\n/)
      .map((line) => line.trim().replace(/,\s*$/, ''))
      .filter(Boolean)

    const errorLine = pairs.find((p) => /^error\s*:/.test(p))
    if (!errorLine) return match // not a { error: ... } shape — leave alone

    const errorValue = errorLine.replace(/^error\s*:\s*/, '')
    const codeLine = pairs.find((p) => /^code\s*:/.test(p))
    let code
    if (codeLine) {
      code = codeLine.replace(/^code\s*:\s*/, '')
    } else {
      code = `ERROR_CODES.${codeFor(Number(status))}`
    }

    const extraPairs = pairs.filter((p) => !/^error\s*:/.test(p) && !/^code\s*:/.test(p))
    changes++
    if (extraPairs.length === 0) {
      return `sendError(res, ${status}, ${errorValue}, ${code})`
    }
    return `sendError(res, ${status}, ${errorValue}, ${code}, {\n${extraPairs.map((p) => '  ' + p).join(',\n')}\n})`
  })

  if (changes === 0) {
    return { file, changes: 0 }
  }

  // Insert import if not present
  if (!/require\(['"][^'"]*errorEnvelope['"]\)/.test(src)) {
    // Find last require() at top of file
    const requireLines = src.match(/^(?:const|let|var)\s+.*?=\s*require\([^)]+\)\s*;?\s*$/gm) || []
    if (requireLines.length > 0) {
      const lastRequire = requireLines[requireLines.length - 1]
      const idx = src.indexOf(lastRequire) + lastRequire.length
      src =
        src.slice(0, idx) +
        "\nconst { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')" +
        src.slice(idx)
    } else {
      src = "const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')\n" + src
    }
  }

  fs.writeFileSync(file, src, 'utf8')
  return { file, changes }
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node scripts/migrate-to-send-error.js <file1> [file2 ...]')
  process.exit(1)
}

let total = 0
for (const f of files) {
  const { file, changes } = rewriteFile(f)
  console.log(`${changes.toString().padStart(3)}  ${file}`)
  total += changes
}
console.log(`---\n${total} total rewrites`)

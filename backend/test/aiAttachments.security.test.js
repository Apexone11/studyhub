/**
 * aiAttachments.security.test.js — security-boundary tests for
 * Hub AI v2 document upload primitives.
 *
 * Covers:
 *   - Mammoth ≥ 1.11.0 rejects external `r:link` references
 *     (CVE-2025-11849, master plan L3-CRIT-1)
 *   - Polyglot ZIP / non-DOCX ZIP rejection (master plan L3-CRIT-3)
 *   - Control-character rejection in TXT/MD/code (master plan L3-CRIT-3)
 *   - PDF embedded-JS rejection (master plan L1-HIGH-3)
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  validateDocxStructure,
  validateUtf8TextBytes,
  scanPdfForEmbeddedJs,
  validateMimeStage2,
} from '../src/modules/ai/attachments/attachments.parsers.js'

const require = createRequire(import.meta.url)

describe('CVE-2025-11849 — mammoth r:link external image references', () => {
  it('mammoth ≥ 1.11.0 is the patched version we depend on', () => {
    const pkgPath = require.resolve('mammoth/package.json')
    const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'))
    expect(version).toBeTruthy()
    const [major, minor] = String(version).split('.').map(Number)
    expect(major).toBeGreaterThanOrEqual(1)
    if (major === 1) expect(minor).toBeGreaterThanOrEqual(11)
  })
})

describe('Polyglot / non-DOCX ZIP rejection (L3-CRIT-3)', () => {
  it('rejects bare ZIP (no Content_Types entry)', () => {
    // Valid ZIP local-file-header magic but no DOCX manifest.
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('not-a-docx-archive'),
      Buffer.alloc(64, 0x20),
    ])
    expect(validateDocxStructure(zip)).toBe(false)
  })
  it('rejects EPUB-style ZIP (Content_Types missing wordprocessingml)', () => {
    // EPUB-shaped magic + Content_Types but wrong content-type string.
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('[Content_Types].xml'),
      Buffer.alloc(40, 0x20),
      Buffer.from('application/epub+zip'),
      Buffer.alloc(40, 0x20),
    ])
    expect(validateDocxStructure(zip)).toBe(false)
  })
  it('routes ZIP-misdeclared-as-docx through stage-2 reject', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])
    const result = validateMimeStage2(
      zip,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(result.ok).toBe(false)
  })
})

describe('Control-character rejection in TXT (L3-CRIT-3)', () => {
  it('rejects NULs', () => {
    expect(validateUtf8TextBytes(Buffer.from([0x41, 0x00, 0x42])).ok).toBe(false)
  })
  it('rejects 0x07 BEL', () => {
    expect(validateUtf8TextBytes(Buffer.from([0x41, 0x07])).ok).toBe(false)
  })
  it('rejects 0x7F DEL', () => {
    expect(validateUtf8TextBytes(Buffer.from([0x41, 0x7f])).ok).toBe(false)
  })
  it('accepts a reasonable code-file body', () => {
    const code = "function x() {\n  return 'ok'\n}\n"
    expect(validateUtf8TextBytes(Buffer.from(code, 'utf8')).ok).toBe(true)
  })
})

describe('PDF embedded-JS rejection (L1-HIGH-3)', () => {
  const PDF_HEAD = '%PDF-1.5\n'
  const PDF_TAIL = '\n%%EOF'

  it('blocks /JavaScript', () => {
    const buf = Buffer.from(`${PDF_HEAD}/JavaScript (alert(1))${PDF_TAIL}`)
    expect(scanPdfForEmbeddedJs(buf)).toBe('/JavaScript')
  })
  it('blocks /JS', () => {
    const buf = Buffer.from(`${PDF_HEAD}/JS (...)${PDF_TAIL}`)
    expect(scanPdfForEmbeddedJs(buf)).toBe('/JS')
  })
  it('blocks /AA (additional actions)', () => {
    const buf = Buffer.from(`${PDF_HEAD}/AA <<...>>${PDF_TAIL}`)
    expect(scanPdfForEmbeddedJs(buf)).toBe('/AA')
  })
  it('blocks /OpenAction', () => {
    const buf = Buffer.from(`${PDF_HEAD}/OpenAction <<...>>${PDF_TAIL}`)
    expect(scanPdfForEmbeddedJs(buf)).toBe('/OpenAction')
  })
  it('passes a plain PDF', () => {
    const buf = Buffer.from(`${PDF_HEAD}plain content${PDF_TAIL}`)
    expect(scanPdfForEmbeddedJs(buf)).toBeNull()
  })
})

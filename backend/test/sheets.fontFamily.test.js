import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHEET_FONT_FAMILY,
  SHEET_FONT_FAMILIES,
  parseSheetFontFamily,
} from '../src/modules/sheets/sheets.constants'

describe('parseSheetFontFamily', () => {
  it('accepts every allowlisted font', () => {
    for (const font of SHEET_FONT_FAMILIES) {
      expect(parseSheetFontFamily(font)).toEqual({ value: font })
    }
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(parseSheetFontFamily('  SERIF ')).toEqual({ value: 'serif' })
    expect(parseSheetFontFamily('Mono')).toEqual({ value: 'mono' })
  })

  it('defaults when the field is absent so older clients keep working', () => {
    expect(parseSheetFontFamily(undefined)).toEqual({ value: DEFAULT_SHEET_FONT_FAMILY })
    expect(parseSheetFontFamily(null)).toEqual({ value: DEFAULT_SHEET_FONT_FAMILY })
    expect(parseSheetFontFamily('')).toEqual({ value: DEFAULT_SHEET_FONT_FAMILY })
  })

  it('rejects anything outside the allowlist instead of storing it', () => {
    // A CSS payload must never reach the column — the caller turns this
    // into a 400 (CLAUDE.md A13).
    expect(parseSheetFontFamily('comic sans')).toEqual({ error: true })
    expect(parseSheetFontFamily('serif; }')).toEqual({ error: true })
    expect(parseSheetFontFamily('<script>')).toEqual({ error: true })
    expect(parseSheetFontFamily(42)).toEqual({ error: true })
    expect(parseSheetFontFamily({})).toEqual({ error: true })
  })

  it('keeps the allowlist to the three documented values', () => {
    expect([...SHEET_FONT_FAMILIES]).toEqual(['sans', 'serif', 'mono'])
    expect(DEFAULT_SHEET_FONT_FAMILY).toBe('sans')
  })
})

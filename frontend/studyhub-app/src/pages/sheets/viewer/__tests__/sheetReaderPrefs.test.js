/**
 * sheetReaderPrefs.test.js — reader preference persistence + CSS mapping.
 *
 * These values end up as CSS custom properties on the sheet content
 * wrapper, so a corrupt localStorage entry must never produce `undefined`
 * in a style object.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_READER_PREFS,
  readerClassNameFor,
  readerPrefsToStyle,
  readReaderPrefs,
  normalizeReaderPrefs,
  writeReaderPrefs,
} from '../sheetReaderPrefs'

const STORAGE_KEY = 'studyhub.sheets.readerPrefs'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('normalizeReaderPrefs', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeReaderPrefs(null)).toEqual(DEFAULT_READER_PREFS)
    expect(normalizeReaderPrefs('nope')).toEqual(DEFAULT_READER_PREFS)
    expect(normalizeReaderPrefs({ size: 'enormous' })).toEqual(DEFAULT_READER_PREFS)
  })

  it('keeps recognized values and defaults the rest', () => {
    expect(normalizeReaderPrefs({ size: 'l', width: 'bogus' })).toEqual({
      ...DEFAULT_READER_PREFS,
      size: 'l',
    })
  })
})

describe('readReaderPrefs / writeReaderPrefs', () => {
  it('round-trips a preference set', () => {
    writeReaderPrefs({ size: 'l', width: 'wide', leading: 'relaxed' })
    expect(readReaderPrefs()).toEqual({ size: 'l', width: 'wide', leading: 'relaxed' })
  })

  it('returns defaults when nothing is stored', () => {
    expect(readReaderPrefs()).toEqual(DEFAULT_READER_PREFS)
  })

  it('returns defaults when the stored value is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(readReaderPrefs()).toEqual(DEFAULT_READER_PREFS)
  })
})

describe('readerPrefsToStyle', () => {
  it('emits all three custom properties with real values', () => {
    const style = readerPrefsToStyle({ size: 'l', width: 'narrow', leading: 'relaxed' })
    expect(style['--sheet-reader-size']).toBe('1.12rem')
    expect(style['--sheet-reader-width']).toBe('58ch')
    expect(style['--sheet-reader-lh']).toBe('1.85')
  })

  it('never emits undefined for a corrupt preference set', () => {
    const style = readerPrefsToStyle({ size: 'huge', width: null, leading: 7 })
    for (const value of Object.values(style)) {
      expect(value).toBeTruthy()
    }
  })
})

describe('readerClassNameFor', () => {
  it('maps each author font to its modifier class', () => {
    expect(readerClassNameFor('serif')).toBe('sh-sheet-reader sh-sheet-reader--serif')
    expect(readerClassNameFor('mono')).toBe('sh-sheet-reader sh-sheet-reader--mono')
    expect(readerClassNameFor('sans')).toBe('sh-sheet-reader sh-sheet-reader--sans')
  })

  it('falls back to sans for an unknown or missing font', () => {
    expect(readerClassNameFor(undefined)).toBe('sh-sheet-reader sh-sheet-reader--sans')
    expect(readerClassNameFor('papyrus')).toBe('sh-sheet-reader sh-sheet-reader--sans')
  })
})

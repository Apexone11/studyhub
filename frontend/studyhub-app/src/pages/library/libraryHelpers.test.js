/**
 * libraryHelpers.test.js — Vitest coverage for the format-availability
 * helpers added in Library Phase A (wave-12.2 2026-05-16).
 *
 * The helpers feed the new BookCard badge rendering so users can see
 * at a glance which Google Books volumes have a PDF, EPUB, or full
 * public-domain availability.
 */
import { describe, it, expect } from 'vitest'
import {
  hasPdf,
  hasEpub,
  isPublicDomainFull,
  hasPreview,
  getBookCover,
  getAuthorNames,
  formatPageCount,
  truncateText,
} from './libraryHelpers'

describe('hasPdf', () => {
  it('returns true when book.pdfAvailable is true', () => {
    expect(hasPdf({ pdfAvailable: true })).toBe(true)
  })
  it('returns false when pdfAvailable is missing or false', () => {
    expect(hasPdf({})).toBe(false)
    expect(hasPdf({ pdfAvailable: false })).toBe(false)
    expect(hasPdf(null)).toBe(false)
    expect(hasPdf(undefined)).toBe(false)
  })
})

describe('hasEpub', () => {
  it('returns true when book.epubAvailable is true', () => {
    expect(hasEpub({ epubAvailable: true })).toBe(true)
  })
  it('returns false otherwise', () => {
    expect(hasEpub({})).toBe(false)
    expect(hasEpub({ epubAvailable: false })).toBe(false)
    expect(hasEpub(null)).toBe(false)
  })
})

describe('isPublicDomainFull', () => {
  it('returns true when publicDomain flag is true', () => {
    expect(isPublicDomainFull({ publicDomain: true })).toBe(true)
  })
  it('returns true when accessViewStatus === FULL_PUBLIC_DOMAIN', () => {
    expect(isPublicDomainFull({ accessViewStatus: 'FULL_PUBLIC_DOMAIN' })).toBe(true)
  })
  it('returns true when both signals agree', () => {
    expect(isPublicDomainFull({ publicDomain: true, accessViewStatus: 'FULL_PUBLIC_DOMAIN' })).toBe(
      true,
    )
  })
  it('returns false on SAMPLE or NONE', () => {
    expect(isPublicDomainFull({ accessViewStatus: 'SAMPLE' })).toBe(false)
    expect(isPublicDomainFull({ accessViewStatus: 'NONE' })).toBe(false)
  })
  it('returns false on missing book or empty object', () => {
    expect(isPublicDomainFull(null)).toBe(false)
    expect(isPublicDomainFull({})).toBe(false)
  })
})

describe('hasPreview', () => {
  it('requires embeddable=true AND viewability !== NO_PAGES', () => {
    expect(hasPreview({ embeddable: true, viewability: 'PARTIAL' })).toBe(true)
    expect(hasPreview({ embeddable: true, viewability: 'NO_PAGES' })).toBe(false)
    expect(hasPreview({ embeddable: false, viewability: 'PARTIAL' })).toBe(false)
    expect(hasPreview(null)).toBe(false)
  })
})

describe('getBookCover', () => {
  it('upgrades http to https for Google Books URLs', () => {
    expect(
      getBookCover({
        coverUrl: 'http://books.google.com/books/content?id=abc',
      }),
    ).toBe('https://books.google.com/books/content?id=abc')
  })
  it('passes through https URLs unchanged', () => {
    expect(getBookCover({ coverUrl: 'https://example.com/cover.jpg' })).toBe(
      'https://example.com/cover.jpg',
    )
  })
  it('returns null when no cover', () => {
    expect(getBookCover({})).toBeNull()
    expect(getBookCover(null)).toBeNull()
  })
})

describe('getAuthorNames', () => {
  it('joins authors with commas', () => {
    expect(getAuthorNames({ authors: ['Alice', 'Bob'] })).toBe('Alice, Bob')
  })
  it('returns "Unknown Author" when missing', () => {
    expect(getAuthorNames({})).toBe('Unknown Author')
    expect(getAuthorNames({ authors: [] })).toBe('Unknown Author')
    expect(getAuthorNames(null)).toBe('Unknown Author')
  })
})

describe('formatPageCount', () => {
  it('returns "Unknown length" for missing or non-positive counts', () => {
    expect(formatPageCount(0)).toBe('Unknown length')
    expect(formatPageCount(-1)).toBe('Unknown length')
    expect(formatPageCount(undefined)).toBe('Unknown length')
  })
  it('formats positive counts', () => {
    expect(formatPageCount(250)).toBe('250 pages')
  })
})

describe('truncateText', () => {
  it('returns the text unchanged when within the limit', () => {
    expect(truncateText('Hello', 100)).toBe('Hello')
  })
  it('truncates at word boundary with ellipsis', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const out = truncateText(text, 20)
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(23) // 20 + '...'
  })
})

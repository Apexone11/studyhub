/**
 * readingTime.test.js — Vitest coverage for the reading-time estimator
 * (Bucket C7, wave-12.2). Powers the "X min read" chip on sheet/note cards.
 */
import { describe, it, expect } from 'vitest'
import { estimateReadingMinutes, formatReadingTime } from './readingTime'

describe('estimateReadingMinutes', () => {
  it('returns null for empty / missing input', () => {
    expect(estimateReadingMinutes(null)).toBeNull()
    expect(estimateReadingMinutes(undefined)).toBeNull()
    expect(estimateReadingMinutes('')).toBeNull()
    expect(estimateReadingMinutes('   ')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(estimateReadingMinutes(42)).toBeNull()
    expect(estimateReadingMinutes({})).toBeNull()
  })

  it('floors at 1 minute for short content', () => {
    expect(estimateReadingMinutes('Hello world')).toBe(1)
    expect(estimateReadingMinutes('Just a short note.')).toBe(1)
  })

  it('rounds up — 250 words = 2 min (above the 220 wpm threshold)', () => {
    const text = Array(250).fill('word').join(' ')
    expect(estimateReadingMinutes(text)).toBe(2)
  })

  it('1000 words ≈ 5 min', () => {
    const text = Array(1000).fill('word').join(' ')
    expect(estimateReadingMinutes(text)).toBe(5)
  })

  it('strips HTML tags before counting words', () => {
    // 5 words inside tags. Without strip would count something else.
    const html = '<p>Hello <strong>world from</strong> <em>StudyHub</em> now</p>'
    expect(estimateReadingMinutes(html)).toBe(1)
  })

  it('normalizes whitespace from messy HTML', () => {
    const html = '<div>\n\n   one   two\t\tthree   </div>'
    expect(estimateReadingMinutes(html)).toBe(1)
  })
})

describe('formatReadingTime', () => {
  it('returns null when estimate is null', () => {
    expect(formatReadingTime('')).toBeNull()
  })
  it('formats as "X min read"', () => {
    expect(formatReadingTime('hello world')).toBe('1 min read')
    const text = Array(500).fill('word').join(' ')
    expect(formatReadingTime(text)).toBe('3 min read')
  })
})

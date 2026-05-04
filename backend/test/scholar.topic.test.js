/**
 * scholar.topic.test.js — Unit tests for scholar topic feed validators.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const controller = require('../src/modules/scholar/scholar.topic.controller')

describe('scholar.topic.controller — _validateSlug', () => {
  it('accepts lowercase alphanumeric + hyphen slugs', () => {
    expect(controller._validateSlug('machine-learning')).toBe('machine-learning')
    expect(controller._validateSlug('nlp')).toBe('nlp')
    expect(controller._validateSlug('biochem')).toBe('biochem')
  })

  it('lowercases mixed-case input', () => {
    expect(controller._validateSlug('MachineLearning')).toBe('machinelearning')
  })

  it('rejects slugs with leading hyphen', () => {
    expect(controller._validateSlug('-foo')).toBeNull()
  })

  it('rejects slugs with non-allowed chars', () => {
    expect(controller._validateSlug('foo bar')).toBeNull()
    expect(controller._validateSlug('foo/bar')).toBeNull()
    expect(controller._validateSlug('foo_bar')).toBeNull()
  })

  it('rejects empty / null / non-string', () => {
    expect(controller._validateSlug('')).toBeNull()
    expect(controller._validateSlug(null)).toBeNull()
    expect(controller._validateSlug(undefined)).toBeNull()
    expect(controller._validateSlug(42)).toBeNull()
  })

  it('rejects slugs longer than 64 chars', () => {
    expect(controller._validateSlug('a'.repeat(65))).toBeNull()
  })
})

describe('scholar.topic.controller — _validateYear', () => {
  it('returns null for empty input', () => {
    expect(controller._validateYear(undefined)).toBeNull()
    expect(controller._validateYear(null)).toBeNull()
    expect(controller._validateYear('')).toBeNull()
  })

  it('returns the parsed year for in-range input', () => {
    expect(controller._validateYear('2024')).toBe(2024)
    expect(controller._validateYear(2024)).toBe(2024)
  })

  it('returns an error object when out of range', () => {
    const out = controller._validateYear('1800', 'yearFrom')
    expect(out).toEqual({ error: 'yearFrom_out_of_range' })
  })

  it('returns an error object when not an integer', () => {
    const out = controller._validateYear('abc', 'yearTo')
    expect(out).toEqual({ error: 'yearTo_out_of_range' })
  })
})

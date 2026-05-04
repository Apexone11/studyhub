/**
 * scholar.discussions.test.js — Unit tests for scholar discussion
 * controller validators + serializer.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const controller = require('../src/modules/scholar/scholar.discussion.controller')

describe('scholar.discussion.controller — _validatePaperIdParam', () => {
  it('accepts URL-encoded valid DOI', () => {
    expect(controller._validatePaperIdParam(encodeURIComponent('doi:10.1234/foo'))).toBe(
      'doi:10.1234/foo',
    )
  })

  it('accepts arXiv id', () => {
    expect(controller._validatePaperIdParam('arxiv:2401.12345')).toBe('arxiv:2401.12345')
  })

  it('rejects malformed input', () => {
    expect(controller._validatePaperIdParam('')).toBeNull()
    expect(controller._validatePaperIdParam(null)).toBeNull()
    expect(controller._validatePaperIdParam('10.1234/foo')).toBeNull()
  })

  it('rejects ids longer than 256 chars', () => {
    const big = 'doi:10.1234/' + 'a'.repeat(300)
    expect(controller._validatePaperIdParam(big)).toBeNull()
  })
})

describe('scholar.discussion.controller — _stripText', () => {
  it('strips HTML', () => {
    expect(controller._stripText('hi <b>bold</b> text')).toBe('hi bold text')
  })

  it('truncates to 4000 chars', () => {
    expect(controller._stripText('x'.repeat(5000)).length).toBe(4000)
  })

  it('preserves paragraph breaks but normalizes excessive newlines', () => {
    expect(controller._stripText('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('returns empty string for non-string input', () => {
    expect(controller._stripText(null)).toBe('')
    expect(controller._stripText(42)).toBe('')
  })

  it('strips control characters', () => {
    expect(controller._stripText('a\x00b\x01c')).toBe('abc')
  })
})

describe('scholar.discussion.controller — _serializeThread', () => {
  const baseRow = {
    id: 1,
    paperId: 'doi:10.1234/foo',
    authorId: 42,
    body: 'great paper',
    parentId: null,
    deletedAt: null,
    createdAt: new Date('2026-05-04T00:00:00Z'),
    updatedAt: new Date('2026-05-04T00:00:00Z'),
  }
  const author = {
    id: 42,
    username: 'beta_student1',
    displayName: 'Beta Student',
    avatarUrl: '/uploads/avatars/x.png',
  }
  const authorMap = new Map([[42, author]])

  it('serializes full thread with author for any viewer', () => {
    const out = controller._serializeThread(baseRow, 42, authorMap)
    expect(out.body).toBe('great paper')
    expect(out.author.username).toBe('beta_student1')
    expect(out.isOwner).toBe(true)
  })

  it('marks isOwner=false for non-author viewer', () => {
    const out = controller._serializeThread(baseRow, 99, authorMap)
    expect(out.isOwner).toBe(false)
  })

  it('hides body when soft-deleted', () => {
    const deletedRow = { ...baseRow, deletedAt: new Date() }
    const out = controller._serializeThread(deletedRow, 99, authorMap)
    expect(out.body).toBeNull()
    expect(out.deleted).toBe(true)
  })

  it('returns null for null input', () => {
    expect(controller._serializeThread(null, 1, authorMap)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { canReadSheet } from '../src/modules/sheets/sheets.service'

/**
 * S-7: Attachment moderation gating — unit tests
 *
 * Verifies canReadSheet (used by all sheet download/attachment/preview endpoints)
 * correctly gates access based on sheet status + requester role.
 *
 * Post attachment gating uses inline moderationStatus checks — tested via
 * the postAttachmentAccessible helper below.
 */

/* Helper that mirrors the inline check in feed.posts.controller.js */
function postAttachmentAccessible(post, user) {
  const isOwnerOrAdmin = user && (user.userId === post.userId || user.role === 'admin')
  if (!isOwnerOrAdmin && post.moderationStatus !== 'clean') return false
  return true
}

const owner = { userId: 1, role: 'user' }
const admin = { userId: 99, role: 'admin' }
const stranger = { userId: 2, role: 'user' }
const anon = undefined

describe('Sheet attachment access control (canReadSheet)', () => {
  const published = { status: 'published', userId: 1 }
  const draft = { status: 'draft', userId: 1 }
  const pendingReview = { status: 'pending_review', userId: 1 }
  const rejected = { status: 'rejected', userId: 1 }
  const quarantined = { status: 'quarantined', userId: 1 }

  describe('published sheet', () => {
    it('allows anyone', () => {
      expect(canReadSheet(published, stranger)).toBe(true)
      expect(canReadSheet(published, anon)).toBe(true)
      expect(canReadSheet(published, owner)).toBe(true)
      expect(canReadSheet(published, admin)).toBe(true)
    })
  })

  describe('non-published sheets', () => {
    const cases = [
      ['draft', draft],
      ['pending_review', pendingReview],
      ['rejected', rejected],
      ['quarantined', quarantined],
    ]

    it.each(cases)('%s — owner can access', (_label, sheet) => {
      expect(canReadSheet(sheet, owner)).toBe(true)
    })

    it.each(cases)('%s — admin can access', (_label, sheet) => {
      expect(canReadSheet(sheet, admin)).toBe(true)
    })

    it.each(cases)('%s — stranger blocked', (_label, sheet) => {
      expect(canReadSheet(sheet, stranger)).toBe(false)
    })

    it.each(cases)('%s — anonymous blocked', (_label, sheet) => {
      expect(canReadSheet(sheet, anon)).toBe(false)
    })
  })
})

describe('Post attachment access control (moderationStatus)', () => {
  const cleanPost = { userId: 1, moderationStatus: 'clean' }
  const pendingPost = { userId: 1, moderationStatus: 'pending_review' }
  const confirmedPost = { userId: 1, moderationStatus: 'confirmed_violation' }

  describe('clean post', () => {
    it('allows anyone', () => {
      expect(postAttachmentAccessible(cleanPost, stranger)).toBe(true)
      expect(postAttachmentAccessible(cleanPost, owner)).toBe(true)
      expect(postAttachmentAccessible(cleanPost, admin)).toBe(true)
    })
  })

  describe('pending_review post', () => {
    it('blocks stranger', () => {
      expect(postAttachmentAccessible(pendingPost, stranger)).toBe(false)
    })
    it('blocks anonymous', () => {
      expect(postAttachmentAccessible(pendingPost, anon)).toBe(false)
    })
    it('allows owner', () => {
      expect(postAttachmentAccessible(pendingPost, owner)).toBe(true)
    })
    it('allows admin', () => {
      expect(postAttachmentAccessible(pendingPost, admin)).toBe(true)
    })
  })

  describe('confirmed_violation post', () => {
    it('blocks stranger', () => {
      expect(postAttachmentAccessible(confirmedPost, stranger)).toBe(false)
    })
    it('blocks anonymous', () => {
      expect(postAttachmentAccessible(confirmedPost, anon)).toBe(false)
    })
    it('allows owner', () => {
      expect(postAttachmentAccessible(confirmedPost, owner)).toBe(true)
    })
    it('allows admin', () => {
      expect(postAttachmentAccessible(confirmedPost, admin)).toBe(true)
    })
  })
})

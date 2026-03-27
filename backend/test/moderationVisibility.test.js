import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for moderation visibility behavior:
 * - scanContent flags notes/comments as pending_review
 * - reviewCase syncs moderationStatus on dismiss/confirm
 *
 * Uses Module._load patching (same pattern as notes.routes.test.js)
 * to reliably intercept CJS require() calls in moderationEngine.js.
 */

const require = createRequire(import.meta.url)
const modEnginePath = require.resolve('../src/lib/moderation/moderationEngine')

const mockPrisma = {
  moderationCase: {
    create: vi.fn(),
    update: vi.fn(),
  },
  note: {
    update: vi.fn(),
  },
  noteComment: {
    update: vi.fn(),
  },
}

const mockOpenAI = {
  moderations: {
    create: vi.fn(),
  },
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mockPrisma],
  [require.resolve('../src/monitoring/sentry'), { captureError: vi.fn() }],
  [require.resolve('../src/lib/notify'), { createNotification: vi.fn() }],
  [require.resolve('openai'), vi.fn(function MockOpenAI() { return mockOpenAI })],
])

const originalModuleLoad = Module._load
let scanContent, reviewCase

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolvedRequest)
    if (mocked !== undefined) return mocked
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[modEnginePath]
  const mod = require('../src/lib/moderation/moderationEngine')
  scanContent = mod.scanContent
  reviewCase = mod.reviewCase
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[modEnginePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'test-key'
})

describe('moderation visibility', () => {
  describe('scanContent → pending_review', () => {
    it('sets note moderationStatus to pending_review when flagged', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { violence: true },
          category_scores: { violence: 0.85 },
        }],
      })
      mockPrisma.moderationCase.create.mockResolvedValue({ id: 1 })
      mockPrisma.note.update.mockResolvedValue({})

      await scanContent({ contentType: 'note', contentId: 42, text: 'violent content here', userId: 1 })

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { moderationStatus: 'pending_review' },
      })
    })

    it('sets note_comment moderationStatus to pending_review when flagged', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { hate: true },
          category_scores: { hate: 0.72 },
        }],
      })
      mockPrisma.moderationCase.create.mockResolvedValue({ id: 2 })
      mockPrisma.noteComment.update.mockResolvedValue({})

      await scanContent({ contentType: 'note_comment', contentId: 99, text: 'hateful comment text', userId: 2 })

      expect(mockPrisma.noteComment.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { moderationStatus: 'pending_review' },
      })
    })

    it('does not update moderationStatus for non-note content types', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: true,
          categories: { violence: true },
          category_scores: { violence: 0.9 },
        }],
      })
      mockPrisma.moderationCase.create.mockResolvedValue({ id: 3 })

      await scanContent({ contentType: 'feed_post', contentId: 10, text: 'bad feed post', userId: 3 })

      expect(mockPrisma.note.update).not.toHaveBeenCalled()
      expect(mockPrisma.noteComment.update).not.toHaveBeenCalled()
    })

    it('does not update moderationStatus when score is below threshold', async () => {
      mockOpenAI.moderations.create.mockResolvedValue({
        results: [{
          flagged: false,
          categories: {},
          category_scores: { violence: 0.1 },
        }],
      })

      await scanContent({ contentType: 'note', contentId: 50, text: 'clean content', userId: 4 })

      expect(mockPrisma.moderationCase.create).not.toHaveBeenCalled()
      expect(mockPrisma.note.update).not.toHaveBeenCalled()
    })
  })

  describe('reviewCase → status sync', () => {
    it('restores note to clean when case is dismissed', async () => {
      mockPrisma.moderationCase.update.mockResolvedValue({
        id: 10,
        contentType: 'note',
        contentId: 42,
        status: 'dismissed',
      })
      mockPrisma.note.update.mockResolvedValue({})

      await reviewCase({ caseId: 10, reviewedBy: 1, action: 'dismiss', reviewNote: '' })

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { moderationStatus: 'clean' },
      })
    })

    it('marks note as confirmed_violation when case is confirmed', async () => {
      mockPrisma.moderationCase.update.mockResolvedValue({
        id: 11,
        contentType: 'note',
        contentId: 43,
        status: 'confirmed',
      })
      mockPrisma.note.update.mockResolvedValue({})

      await reviewCase({ caseId: 11, reviewedBy: 1, action: 'confirm', reviewNote: 'Violation confirmed' })

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 43 },
        data: { moderationStatus: 'confirmed_violation' },
      })
    })

    it('restores note_comment to clean when case is dismissed', async () => {
      mockPrisma.moderationCase.update.mockResolvedValue({
        id: 12,
        contentType: 'note_comment',
        contentId: 88,
        status: 'dismissed',
      })
      mockPrisma.noteComment.update.mockResolvedValue({})

      await reviewCase({ caseId: 12, reviewedBy: 1, action: 'dismiss', reviewNote: '' })

      expect(mockPrisma.noteComment.update).toHaveBeenCalledWith({
        where: { id: 88 },
        data: { moderationStatus: 'clean' },
      })
    })

    it('does not sync moderationStatus for non-note content types', async () => {
      mockPrisma.moderationCase.update.mockResolvedValue({
        id: 13,
        contentType: 'feed_post',
        contentId: 5,
        status: 'dismissed',
      })

      await reviewCase({ caseId: 13, reviewedBy: 1, action: 'dismiss', reviewNote: '' })

      expect(mockPrisma.note.update).not.toHaveBeenCalled()
      expect(mockPrisma.noteComment.update).not.toHaveBeenCalled()
    })
  })
})

import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const deleteUserAccountPath = require.resolve('../src/lib/deleteUserAccount')
const sentryPath = require.resolve('../src/monitoring/sentry')
const storagePath = require.resolve('../src/lib/storage')
const r2StoragePath = require.resolve('../src/lib/r2Storage')
const paymentsServicePath = require.resolve('../src/modules/payments/payments.service')
const videoServicePath = require.resolve('../src/modules/video/video.service')

const mocks = vi.hoisted(() => ({
  sentry: {
    captureError: vi.fn(),
  },
  storage: {
    cleanupAttachmentIfUnused: vi.fn(async () => true),
    cleanupAvatarIfUnused: vi.fn(async () => true),
    cleanupContentImageIfUnused: vi.fn(async () => true),
    cleanupCoverIfUnused: vi.fn(async () => true),
    cleanupNoteImageIfUnused: vi.fn(async () => true),
    extractNoteImageUrlsFromTexts: vi.fn((texts) => {
      const joined = texts.filter(Boolean).join(' ')
      const urls = []
      if (joined.includes('/uploads/note-images/current-note.png')) {
        urls.push('/uploads/note-images/current-note.png')
      }
      if (joined.includes('/uploads/note-images/note-version.png')) {
        urls.push('/uploads/note-images/note-version.png')
      }
      return urls
    }),
  },
  r2Storage: {
    isR2Configured: vi.fn(() => true),
    extractObjectKeyFromUrl: vi.fn((url) => {
      if (url === 'https://cdn.studyhub.test/announcements/9/banner.jpg') {
        return 'announcements/9/banner.jpg'
      }
      return null
    }),
    deleteObject: vi.fn(async () => true),
  },
  stripe: {
    subscriptions: {
      cancel: vi.fn(async () => ({ id: 'sub_123', status: 'canceled' })),
    },
  },
  paymentsService: {
    getStripe: vi.fn(),
  },
  videoService: {
    deleteVideoAssetRefs: vi.fn(async () => true),
  },
}))

const originalModuleLoad = Module._load

let deleteUserAccount

function createDeleteManyMock() {
  return vi.fn(async () => ({ count: 1 }))
}

function createPrismaMock() {
  const tx = {
    user: {
      findUnique: vi.fn(async () => ({
        avatarUrl: '/uploads/avatars/user.png',
        coverImageUrl: '/uploads/covers/cover.png',
        email: 'user@studyhub.test',
      })),
      delete: vi.fn(async () => ({ id: 42 })),
    },
    announcement: {
      findMany: vi.fn(async () => [{ id: 9 }]),
      deleteMany: createDeleteManyMock(),
    },
    announcementMedia: {
      findMany: vi.fn(async () => [{ url: 'https://cdn.studyhub.test/announcements/9/banner.jpg' }]),
    },
    deletionReason: {
      create: vi.fn(async () => ({ id: 1 })),
    },
    passwordResetToken: {
      deleteMany: createDeleteManyMock(),
    },
    verificationChallenge: {
      deleteMany: createDeleteManyMock(),
    },
    enrollment: {
      deleteMany: createDeleteManyMock(),
    },
    studySheet: {
      findMany: vi.fn(async () => [{ id: 11, attachmentUrl: 'attachment://sheet.pdf' }]),
      deleteMany: createDeleteManyMock(),
    },
    comment: {
      findMany: vi.fn(async () => [{ id: 101 }, { id: 102 }]),
      deleteMany: createDeleteManyMock(),
    },
    commentAttachment: {
      findMany: vi.fn(async () => [{ url: '/uploads/content-images/sheet-comment.png' }]),
    },
    starredSheet: {
      deleteMany: createDeleteManyMock(),
    },
    reaction: {
      deleteMany: createDeleteManyMock(),
    },
    sheetContribution: {
      deleteMany: createDeleteManyMock(),
    },
    feedPost: {
      findMany: vi.fn(async () => [{ id: 21, attachmentUrl: 'attachment://post.pdf' }]),
      deleteMany: createDeleteManyMock(),
    },
    feedPostComment: {
      findMany: vi.fn(async () => [{ id: 201 }]),
      deleteMany: createDeleteManyMock(),
    },
    feedPostCommentAttachment: {
      findMany: vi.fn(async () => [{ url: '/uploads/content-images/feed-comment.png' }]),
    },
    feedPostReaction: {
      deleteMany: createDeleteManyMock(),
    },
    note: {
      findMany: vi.fn(async () => [{ id: 31, content: '![image](/uploads/note-images/current-note.png)' }]),
      deleteMany: createDeleteManyMock(),
    },
    noteComment: {
      findMany: vi.fn(async () => [{ id: 301 }]),
      deleteMany: createDeleteManyMock(),
    },
    noteCommentAttachment: {
      findMany: vi.fn(async () => [{ url: '/uploads/content-images/note-comment.png' }]),
    },
    noteVersion: {
      findMany: vi.fn(async () => [{ content: '![image](/uploads/note-images/note-version.png)' }]),
      deleteMany: createDeleteManyMock(),
    },
    noteStar: {
      deleteMany: createDeleteManyMock(),
    },
    video: {
      findMany: vi.fn(async () => [{
        id: 41,
        r2Key: 'videos/42/original.mp4',
        thumbnailR2Key: 'videos/42/thumb.jpg',
        hlsManifestR2Key: 'videos/42/manifest.m3u8',
        variants: {
          '720p': { key: 'videos/42/720p.mp4' },
        },
        captions: [{ vttR2Key: 'videos/42/captions/en.vtt' }],
      }]),
      deleteMany: createDeleteManyMock(),
    },
    videoAppeal: {
      deleteMany: createDeleteManyMock(),
      updateMany: createDeleteManyMock(),
    },
    messageReaction: {
      deleteMany: createDeleteManyMock(),
    },
    message: {
      deleteMany: createDeleteManyMock(),
    },
    conversationParticipant: {
      deleteMany: createDeleteManyMock(),
    },
    conversation: {
      deleteMany: createDeleteManyMock(),
    },
    discussionUpvote: {
      deleteMany: createDeleteManyMock(),
    },
    groupDiscussionReply: {
      deleteMany: createDeleteManyMock(),
    },
    groupDiscussionPost: {
      deleteMany: createDeleteManyMock(),
    },
    groupSessionRsvp: {
      deleteMany: createDeleteManyMock(),
    },
    groupResource: {
      deleteMany: createDeleteManyMock(),
    },
    studyGroupMember: {
      deleteMany: createDeleteManyMock(),
    },
    studyGroup: {
      deleteMany: createDeleteManyMock(),
    },
    shareLink: {
      deleteMany: createDeleteManyMock(),
    },
    contentShare: {
      deleteMany: createDeleteManyMock(),
    },
    userBlock: {
      deleteMany: createDeleteManyMock(),
    },
    userMute: {
      deleteMany: createDeleteManyMock(),
    },
    notification: {
      deleteMany: createDeleteManyMock(),
    },
    aiMessage: {
      deleteMany: createDeleteManyMock(),
    },
    aiUsageLog: {
      deleteMany: createDeleteManyMock(),
    },
    aiConversation: {
      deleteMany: createDeleteManyMock(),
    },
  }

  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({
        stripeSubscriptionId: 'sub_123',
        status: 'active',
      })),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  }

  return { prisma, tx }
}

beforeAll(() => {
  mocks.paymentsService.getStripe.mockReturnValue(mocks.stripe)

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)

    if (resolvedRequest === sentryPath) return mocks.sentry
    if (resolvedRequest === storagePath) return mocks.storage
    if (resolvedRequest === r2StoragePath) return mocks.r2Storage
    if (resolvedRequest === paymentsServicePath) return mocks.paymentsService
    if (resolvedRequest === videoServicePath) return mocks.videoService

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[deleteUserAccountPath]
  ;({ deleteUserAccount } = require(deleteUserAccountPath))
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[deleteUserAccountPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.paymentsService.getStripe.mockReturnValue(mocks.stripe)
})

describe('deleteUserAccount', () => {
  it('cancels active billing and cleans captured assets after deleting the user', async () => {
    const { prisma, tx } = createPrismaMock()

    await deleteUserAccount(prisma, {
      userId: 42,
      username: 'test_user',
      reason: 'privacy',
      details: 'Remove everything tied to this account.',
    })

    expect(mocks.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')
    expect(tx.verificationChallenge.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 42 },
          { username: 'test_user' },
          { email: 'user@studyhub.test' },
        ],
      },
    })
    expect(tx.videoAppeal.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { videoId: { in: [41] } },
          { originalVideoId: { in: [41] } },
          { uploaderId: 42 },
        ],
      },
    })
    expect(tx.video.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } })
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 42 } })

    expect(mocks.storage.cleanupAttachmentIfUnused).toHaveBeenCalledTimes(2)
    expect(mocks.storage.cleanupAttachmentIfUnused).toHaveBeenCalledWith(
      prisma,
      'attachment://sheet.pdf',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.storage.cleanupAttachmentIfUnused).toHaveBeenCalledWith(
      prisma,
      'attachment://post.pdf',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.storage.cleanupContentImageIfUnused).toHaveBeenCalledTimes(3)
    expect(mocks.storage.cleanupNoteImageIfUnused).toHaveBeenCalledTimes(2)
    expect(mocks.storage.cleanupNoteImageIfUnused).toHaveBeenCalledWith(
      prisma,
      '/uploads/note-images/current-note.png',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.storage.cleanupNoteImageIfUnused).toHaveBeenCalledWith(
      prisma,
      '/uploads/note-images/note-version.png',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.storage.cleanupCoverIfUnused).toHaveBeenCalledWith(
      prisma,
      '/uploads/covers/cover.png',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.storage.cleanupAvatarIfUnused).toHaveBeenCalledWith(
      prisma,
      '/uploads/avatars/user.png',
      expect.objectContaining({ source: 'deleteUserAccount', userId: 42 }),
    )
    expect(mocks.videoService.deleteVideoAssetRefs).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, r2Key: 'videos/42/original.mp4' }),
    )
    expect(mocks.r2Storage.extractObjectKeyFromUrl).toHaveBeenCalledWith(
      'https://cdn.studyhub.test/announcements/9/banner.jpg',
    )
    expect(mocks.r2Storage.deleteObject).toHaveBeenCalledWith('announcements/9/banner.jpg')
  })
})
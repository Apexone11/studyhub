import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const storagePath = require.resolve('../../src/lib/storage')

const mocks = vi.hoisted(() => {
  // node:fs constants pulled in lazily via Module._load below; for the mock we
  // expose only the bitmask constants storage.js touches (R_OK, W_OK).
  const FS_CONSTANTS = { R_OK: 4, W_OK: 2 }
  const fsState = {
    existing: new Set(), // directories that exist
    files: new Set(), // files that exist
    unlinkShouldThrow: null,
    mkdirShouldThrow: null,
    accessShouldThrow: null,
    statOverride: null,
  }

  const fs = {
    existsSync: vi.fn((target) => {
      const normalized = path.resolve(String(target))
      return fsState.existing.has(normalized) || fsState.files.has(normalized)
    }),
    statSync: vi.fn((target) => {
      if (fsState.statOverride) return fsState.statOverride
      const normalized = path.resolve(String(target))
      if (fsState.existing.has(normalized)) {
        return { isDirectory: () => true, isFile: () => false }
      }
      if (fsState.files.has(normalized)) {
        return { isDirectory: () => false, isFile: () => true }
      }
      const err = new Error(`ENOENT ${target}`)
      err.code = 'ENOENT'
      throw err
    }),
    mkdirSync: vi.fn((target) => {
      if (fsState.mkdirShouldThrow) throw fsState.mkdirShouldThrow
      fsState.existing.add(path.resolve(String(target)))
    }),
    accessSync: vi.fn(() => {
      if (fsState.accessShouldThrow) throw fsState.accessShouldThrow
    }),
    unlinkSync: vi.fn((target) => {
      if (fsState.unlinkShouldThrow) throw fsState.unlinkShouldThrow
      fsState.files.delete(path.resolve(String(target)))
    }),
    constants: FS_CONSTANTS,
  }

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  const sentry = {
    captureError: vi.fn(),
  }

  return { fsState, fs, logger, sentry }
})

const mockTargets = new Map([
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/logger'), mocks.logger],
])

const namedModuleMocks = new Map([
  ['node:fs', mocks.fs],
  ['fs', mocks.fs],
])

const originalModuleLoad = Module._load
const ORIGINAL_ENV = { ...process.env }

let storage

function loadStorage(env) {
  for (const key of ['NODE_ENV', 'UPLOADS_DIR', 'ALLOW_EPHEMERAL_UPLOADS']) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(env || {})) {
    process.env[key] = value
  }
  delete require.cache[storagePath]
  return require(storagePath)
}

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (namedModuleMocks.has(requestId)) {
      return namedModuleMocks.get(requestId)
    }
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      // fall through
    }
    return originalModuleLoad.apply(this, arguments)
  }
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[storagePath]
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fsState.existing = new Set()
  mocks.fsState.files = new Set()
  mocks.fsState.unlinkShouldThrow = null
  mocks.fsState.mkdirShouldThrow = null
  mocks.fsState.accessShouldThrow = null
  mocks.fsState.statOverride = null
  storage = loadStorage({ UPLOADS_DIR: '/tmp/test-uploads' })
})

/* ===================================================================== */
/* URL builders                                                           */
/* ===================================================================== */
describe('storage URL builders', () => {
  it('buildAvatarUrl, buildCoverUrl, buildContentImageUrl, buildNoteImageUrl, buildGroupMediaUrl produce /uploads-prefixed URLs', () => {
    expect(storage.buildAvatarUrl('a.jpg')).toBe('/uploads/avatars/a.jpg')
    expect(storage.buildCoverUrl('c.png')).toBe('/uploads/covers/c.png')
    expect(storage.buildContentImageUrl('d.svg')).toBe('/uploads/content-images/d.svg')
    expect(storage.buildNoteImageUrl('n.jpg')).toBe('/uploads/note-images/n.jpg')
    expect(storage.buildGroupMediaUrl('g.mp4')).toBe('/uploads/group-media/g.mp4')
  })

  it('buildAttachmentUrl uses the private attachment:// scheme', () => {
    expect(storage.buildAttachmentUrl('doc.pdf')).toBe('attachment://doc.pdf')
    expect(storage.PRIVATE_ATTACHMENT_PREFIX).toBe('attachment://')
  })
})

/* ===================================================================== */
/* Leaf filename + path-within-root guards                                */
/* ===================================================================== */
describe('storage path-safety guards', () => {
  it('isManagedLeafFileName accepts plain names and rejects traversal, separators, and null bytes', () => {
    expect(storage.isManagedLeafFileName('ok.jpg')).toBe(true)
    expect(storage.isManagedLeafFileName('..')).toBe(true) // basename('..') === '..'
    expect(storage.isManagedLeafFileName('a/b.jpg')).toBe(false)
    expect(storage.isManagedLeafFileName('../b.jpg')).toBe(false)
    expect(storage.isManagedLeafFileName('bad\0.jpg')).toBe(false)
    expect(storage.isManagedLeafFileName('')).toBe(false)
    expect(storage.isManagedLeafFileName(null)).toBe(false)
    expect(storage.isManagedLeafFileName(undefined)).toBe(false)
  })

  it('isPathWithinRoot accepts the root itself and nested files, rejects siblings and traversal', () => {
    const root = path.resolve('/app/uploads')
    expect(storage.isPathWithinRoot(root, root)).toBe(true)
    expect(storage.isPathWithinRoot(path.join(root, 'a', 'b.jpg'), root)).toBe(true)
    expect(storage.isPathWithinRoot(path.resolve('/app/other'), root)).toBe(false)
    expect(storage.isPathWithinRoot(path.resolve('/app/uploads/../etc/passwd'), root)).toBe(false)
  })
})

/* ===================================================================== */
/* resolveManagedUploadPath                                               */
/* ===================================================================== */
describe('storage.resolveManagedUploadPath', () => {
  it('resolves every known prefix into a path under the matching managed directory', () => {
    const cases = [
      ['/uploads/avatars/a.jpg', 'avatars'],
      ['/uploads/covers/c.png', 'covers'],
      ['/uploads/attachments/f.pdf', 'attachments'],
      ['/uploads/content-images/d.svg', 'content-images'],
      ['/uploads/note-images/n.jpg', 'note-images'],
      ['/uploads/group-media/g.mp4', 'group-media'],
      ['attachment://private.pdf', 'attachments'],
    ]
    for (const [url, segment] of cases) {
      const resolved = storage.resolveManagedUploadPath(url)
      expect(resolved, `url=${url}`).toBeTruthy()
      expect(resolved).toContain(segment)
    }
  })

  it('returns null for unknown prefixes, empty input, and missing leaf names', () => {
    expect(storage.resolveManagedUploadPath('')).toBeNull()
    expect(storage.resolveManagedUploadPath(null)).toBeNull()
    expect(storage.resolveManagedUploadPath('/unknown/kind/file.jpg')).toBeNull()
    expect(storage.resolveManagedUploadPath('/uploads/avatars/')).toBeNull()
    expect(storage.resolveManagedUploadPath('/uploads/avatars')).toBeNull()
  })

  it('rejects directory traversal embedded in the filename segment', () => {
    expect(storage.resolveManagedUploadPath('/uploads/avatars/../../etc/passwd')).toBeNull()
    expect(storage.resolveManagedUploadPath('/uploads/covers/../../../etc/shadow')).toBeNull()
  })
})

/* ===================================================================== */
/* safeUnlinkFile                                                         */
/* ===================================================================== */
describe('storage.safeUnlinkFile', () => {
  it('returns false and skips unlink for a path outside managed roots', () => {
    const result = storage.safeUnlinkFile('/etc/passwd')
    expect(result).toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('returns false when the file does not exist', () => {
    const filePath = path.join(storage.AVATARS_DIR, 'missing.jpg')
    const result = storage.safeUnlinkFile(filePath)
    expect(result).toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('unlinks and returns true for a valid managed file', () => {
    const filePath = path.join(storage.AVATARS_DIR, 'ok.jpg')
    mocks.fsState.files.add(path.resolve(filePath))

    const result = storage.safeUnlinkFile(filePath)
    expect(result).toBe(true)
    expect(mocks.fs.unlinkSync).toHaveBeenCalledWith(path.resolve(filePath))
  })

  it('reports fs errors to Sentry and returns false', () => {
    const filePath = path.join(storage.AVATARS_DIR, 'locked.jpg')
    mocks.fsState.files.add(path.resolve(filePath))
    mocks.fsState.unlinkShouldThrow = Object.assign(new Error('EBUSY'), { code: 'EBUSY' })

    const result = storage.safeUnlinkFile(filePath)
    expect(result).toBe(false)
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)
    expect(mocks.sentry.captureError.mock.calls[0][1]).toMatchObject({
      source: 'safeUnlinkFile',
    })
  })

  it('rejects file paths with non-leaf basenames (null byte)', () => {
    const bad = path.join(storage.AVATARS_DIR, 'x\0.jpg')
    expect(storage.safeUnlinkFile(bad)).toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* cleanup helpers with prisma reference counting                         */
/* ===================================================================== */
describe('storage cleanup helpers (reference counted deletes)', () => {
  function makePrisma(counts = {}) {
    const make = (name) => ({
      count: vi.fn(async () => counts[name] ?? 0),
    })
    return {
      studySheet: make('studySheet'),
      feedPost: make('feedPost'),
      user: make('user'),
      commentAttachment: make('commentAttachment'),
      feedPostCommentAttachment: make('feedPostCommentAttachment'),
      noteCommentAttachment: make('noteCommentAttachment'),
      note: make('note'),
      noteVersion: make('noteVersion'),
    }
  }

  it('cleanupAttachmentIfUnused deletes when no references remain', async () => {
    const url = '/uploads/attachments/doc.pdf'
    mocks.fsState.files.add(path.resolve(storage.ATTACHMENTS_DIR, 'doc.pdf'))

    const prisma = makePrisma({ studySheet: 0, feedPost: 0 })
    const result = await storage.cleanupAttachmentIfUnused(prisma, url)

    expect(result).toBe(true)
    expect(mocks.fs.unlinkSync).toHaveBeenCalledTimes(1)
  })

  it('cleanupAttachmentIfUnused preserves the file when references exist', async () => {
    const url = '/uploads/attachments/doc.pdf'
    mocks.fsState.files.add(path.resolve(storage.ATTACHMENTS_DIR, 'doc.pdf'))

    const prisma = makePrisma({ studySheet: 1, feedPost: 0 })
    const result = await storage.cleanupAttachmentIfUnused(prisma, url)

    expect(result).toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('cleanupAttachmentIfUnused returns false and reports to Sentry when prisma throws', async () => {
    const url = '/uploads/attachments/doc.pdf'
    const prisma = {
      studySheet: {
        count: vi.fn(async () => {
          throw new Error('DB down')
        }),
      },
      feedPost: { count: vi.fn(async () => 0) },
    }

    const result = await storage.cleanupAttachmentIfUnused(prisma, url, { traceId: 't-1' })
    expect(result).toBe(false)
    expect(mocks.sentry.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'cleanupAttachmentIfUnused', traceId: 't-1' }),
    )
  })

  it('cleanupAvatarIfUnused and cleanupCoverIfUnused route to the correct prisma count query', async () => {
    const avatarUrl = '/uploads/avatars/u.jpg'
    const coverUrl = '/uploads/covers/c.jpg'
    mocks.fsState.files.add(path.resolve(storage.AVATARS_DIR, 'u.jpg'))
    mocks.fsState.files.add(path.resolve(storage.COVERS_DIR, 'c.jpg'))

    const prisma = makePrisma({ user: 0 })
    await expect(storage.cleanupAvatarIfUnused(prisma, avatarUrl)).resolves.toBe(true)
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { avatarUrl } })

    await expect(storage.cleanupCoverIfUnused(prisma, coverUrl)).resolves.toBe(true)
    expect(prisma.user.count).toHaveBeenLastCalledWith({ where: { coverImageUrl: coverUrl } })
  })

  it('cleanupContentImageIfUnused sums all three comment-attachment tables before unlinking', async () => {
    const url = '/uploads/content-images/d.png'
    mocks.fsState.files.add(path.resolve(storage.CONTENT_IMAGES_DIR, 'd.png'))

    const prisma = makePrisma({
      commentAttachment: 0,
      feedPostCommentAttachment: 0,
      noteCommentAttachment: 1, // one note comment still references the image
    })
    await expect(storage.cleanupContentImageIfUnused(prisma, url)).resolves.toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('cleanupNoteImageIfUnused preserves the file when a note or noteVersion still references it', async () => {
    const url = '/uploads/note-images/n.jpg'
    mocks.fsState.files.add(path.resolve(storage.NOTE_IMAGES_DIR, 'n.jpg'))

    const prisma = makePrisma({ note: 0, noteVersion: 2 })
    await expect(storage.cleanupNoteImageIfUnused(prisma, url)).resolves.toBe(false)
    expect(mocks.fs.unlinkSync).not.toHaveBeenCalled()
  })

  it('cleanup helpers return false for URLs that do not map to a managed path', async () => {
    const prisma = makePrisma()
    await expect(storage.cleanupAttachmentIfUnused(prisma, '/not/managed')).resolves.toBe(false)
    await expect(storage.cleanupAvatarIfUnused(prisma, 'http://evil/x.jpg')).resolves.toBe(false)
    expect(prisma.user.count).not.toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* extractNoteImageUrlsFromTexts                                          */
/* ===================================================================== */
describe('storage.extractNoteImageUrlsFromTexts', () => {
  it('extracts unique note-image URLs from an array of text blobs', () => {
    const texts = [
      'See image /uploads/note-images/a.jpg inline and /uploads/note-images/b.png nearby.',
      'Duplicate /uploads/note-images/a.jpg should collapse.',
      null,
      42,
      '/uploads/avatars/not-a-note.jpg', // filtered: avatars prefix, not note-images
    ]
    const urls = storage.extractNoteImageUrlsFromTexts(texts)
    expect(urls.sort()).toEqual(['/uploads/note-images/a.jpg', '/uploads/note-images/b.png'].sort())
  })

  it('returns an empty array for null, undefined, or empty input', () => {
    expect(storage.extractNoteImageUrlsFromTexts(null)).toEqual([])
    expect(storage.extractNoteImageUrlsFromTexts(undefined)).toEqual([])
    expect(storage.extractNoteImageUrlsFromTexts([])).toEqual([])
  })
})

/* ===================================================================== */
/* validateUploadStorage / ensureUploadDirectories                        */
/* ===================================================================== */
describe('storage.validateUploadStorage', () => {
  it('creates every managed subdirectory and logs the storage mode', () => {
    storage.validateUploadStorage()

    const expectedDirs = [
      storage.UPLOADS_DIR,
      storage.AVATARS_DIR,
      storage.COVERS_DIR,
      storage.ATTACHMENTS_DIR,
      storage.SCHOOL_LOGOS_DIR,
      storage.CONTENT_IMAGES_DIR,
      storage.NOTE_IMAGES_DIR,
      storage.GROUP_MEDIA_DIR,
    ]
    for (const dir of expectedDirs) {
      expect(mocks.fs.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true })
      expect(mocks.fs.accessSync).toHaveBeenCalledWith(
        dir,
        4 | 2, // R_OK | W_OK
      )
    }
    expect(mocks.logger.info).toHaveBeenCalledTimes(1)
    expect(mocks.logger.info.mock.calls[0][0]).toMatchObject({
      storageMode: 'configured',
    })
  })

  it('throws in production when no UPLOADS_DIR, no persistent volume, and no opt-in', () => {
    const s = loadStorage({ NODE_ENV: 'production' })
    expect(() => s.validateUploadStorage()).toThrow(/UPLOADS_DIR must point to persistent storage/)
  })

  it('allows production with ALLOW_EPHEMERAL_UPLOADS=true and records ephemeral-opt-in mode', () => {
    const s = loadStorage({ NODE_ENV: 'production', ALLOW_EPHEMERAL_UPLOADS: 'true' })
    expect(() => s.validateUploadStorage()).not.toThrow()
    expect(mocks.logger.info).toHaveBeenCalledTimes(1)
    expect(mocks.logger.info.mock.calls[0][0]).toMatchObject({ storageMode: 'ephemeral-opt-in' })
  })

  it('propagates fs.mkdirSync errors (e.g., permission denied) to the caller', () => {
    mocks.fsState.mkdirShouldThrow = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    expect(() => storage.validateUploadStorage()).toThrow(/EACCES/)
  })
})

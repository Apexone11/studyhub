import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../../src/modules/video/video.service')
const routesPath = require.resolve('../../src/modules/video/video.routes')
const barrelPath = require.resolve('../../src/modules/video')

const mocks = vi.hoisted(() => {
  const state = {
    userId: 42,
    username: 'alice',
    role: 'student',
  }

  const prisma = {
    video: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    videoCaption: {
      count: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    videoAppeal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    donation: {
      findFirst: vi.fn(),
    },
  }

  const r2 = {
    isR2Configured: vi.fn(() => true),
    generateVideoKey: vi.fn((_userId, name) => `videos/u/${name}`),
    generateVariantKey: vi.fn((base, quality) => `${base}.${quality}.mp4`),
    generateThumbnailKey: vi.fn((base) => `${base}.thumb.jpg`),
    generateManifestKey: vi.fn((base) => `${base}.master.m3u8`),
    generateCaptionKey: vi.fn((base, lang) => `${base}.${lang}.vtt`),
    getPublicUrl: vi.fn((key) => `https://cdn.example/${encodeURIComponent(key)}`),
    createMultipartUpload: vi.fn(),
    uploadPart: vi.fn(),
    completeMultipartUpload: vi.fn(),
    abortMultipartUpload: vi.fn(),
    uploadObject: vi.fn(),
    deleteObject: vi.fn(),
    getObject: vi.fn(),
    getSignedDownloadUrl: vi.fn(),
  }

  const clamav = {
    scanBufferWithClamAv: vi.fn().mockResolvedValue({ status: 'clean' }),
  }

  const notify = {
    createNotification: vi.fn().mockResolvedValue(undefined),
  }

  const getUserPlan = {
    getUserPlan: vi.fn().mockResolvedValue('free'),
  }

  const sentry = {
    captureError: vi.fn(),
  }

  const auth = vi.fn((req, _res, next) => {
    req.user = { userId: state.userId, username: state.username, role: state.role }
    next()
  })

  const passThrough = (_req, _res, next) => next()
  const rateLimiters = {
    videoUploadInitLimiter: passThrough,
    videoUploadChunkLimiter: passThrough,
    videoThumbnailLimiter: passThrough,
    readLimiter: passThrough,
    writeLimiter: passThrough,
  }

  const childProcess = {
    spawn: vi.fn(),
    // ENOENT signals "ffmpeg/ffprobe not installed" so processVideo
    // short-circuits rather than spawning a real pipeline during tests.
    execFileSync: vi.fn(() => {
      throw Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' })
    }),
  }

  return {
    state,
    prisma,
    r2,
    clamav,
    notify,
    getUserPlan,
    sentry,
    auth,
    rateLimiters,
    childProcess,
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/lib/r2Storage'), mocks.r2],
  [require.resolve('../../src/lib/clamav'), mocks.clamav],
  [require.resolve('../../src/lib/notify'), mocks.notify],
  [require.resolve('../../src/lib/getUserPlan'), mocks.getUserPlan],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/middleware/auth'), mocks.auth],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
])

const originalModuleLoad = Module._load

let app

/**
 * Build a minimal MP4-signature-valid buffer of the requested size.
 * The first 12 bytes encode the ftyp box so validateVideoSignature() passes.
 */
function makeMp4Buffer(totalSize) {
  const header = Buffer.alloc(12)
  header.writeUInt32BE(0x00000020, 0)
  header.write('ftyp', 4, 'ascii')
  header.write('isom', 8, 'ascii')
  const payload = Buffer.alloc(Math.max(0, totalSize - 12), 0x11)
  return Buffer.concat([header, payload])
}

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'child_process') {
      return mocks.childProcess
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

  delete require.cache[servicePath]
  delete require.cache[routesPath]
  delete require.cache[barrelPath]

  const videoRoutes = require(barrelPath)

  app = express()

  // Replicate the real app's raw-body wiring for the chunk endpoint so the
  // handler sees req.body as a Buffer. This mirrors backend/src/index.js.
  app.post(
    '/api/video/upload/chunk',
    express.raw({ type: '*/*', limit: '3mb' }),
    (req, _res, next) => {
      req.url = '/upload/chunk'
      videoRoutes(req, _res, next)
    },
  )
  app.use(express.json())

  // Replicate optionalAuth: in the real app, a session middleware populates
  // req.user globally so optional-auth routes (like GET /:id/stream) can see
  // the caller. Without this, only routes wrapped in requireAuth would have
  // req.user, which would make owner-bypass paths impossible to test.
  app.use((req, _res, next) => {
    req.user = {
      userId: mocks.state.userId,
      username: mocks.state.username,
      role: mocks.state.role,
    }
    next()
  })

  app.use('/api/video', videoRoutes)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
  delete require.cache[routesPath]
  delete require.cache[barrelPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'alice'
  mocks.state.role = 'student'

  mocks.r2.isR2Configured.mockReturnValue(true)
  mocks.r2.getPublicUrl.mockImplementation(
    (key) => `https://cdn.example/${encodeURIComponent(key)}`,
  )
  mocks.r2.generateVideoKey.mockImplementation((_uid, name) => `videos/u/${name}`)
  mocks.r2.generateCaptionKey.mockImplementation((base, lang) => `${base}.${lang}.vtt`)
  mocks.r2.uploadPart.mockImplementation(async (_key, _uploadId, partNumber) => ({
    ETag: `etag-${partNumber}`,
    PartNumber: partNumber,
  }))
  mocks.r2.completeMultipartUpload.mockResolvedValue({ ok: true })
  mocks.r2.abortMultipartUpload.mockResolvedValue(undefined)
  mocks.r2.getSignedDownloadUrl.mockResolvedValue('https://signed.example/url')
  mocks.clamav.scanBufferWithClamAv.mockResolvedValue({ status: 'clean' })

  // Default getObject returns an empty async iterable (for complete-scan path)
  mocks.r2.getObject.mockResolvedValue({
    // eslint-disable-next-line require-yield
    body: (async function* empty() {
      return
    })(),
    contentType: 'video/mp4',
    contentLength: 0,
  })
})

/* ===================================================================== */
/* POST /api/video/upload/chunk                                           */
/* ===================================================================== */
describe('video.routes POST /api/video/upload/chunk', () => {
  it('returns 400 when required upload headers are missing', async () => {
    const res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from([1, 2, 3]))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required upload headers/i)
  })

  it('returns 413 when the chunk body exceeds CHUNK_SIZE + 1024 bytes', async () => {
    // CHUNK_SIZE is 2MB; the route rejects content-length > 2MB+1024.
    // Send 2.5MB (under express.raw's 3MB limit, but over the route limit).
    const oversized = Buffer.alloc(2.5 * 1024 * 1024, 0x33)

    const res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-1')
      .set('x-r2-key', 'videos/u/tiny.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '100')
      .send(oversized)

    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/maximum size/i)
  })

  it('returns 404 when the video record does not belong to the caller', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 200, userId: 999 })
    const res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-2')
      .set('x-r2-key', 'videos/u/tiny.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '200')
      .send(makeMp4Buffer(64))

    expect(res.status).toBe(404)
    expect(mocks.r2.uploadPart).not.toHaveBeenCalled()
  })

  it('rejects the first chunk when magic bytes do not match a video signature', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 300, userId: 42 })
    mocks.prisma.video.update.mockResolvedValue({ id: 300, status: 'failed' })

    // 64 bytes that match neither MP4 (ftyp at offset 4), MOV (ftyp/moov),
    // nor WebM (1A 45 DF A3 at offset 0). The MP4 signature has a static
    // bytes prefix of [0x00,0x00,0x00] so we must avoid that AND avoid
    // any "ftyp"/"moov" string at offset 4.
    const badBuffer = Buffer.alloc(64, 0x77)

    const res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-3')
      .set('x-r2-key', 'videos/u/bad.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '300')
      .send(badBuffer)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/supported video format/i)
    expect(mocks.r2.abortMultipartUpload).toHaveBeenCalledWith('videos/u/bad.mp4', 'u-3')
    expect(mocks.prisma.video.update).toHaveBeenCalledWith({
      where: { id: 300 },
      data: { status: 'failed' },
    })
  })

  it('buffers small chunks without flushing to R2 (< 5MB)', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 400, userId: 42 })

    const res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-4')
      .set('x-r2-key', 'videos/u/a.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '400')
      .send(makeMp4Buffer(1024))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ received: true, partNumber: 1 })
    expect(res.body.buffered).toBeGreaterThan(0)
    expect(mocks.r2.uploadPart).not.toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* POST /api/video/upload/complete                                        */
/* Full multipart flow: init (done via setup) -> chunks buffered          */
/* -> complete forces a final flush                                       */
/* ===================================================================== */
describe('video.routes POST /api/video/upload/complete', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/video/upload/complete').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/videoId, uploadId, and r2Key/)
  })

  it('returns 404 when the caller does not own the video', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 500, userId: 999 })

    const res = await request(app)
      .post('/api/video/upload/complete')
      .send({ videoId: 500, uploadId: 'u-5', r2Key: 'videos/u/a.mp4' })

    expect(res.status).toBe(404)
    expect(mocks.r2.completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('returns 400 when no data was uploaded (empty buffer, no parts)', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 600, userId: 42 })

    const res = await request(app)
      .post('/api/video/upload/complete')
      .send({ videoId: 600, uploadId: 'u-empty', r2Key: 'videos/u/empty.mp4' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no data/i)
    expect(mocks.r2.completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('full flow: two buffered chunks are flushed on complete and completeMultipartUpload is called', async () => {
    // Upload chunk 1 (signature-valid, under 5MB so it only buffers)
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 700,
      userId: 42,
      r2Key: 'videos/u/real.mp4',
      status: 'processing',
    })

    const r1 = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-700')
      .set('x-r2-key', 'videos/u/real.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '700')
      .send(makeMp4Buffer(2048))
    expect(r1.status).toBe(200)

    const r2res = await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-700')
      .set('x-r2-key', 'videos/u/real.mp4')
      .set('x-part-number', '2')
      .set('x-video-id', '700')
      .send(Buffer.alloc(2048, 0x22))
    expect(r2res.status).toBe(200)

    // No flushes yet (buffer still under 5 MB threshold)
    expect(mocks.r2.uploadPart).not.toHaveBeenCalled()

    // Now complete — this should force-flush the residual buffer and
    // call completeMultipartUpload with the collected parts.
    const res = await request(app)
      .post('/api/video/upload/complete')
      .send({ videoId: 700, uploadId: 'u-700', r2Key: 'videos/u/real.mp4' })

    expect(res.status).toBe(200)
    expect(mocks.r2.uploadPart).toHaveBeenCalledTimes(1)
    expect(mocks.r2.completeMultipartUpload).toHaveBeenCalledWith(
      'videos/u/real.mp4',
      'u-700',
      expect.arrayContaining([expect.objectContaining({ PartNumber: 1 })]),
    )
    expect(res.body).toHaveProperty('video')
    expect(res.body.message).toMatch(/processed|complete/i)
  })

  it('marks the video as failed and returns 400 when ClamAV reports infected', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 800,
      userId: 42,
      r2Key: 'videos/u/infected.mp4',
      status: 'processing',
    })
    mocks.clamav.scanBufferWithClamAv.mockResolvedValue({ status: 'infected' })
    mocks.r2.getObject.mockResolvedValue({
      body: (async function* bad() {
        yield Buffer.from([0x11, 0x22])
      })(),
      contentType: 'video/mp4',
      contentLength: 2,
    })

    // Buffer up a valid first chunk so complete has parts to finalize.
    await request(app)
      .post('/api/video/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-id', 'u-800')
      .set('x-r2-key', 'videos/u/infected.mp4')
      .set('x-part-number', '1')
      .set('x-video-id', '800')
      .send(makeMp4Buffer(1024))

    const res = await request(app)
      .post('/api/video/upload/complete')
      .send({ videoId: 800, uploadId: 'u-800', r2Key: 'videos/u/infected.mp4' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/security scan/i)
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/infected.mp4')
    expect(mocks.prisma.video.update).toHaveBeenCalledWith({
      where: { id: 800 },
      data: { status: 'failed' },
    })
  })
})

/* ===================================================================== */
/* POST /api/video/upload/abort                                           */
/* ===================================================================== */
describe('video.routes POST /api/video/upload/abort', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/video/upload/abort').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the caller does not own the video', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 900, userId: 999 })

    const res = await request(app)
      .post('/api/video/upload/abort')
      .send({ videoId: 900, uploadId: 'u-900', r2Key: 'videos/u/x.mp4' })

    expect(res.status).toBe(404)
    expect(mocks.r2.abortMultipartUpload).not.toHaveBeenCalled()
  })

  it('aborts the R2 multipart upload and deletes the Video row', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 1000, userId: 42 })
    mocks.prisma.video.delete.mockResolvedValue({ id: 1000 })

    const res = await request(app)
      .post('/api/video/upload/abort')
      .send({ videoId: 1000, uploadId: 'u-1000', r2Key: 'videos/u/x.mp4' })

    expect(res.status).toBe(200)
    expect(mocks.r2.abortMultipartUpload).toHaveBeenCalledWith('videos/u/x.mp4', 'u-1000')
    expect(mocks.prisma.video.delete).toHaveBeenCalledWith({ where: { id: 1000 } })
  })
})

/* ===================================================================== */
/* GET /api/video/:id/stream                                              */
/* ===================================================================== */
describe('video.routes GET /api/video/:id/stream', () => {
  it('returns 404 when the video is missing', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/video/1100/stream')
    expect(res.status).toBe(404)
  })

  it('returns 409 when the video is not yet ready', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1200,
      userId: 42,
      status: 'processing',
    })
    const res = await request(app).get('/api/video/1200/stream')
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/processing/i)
  })

  it('returns 403 when downloadable=false and the caller is not the owner', async () => {
    mocks.state.userId = 7
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1300,
      userId: 99,
      status: 'ready',
      downloadable: false,
      r2Key: 'k',
      variants: { '720p': { key: 'k-720' } },
    })
    const res = await request(app).get('/api/video/1300/stream')
    expect(res.status).toBe(403)
    expect(mocks.r2.getSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('returns a signed URL when owner requests stream on downloadable=false video', async () => {
    mocks.state.userId = 42
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1400,
      userId: 42,
      status: 'ready',
      downloadable: false,
      r2Key: 'k',
      variants: { '720p': { key: 'k-720' } },
    })
    mocks.r2.getSignedDownloadUrl.mockResolvedValue('https://signed.example/owner')

    const res = await request(app).get('/api/video/1400/stream')
    expect(res.status).toBe(200)
    expect(res.body.url).toBe('https://signed.example/owner')
  })

  it('picks the requested quality variant when ?quality=720p is provided', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1500,
      userId: 42,
      status: 'ready',
      downloadable: true,
      r2Key: 'k',
      variants: {
        '360p': { key: 'k-360' },
        '720p': { key: 'k-720' },
        '1080p': { key: 'k-1080' },
      },
    })

    await request(app).get('/api/video/1500/stream?quality=720p')

    expect(mocks.r2.getSignedDownloadUrl).toHaveBeenCalledWith('k-720', 3600)
  })

  it('falls back to the highest available variant when no quality is specified', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1600,
      userId: 42,
      status: 'ready',
      downloadable: true,
      r2Key: 'k',
      variants: {
        '360p': { key: 'k-360' },
        '720p': { key: 'k-720' },
      },
    })

    await request(app).get('/api/video/1600/stream')

    expect(mocks.r2.getSignedDownloadUrl).toHaveBeenCalledWith('k-720', 3600)
  })
})

/* ===================================================================== */
/* PATCH /api/video/:id                                                   */
/* ===================================================================== */
describe('video.routes PATCH /api/video/:id', () => {
  it('returns 404 when the video is missing', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/api/video/1700').send({ title: 't' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not the owner', async () => {
    mocks.state.userId = 7
    mocks.prisma.video.findUnique.mockResolvedValue({ userId: 99 })
    const res = await request(app).patch('/api/video/1800').send({ title: 'x' })
    expect(res.status).toBe(403)
    expect(mocks.prisma.video.update).not.toHaveBeenCalled()
  })

  it('returns 400 when no updatable fields are provided', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ userId: 42 })
    const res = await request(app).patch('/api/video/1900').send({})
    expect(res.status).toBe(400)
    expect(mocks.prisma.video.update).not.toHaveBeenCalled()
  })

  it('updates only allowlisted fields (title, description, downloadable) and ignores disallowed ones', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ userId: 42 })
    mocks.prisma.video.update.mockResolvedValue({
      id: 2000,
      userId: 42,
      title: 'New Title',
      description: 'New Desc',
      downloadable: false,
      variants: {},
      captions: [],
    })

    const res = await request(app).patch('/api/video/2000').send({
      title: 'New Title',
      description: 'New Desc',
      downloadable: false,
      // Disallowed fields — must NOT appear in the Prisma update call.
      contentHash: 'hacked',
      userId: 999,
      r2Key: 'attacker-key',
      status: 'ready',
    })

    expect(res.status).toBe(200)
    const [updateArg] = mocks.prisma.video.update.mock.calls[0]
    expect(updateArg.data).toEqual({
      title: 'New Title',
      description: 'New Desc',
      downloadable: false,
    })
    expect(updateArg.data.contentHash).toBeUndefined()
    expect(updateArg.data.userId).toBeUndefined()
    expect(updateArg.data.r2Key).toBeUndefined()
    expect(updateArg.data.status).toBeUndefined()
  })

  it('returns 400 for an invalid downloadable value', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ userId: 42 })
    const res = await request(app).patch('/api/video/2100').send({ downloadable: 'maybe' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/downloadable/i)
  })

  it('truncates title and description to their max lengths', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ userId: 42 })
    mocks.prisma.video.update.mockResolvedValue({ id: 2200, userId: 42 })

    const longTitle = 'T'.repeat(500)
    const longDesc = 'D'.repeat(5000)

    await request(app).patch('/api/video/2200').send({ title: longTitle, description: longDesc })

    const [updateArg] = mocks.prisma.video.update.mock.calls[0]
    expect(updateArg.data.title.length).toBe(200)
    expect(updateArg.data.description.length).toBe(2000)
  })
})

/* ===================================================================== */
/* POST /api/video/:id/appeal                                             */
/* ===================================================================== */
describe('video.routes POST /api/video/:id/appeal', () => {
  it('returns 400 when reason is missing or too short', async () => {
    const r1 = await request(app).post('/api/video/2300/appeal').send({})
    expect(r1.status).toBe(400)

    const r2res = await request(app).post('/api/video/2300/appeal').send({ reason: 'short' })
    expect(r2res.status).toBe(400)
  })

  it('returns 404 when the video does not exist', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/video/2400/appeal')
      .send({ reason: 'This is a thoughtful reason for appeal.' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not the owner', async () => {
    mocks.state.userId = 7
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 2500,
      userId: 99,
      status: 'blocked',
    })
    const res = await request(app)
      .post('/api/video/2500/appeal')
      .send({ reason: 'A valid reason that is long enough.' })
    expect(res.status).toBe(403)
  })

  it('returns 400 when the video status is not blocked', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 2600,
      userId: 42,
      status: 'ready',
    })
    const res = await request(app)
      .post('/api/video/2600/appeal')
      .send({ reason: 'A valid reason that is long enough.' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/blocked/i)
  })

  it('returns 409 when an appeal is already pending', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 2700,
      userId: 42,
      status: 'blocked',
      contentHash: 'h1',
    })
    mocks.prisma.videoAppeal.findFirst.mockResolvedValue({ id: 1, status: 'pending' })

    const res = await request(app)
      .post('/api/video/2700/appeal')
      .send({ reason: 'A valid reason that is long enough.' })

    expect(res.status).toBe(409)
    expect(mocks.prisma.videoAppeal.create).not.toHaveBeenCalled()
  })

  it('returns 400 when the original video cannot be located', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 2800,
      userId: 42,
      status: 'blocked',
      contentHash: 'h-missing',
    })
    mocks.prisma.videoAppeal.findFirst.mockResolvedValue(null)
    mocks.prisma.video.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/video/2800/appeal')
      .send({ reason: 'A valid reason that is long enough.' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/original/i)
  })

  it('creates the appeal and returns it on the happy path', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 2900,
      userId: 42,
      status: 'blocked',
      contentHash: 'h-shared',
    })
    mocks.prisma.videoAppeal.findFirst.mockResolvedValue(null)
    mocks.prisma.video.findFirst.mockResolvedValue({ id: 123, userId: 77, status: 'ready' })
    mocks.prisma.videoAppeal.create.mockResolvedValue({
      id: 55,
      videoId: 2900,
      uploaderId: 42,
      originalVideoId: 123,
      status: 'pending',
    })

    const res = await request(app)
      .post('/api/video/2900/appeal')
      .send({ reason: 'I own this and uploaded it myself.' })

    expect(res.status).toBe(200)
    expect(res.body.appeal).toMatchObject({ id: 55, status: 'pending' })
    expect(mocks.prisma.videoAppeal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videoId: 2900,
        uploaderId: 42,
        originalVideoId: 123,
        reason: 'I own this and uploaded it myself.',
      }),
    })
  })
})

/* ===================================================================== */
/* POST /api/video/:id/captions                                           */
/* ===================================================================== */
describe('video.routes POST /api/video/:id/captions', () => {
  it('returns 404 when the caller does not own the video', async () => {
    mocks.state.userId = 7
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 3000, userId: 99 })

    const res = await request(app)
      .post('/api/video/3000/captions')
      .field('language', 'en')
      .field('label', 'English')
      .attach('file', Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHi'), {
        filename: 'en.vtt',
        contentType: 'text/vtt',
      })

    expect(res.status).toBe(404)
  })

  it('returns 400 when language or label is missing', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 3100,
      userId: 42,
      r2Key: 'videos/u/a.mp4',
    })

    const res = await request(app)
      .post('/api/video/3100/captions')
      .attach('file', Buffer.from('WEBVTT\n'), {
        filename: 'en.vtt',
        contentType: 'text/vtt',
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/language and label/i)
  })

  it('returns 400 when no file is attached', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 3200,
      userId: 42,
      r2Key: 'videos/u/a.mp4',
    })

    const res = await request(app)
      .post('/api/video/3200/captions')
      .field('language', 'en')
      .field('label', 'English')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/VTT file/i)
  })

  it('returns 400 when the max caption language limit is reached', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 3300,
      userId: 42,
      r2Key: 'videos/u/a.mp4',
    })
    mocks.prisma.videoCaption.count.mockResolvedValue(10) // already at the cap

    const res = await request(app)
      .post('/api/video/3300/captions')
      .field('language', 'fr')
      .field('label', 'French')
      .attach('file', Buffer.from('WEBVTT\n'), {
        filename: 'fr.vtt',
        contentType: 'text/vtt',
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Maximum/i)
    expect(mocks.r2.uploadObject).not.toHaveBeenCalled()
  })

  it('uploads the VTT to R2 and upserts the caption record', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 3400,
      userId: 42,
      r2Key: 'videos/u/a.mp4',
    })
    mocks.prisma.videoCaption.count.mockResolvedValue(0)
    mocks.r2.uploadObject.mockResolvedValue(undefined)
    mocks.prisma.videoCaption.upsert.mockResolvedValue({
      id: 10,
      videoId: 3400,
      language: 'en',
      label: 'English',
      vttR2Key: 'videos/u/a.mp4.en.vtt',
    })

    const res = await request(app)
      .post('/api/video/3400/captions')
      .field('language', 'en')
      .field('label', 'English')
      .attach('file', Buffer.from('WEBVTT\n'), {
        filename: 'en.vtt',
        contentType: 'text/vtt',
      })

    expect(res.status).toBe(201)
    expect(mocks.r2.uploadObject).toHaveBeenCalledWith(
      'videos/u/a.mp4.en.vtt',
      expect.any(Buffer),
      { contentType: 'text/vtt' },
    )
    expect(mocks.prisma.videoCaption.upsert).toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* DELETE /api/video/:id/captions/:language                               */
/* ===================================================================== */
describe('video.routes DELETE /api/video/:id/captions/:language', () => {
  it('returns 404 when the caller does not own the video', async () => {
    mocks.state.userId = 7
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 3500, userId: 99 })

    const res = await request(app).delete('/api/video/3500/captions/en')
    expect(res.status).toBe(404)
  })

  it('returns 404 when the caption does not exist', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 3600, userId: 42 })
    mocks.prisma.videoCaption.findUnique.mockResolvedValue(null)

    const res = await request(app).delete('/api/video/3600/captions/en')
    expect(res.status).toBe(404)
    expect(mocks.r2.deleteObject).not.toHaveBeenCalled()
  })

  it('deletes the caption from R2 and the database', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({ id: 3700, userId: 42 })
    mocks.prisma.videoCaption.findUnique.mockResolvedValue({
      id: 1,
      videoId: 3700,
      language: 'en',
      vttR2Key: 'videos/u/a.mp4.en.vtt',
    })
    mocks.prisma.videoCaption.delete.mockResolvedValue({ id: 1 })

    const res = await request(app).delete('/api/video/3700/captions/en')
    expect(res.status).toBe(204)
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/a.mp4.en.vtt')
    expect(mocks.prisma.videoCaption.delete).toHaveBeenCalledWith({
      where: { videoId_language: { videoId: 3700, language: 'en' } },
    })
  })
})

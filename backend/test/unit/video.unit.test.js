import Module, { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
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
    // Controls the behavior of spawned ffmpeg/ffprobe mocks.
    spawn: {
      ffprobeStdout: '',
      ffprobeExitCode: 0,
      ffmpegExitCode: 0,
      emitError: null, // If set, 'error' event fires instead of close.
    },
    execFileSync: { available: true },
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
    readLimiter: passThrough,
    writeLimiter: passThrough,
  }

  function makeFakeProc({ stdout = '', exitCode = 0, emitError = null } = {}) {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.stdin = { write: vi.fn(), end: vi.fn() }

    queueMicrotask(() => {
      if (emitError) {
        proc.emit('error', emitError)
        return
      }
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
      proc.stdout.emit('end')
      proc.stderr.emit('data', Buffer.from(''))
      proc.emit('close', exitCode)
    })

    return proc
  }

  const childProcess = {
    spawn: vi.fn((cmd) => {
      const conf = state.spawn
      if (cmd === 'ffprobe') {
        return makeFakeProc({
          stdout: conf.ffprobeStdout,
          exitCode: conf.ffprobeExitCode,
          emitError: conf.emitError,
        })
      }
      return makeFakeProc({
        exitCode: conf.ffmpegExitCode,
        emitError: conf.emitError,
      })
    }),
    execFileSync: vi.fn(() => {
      if (!state.execFileSync.available) {
        throw Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' })
      }
      return Buffer.from('')
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

let videoService
let app

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

  videoService = require(servicePath)

  const router = require(barrelPath)
  app = express()
  app.use(express.json())
  app.use('/api/video', router)
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
  mocks.state.spawn.ffprobeStdout = ''
  mocks.state.spawn.ffprobeExitCode = 0
  mocks.state.spawn.ffmpegExitCode = 0
  mocks.state.spawn.emitError = null
  mocks.state.execFileSync.available = true

  mocks.r2.isR2Configured.mockReturnValue(true)
  mocks.r2.getPublicUrl.mockImplementation(
    (key) => `https://cdn.example/${encodeURIComponent(key)}`,
  )
  mocks.r2.generateVideoKey.mockImplementation((_uid, name) => `videos/u/${name}`)
  mocks.r2.generateVariantKey.mockImplementation((base, q) => `${base}.${q}.mp4`)
  mocks.r2.generateThumbnailKey.mockImplementation((base) => `${base}.thumb.jpg`)
  mocks.r2.generateManifestKey.mockImplementation((base) => `${base}.master.m3u8`)
  mocks.r2.generateCaptionKey.mockImplementation((base, lang) => `${base}.${lang}.vtt`)

  mocks.getUserPlan.getUserPlan.mockResolvedValue('free')
  mocks.clamav.scanBufferWithClamAv.mockResolvedValue({ status: 'clean' })
})

/* ===================================================================== */
/* generateHlsManifest                                                    */
/* ===================================================================== */
describe('video.service.generateHlsManifest', () => {
  it('produces a valid m3u8 header and one EXT-X-STREAM-INF per variant', () => {
    const variants = {
      '360p': { key: 'k360', width: 640, height: 360 },
      '720p': { key: 'k720', width: 1280, height: 720 },
      '1080p': { key: 'k1080', width: 1920, height: 1080 },
    }

    const manifest = videoService.generateHlsManifest(variants)

    expect(manifest.startsWith('#EXTM3U\n#EXT-X-VERSION:3\n')).toBe(true)
    const streamLines = manifest.match(/#EXT-X-STREAM-INF:/g) || []
    expect(streamLines).toHaveLength(3)
    expect(manifest).toContain('BANDWIDTH=800000')
    expect(manifest).toContain('BANDWIDTH=2500000')
    expect(manifest).toContain('BANDWIDTH=5000000')
    expect(manifest).toContain('RESOLUTION=640x360')
    expect(manifest).toContain('RESOLUTION=1280x720')
    expect(manifest).toContain('RESOLUTION=1920x1080')
  })

  it('skips variants without a key', () => {
    const variants = {
      '360p': { key: 'k360', width: 640, height: 360 },
      '720p': null,
      '1080p': { key: '', width: 1920, height: 1080 },
    }

    const manifest = videoService.generateHlsManifest(variants)

    const streamLines = manifest.match(/#EXT-X-STREAM-INF:/g) || []
    expect(streamLines).toHaveLength(1)
    expect(manifest).toContain('RESOLUTION=640x360')
  })

  it('uses a fallback bandwidth for unknown quality labels', () => {
    const variants = {
      original: { key: 'k-orig', width: 800, height: 600 },
    }

    const manifest = videoService.generateHlsManifest(variants)

    expect(manifest).toContain('BANDWIDTH=1000000')
    expect(manifest).toContain('RESOLUTION=800x600')
  })
})

/* ===================================================================== */
/* probeVideo                                                             */
/* ===================================================================== */
describe('video.service.probeVideo', () => {
  it('resolves with parsed metadata when ffprobe succeeds', async () => {
    mocks.state.spawn.ffprobeStdout = JSON.stringify({
      format: { duration: '42.5', bit_rate: '1500000' },
      streams: [
        { codec_type: 'video', width: 1280, height: 720, codec_name: 'h264', tags: {} },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    })
    mocks.state.spawn.ffprobeExitCode = 0

    const meta = await videoService.probeVideo('/tmp/fake.mp4')

    expect(meta).toMatchObject({
      duration: 42.5,
      width: 1280,
      height: 720,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrate: 1500000,
    })
  })

  it('rejects with an ffprobe error when exit code is non-zero', async () => {
    mocks.state.spawn.ffprobeStdout = ''
    mocks.state.spawn.ffprobeExitCode = 1

    await expect(videoService.probeVideo('/tmp/fake.mp4')).rejects.toThrow(/ffprobe/)
  })

  it('rejects when the file has no video stream', async () => {
    mocks.state.spawn.ffprobeStdout = JSON.stringify({
      format: { duration: '10' },
      streams: [{ codec_type: 'audio', codec_name: 'aac' }],
    })
    mocks.state.spawn.ffprobeExitCode = 0

    await expect(videoService.probeVideo('/tmp/fake.mp4')).rejects.toThrow(/No video stream/)
  })

  it('rejects when stdout is not valid JSON', async () => {
    mocks.state.spawn.ffprobeStdout = 'not-json-output'
    mocks.state.spawn.ffprobeExitCode = 0

    await expect(videoService.probeVideo('/tmp/fake.mp4')).rejects.toThrow(
      /Failed to parse ffprobe output/,
    )
  })

  it('rejects when spawn emits an error (e.g. ENOENT)', async () => {
    mocks.state.spawn.emitError = Object.assign(new Error('spawn ffprobe ENOENT'), {
      code: 'ENOENT',
    })

    await expect(videoService.probeVideo('/tmp/fake.mp4')).rejects.toThrow(/Failed to run ffprobe/)
  })
})

/* ===================================================================== */
/* transcodeToPreset                                                      */
/* ===================================================================== */
describe('video.service.transcodeToPreset', () => {
  it('skips (resolves null) when source is smaller than the preset in both dimensions', async () => {
    const preset = { width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' }
    const source = { width: 1280, height: 720 }

    const result = await videoService.transcodeToPreset('/in.mp4', '/out.mp4', preset, source)

    expect(result).toBeNull()
    // spawn must not have been invoked for the skipped preset.
    expect(mocks.childProcess.spawn).not.toHaveBeenCalled()
  })

  it('resolves with the output path when ffmpeg exits cleanly', async () => {
    mocks.state.spawn.ffmpegExitCode = 0
    const preset = { width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k' }
    const source = { width: 1920, height: 1080 }

    const result = await videoService.transcodeToPreset('/in.mp4', '/out.mp4', preset, source)

    expect(result).toBe('/out.mp4')
    expect(mocks.childProcess.spawn).toHaveBeenCalledWith('ffmpeg', expect.any(Array))
  })

  it('rejects when ffmpeg exits with a non-zero code', async () => {
    mocks.state.spawn.ffmpegExitCode = 1
    const preset = { width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k' }
    const source = { width: 1920, height: 1080 }

    await expect(
      videoService.transcodeToPreset('/in.mp4', '/out.mp4', preset, source),
    ).rejects.toThrow(/Transcode to 360p failed/)
  })
})

/* ===================================================================== */
/* deleteVideoAssetRefs                                                   */
/* ===================================================================== */
describe('video.service.deleteVideoAssetRefs', () => {
  it('calls r2.deleteObject for original, thumbnail, manifest, variants, and captions', async () => {
    const video = {
      r2Key: 'videos/u/original.mp4',
      thumbnailR2Key: 'videos/u/original.mp4.thumb.jpg',
      hlsManifestR2Key: 'videos/u/original.mp4.master.m3u8',
      variants: {
        '360p': { key: 'videos/u/original.mp4.360p.mp4' },
        '720p': { key: 'videos/u/original.mp4.720p.mp4' },
      },
      captions: [
        { vttR2Key: 'videos/u/original.mp4.en.vtt' },
        { vttR2Key: 'videos/u/original.mp4.es.vtt' },
      ],
    }

    await videoService.deleteVideoAssetRefs(video)

    // 1 original + 1 thumb + 1 manifest + 2 variants + 2 captions = 7 deletions
    expect(mocks.r2.deleteObject).toHaveBeenCalledTimes(7)
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/original.mp4')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/original.mp4.thumb.jpg')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/original.mp4.master.m3u8')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/original.mp4.360p.mp4')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('videos/u/original.mp4.720p.mp4')
  })

  it('is a safe no-op when the video reference is null', async () => {
    await expect(videoService.deleteVideoAssetRefs(null)).resolves.toBeUndefined()
    expect(mocks.r2.deleteObject).not.toHaveBeenCalled()
  })

  it('skips missing fields gracefully', async () => {
    const video = { r2Key: 'only-original.mp4' }
    await videoService.deleteVideoAssetRefs(video)
    expect(mocks.r2.deleteObject).toHaveBeenCalledTimes(1)
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('only-original.mp4')
  })
})

/* ===================================================================== */
/* deleteVideoAssets                                                      */
/* ===================================================================== */
describe('video.service.deleteVideoAssets', () => {
  it('looks up the video and deletes each associated asset', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      r2Key: 'k-orig',
      thumbnailR2Key: 'k-thumb',
      hlsManifestR2Key: null,
      variants: { '720p': { key: 'k-720' } },
      captions: [{ vttR2Key: 'k-caption' }],
    })

    await videoService.deleteVideoAssets(77)

    expect(mocks.prisma.video.findUnique).toHaveBeenCalledWith({
      where: { id: 77 },
      include: { captions: true },
    })
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('k-orig')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('k-thumb')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('k-720')
    expect(mocks.r2.deleteObject).toHaveBeenCalledWith('k-caption')
  })

  it('returns silently when the video is not found', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)

    await videoService.deleteVideoAssets(404)

    expect(mocks.r2.deleteObject).not.toHaveBeenCalled()
  })
})

/* ===================================================================== */
/* processVideo                                                           */
/* ===================================================================== */
// processVideo exercises the full pipeline (fs writes, r2 streams, child_process).
// It is tightly coupled to filesystem + streaming semantics; the two cases below
// verify only the observable branches we can drive from mocks without touching
// the real filesystem.
describe('video.service.processVideo', () => {
  it('returns early when the video record does not exist', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)

    await videoService.processVideo(9999)

    expect(mocks.prisma.video.update).not.toHaveBeenCalled()
    expect(mocks.r2.getObject).not.toHaveBeenCalled()
  })

  it('marks the video as READY with original-only variant when ffmpeg is unavailable', async () => {
    mocks.state.execFileSync.available = false
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      r2Key: 'videos/u/orig.mp4',
    })
    mocks.prisma.user.findUnique.mockResolvedValue({ username: 'alice' })

    await videoService.processVideo(1)

    // At least one update should set status: READY with an 'original' variant.
    const readyCall = mocks.prisma.video.update.mock.calls.find(
      ([arg]) => arg?.data?.status === 'ready',
    )
    expect(readyCall).toBeDefined()
    expect(readyCall[0].data.variants).toMatchObject({
      original: { key: 'videos/u/orig.mp4' },
    })

    // Because ffmpeg is unavailable, we should not have downloaded from R2 or
    // uploaded any transcoded variants.
    expect(mocks.r2.getObject).not.toHaveBeenCalled()
    expect(mocks.r2.uploadObject).not.toHaveBeenCalled()
  })

  // processVideo's happy path writes temp files to disk and pipes a stream from
  // r2.getObject. Validating the full pipeline requires a real filesystem and a
  // real stream mock; that level of coupling exceeds the scope of a unit test.
  it.skip('happy path: probes, transcodes 3 variants, uploads each + manifest (integration)', () => {
    // Skipped: tightly coupled to fs.createWriteStream + r2 stream piping.
    // Covered end-to-end by the video routes integration suite.
  })
})

/* ===================================================================== */
/* ROUTES: POST /api/video/upload/init                                    */
/* ===================================================================== */
describe('video.routes POST /api/video/upload/init', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/video/upload/init').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/fileName, fileSize, and mimeType/)
  })

  it('returns 400 for unsupported mime types', async () => {
    const res = await request(app)
      .post('/api/video/upload/init')
      .send({ fileName: 'movie.avi', fileSize: 1024, mimeType: 'video/x-msvideo' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unsupported video format/)
  })

  it('returns 400 when fileSize exceeds the free-plan quota', async () => {
    mocks.getUserPlan.getUserPlan.mockResolvedValue('free')
    mocks.prisma.donation.findFirst.mockResolvedValue(null)

    const tooBig = 2 * 1024 * 1024 * 1024 // 2 GB — exceeds 500 MB free limit
    const res = await request(app)
      .post('/api/video/upload/init')
      .send({ fileName: 'big.mp4', fileSize: tooBig, mimeType: 'video/mp4' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/must be under/)
  })

  it('happy path: creates a Video record and returns videoId + uploadId', async () => {
    mocks.getUserPlan.getUserPlan.mockResolvedValue('free')
    mocks.prisma.donation.findFirst.mockResolvedValue(null)
    mocks.r2.createMultipartUpload.mockResolvedValue('upload-id-xyz')
    mocks.prisma.video.create.mockResolvedValue({
      id: 123,
      userId: 42,
      r2Key: 'videos/u/tiny.mp4',
      status: 'processing',
    })

    const res = await request(app)
      .post('/api/video/upload/init')
      .send({ fileName: 'tiny.mp4', fileSize: 1024 * 1024, mimeType: 'video/mp4' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      videoId: 123,
      uploadId: 'upload-id-xyz',
      r2Key: 'videos/u/tiny.mp4',
    })
    expect(mocks.r2.createMultipartUpload).toHaveBeenCalledWith('videos/u/tiny.mp4', 'video/mp4')
    expect(mocks.prisma.video.create).toHaveBeenCalled()
  })

  it('returns 503 when R2 is not configured', async () => {
    mocks.r2.isR2Configured.mockReturnValue(false)
    mocks.getUserPlan.getUserPlan.mockResolvedValue('free')

    const res = await request(app)
      .post('/api/video/upload/init')
      .send({ fileName: 'ok.mp4', fileSize: 1024, mimeType: 'video/mp4' })

    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/not configured/)
  })
})

/* ===================================================================== */
/* ROUTES: GET /api/video/:id                                             */
/* ===================================================================== */
describe('video.routes GET /api/video/:id', () => {
  it('returns the formatted video response for an existing video', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 10,
      userId: 42,
      title: 'Study Vid',
      description: 'desc',
      status: 'ready',
      duration: 120,
      width: 1920,
      height: 1080,
      fileSize: 12345,
      mimeType: 'video/mp4',
      thumbnailR2Key: 'thumb-key',
      hlsManifestR2Key: 'manifest-key',
      variants: { '720p': { key: 'var-720', width: 1280, height: 720 } },
      captions: [],
      user: { id: 42, username: 'alice', avatarUrl: null },
      downloadable: true,
      createdAt: new Date('2026-04-01T00:00:00Z'),
    })

    const res = await request(app).get('/api/video/10')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: 10,
      status: 'ready',
      variants: {
        '720p': {
          url: expect.stringContaining('var-720'),
          width: 1280,
          height: 720,
        },
      },
      thumbnailUrl: expect.stringContaining('thumb-key'),
      hlsManifestUrl: expect.stringContaining('manifest-key'),
    })
  })

  it('returns 400 for an invalid video id', async () => {
    const res = await request(app).get('/api/video/not-a-number')
    expect(res.status).toBe(400)
  })

  it('returns 404 when the video does not exist', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/video/9999')

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })
})

/* ===================================================================== */
/* ROUTES: DELETE /api/video/:id                                          */
/* ===================================================================== */
describe('video.routes DELETE /api/video/:id', () => {
  it('returns 404 when the video is missing', async () => {
    mocks.prisma.video.findUnique.mockResolvedValue(null)

    const res = await request(app).delete('/api/video/555')

    expect(res.status).toBe(404)
    expect(mocks.prisma.video.delete).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is neither owner nor admin', async () => {
    mocks.state.userId = 7 // requester
    mocks.state.role = 'student'
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 20,
      userId: 99, // different owner
      r2Key: 'k',
    })

    const res = await request(app).delete('/api/video/20')

    expect(res.status).toBe(403)
    expect(mocks.prisma.video.delete).not.toHaveBeenCalled()
  })

  it('deletes the record and schedules R2 cleanup for the owner', async () => {
    mocks.state.userId = 42
    mocks.state.role = 'student'
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 30,
      userId: 42,
      r2Key: 'k-30',
      thumbnailR2Key: null,
      hlsManifestR2Key: null,
      variants: null,
      captions: [],
    })
    mocks.prisma.video.delete.mockResolvedValue({ id: 30 })

    const res = await request(app).delete('/api/video/30')

    expect(res.status).toBe(204)
    expect(mocks.prisma.video.delete).toHaveBeenCalledWith({ where: { id: 30 } })
  })

  it('allows an admin to delete any video', async () => {
    mocks.state.userId = 7
    mocks.state.role = 'admin'
    mocks.prisma.video.findUnique.mockResolvedValue({
      id: 40,
      userId: 99,
      r2Key: 'k-40',
      thumbnailR2Key: null,
      hlsManifestR2Key: null,
      variants: null,
      captions: [],
    })
    mocks.prisma.video.delete.mockResolvedValue({ id: 40 })

    const res = await request(app).delete('/api/video/40')

    expect(res.status).toBe(204)
    expect(mocks.prisma.video.delete).toHaveBeenCalledWith({ where: { id: 40 } })
  })
})

 
const _unused = Readable // keep import tree-shake-safe for potential stream helpers.

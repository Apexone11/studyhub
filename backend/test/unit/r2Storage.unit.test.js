import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const r2Path = require.resolve('../../src/lib/r2Storage')

const mocks = vi.hoisted(() => {
  const state = {
    sendImpl: null,
    signedUrlImpl: null,
  }

  class FakeCommand {
    constructor(input) {
      this.input = input
    }
  }

  const commandClasses = {
    PutObjectCommand: class PutObjectCommand extends FakeCommand {},
    GetObjectCommand: class GetObjectCommand extends FakeCommand {},
    DeleteObjectCommand: class DeleteObjectCommand extends FakeCommand {},
    HeadObjectCommand: class HeadObjectCommand extends FakeCommand {},
    CreateMultipartUploadCommand: class CreateMultipartUploadCommand extends FakeCommand {},
    UploadPartCommand: class UploadPartCommand extends FakeCommand {},
    CompleteMultipartUploadCommand: class CompleteMultipartUploadCommand extends FakeCommand {},
    AbortMultipartUploadCommand: class AbortMultipartUploadCommand extends FakeCommand {},
  }

  class FakeS3Client {
    constructor(config) {
      this.config = config
    }
    async send(command) {
      if (typeof state.sendImpl === 'function') {
        return state.sendImpl(command)
      }
      return {}
    }
  }

  const sendSpy = vi.fn()
  FakeS3Client.prototype.send = async function send(command) {
    sendSpy(command)
    if (typeof state.sendImpl === 'function') {
      return state.sendImpl(command)
    }
    return {}
  }

  const clientS3 = {
    S3Client: FakeS3Client,
    ...commandClasses,
  }

  const presigner = {
    getSignedUrl: vi.fn(async (_client, command, opts) => {
      if (typeof state.signedUrlImpl === 'function') {
        return state.signedUrlImpl(command, opts)
      }
      return 'https://signed.example/url'
    }),
  }

  const sentry = {
    captureError: vi.fn(),
  }

  return {
    state,
    clientS3,
    presigner,
    sentry,
    sendSpy,
    commandClasses,
    FakeS3Client,
  }
})

const mockTargets = new Map([[require.resolve('../../src/monitoring/sentry'), mocks.sentry]])

const namedModuleMocks = new Map([
  ['@aws-sdk/client-s3', mocks.clientS3],
  ['@aws-sdk/s3-request-presigner', mocks.presigner],
])

const originalModuleLoad = Module._load

let r2

const ORIGINAL_ENV = { ...process.env }

function loadR2WithEnv(env) {
  for (const key of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
  ]) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(env || {})) {
    process.env[key] = value
  }
  delete require.cache[r2Path]
  return require(r2Path)
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
  delete require.cache[r2Path]
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.sendImpl = null
  mocks.state.signedUrlImpl = null
  r2 = loadR2WithEnv({
    R2_ACCOUNT_ID: 'acct-xyz',
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'studyhub-test',
    R2_PUBLIC_URL: 'https://cdn.test.example',
  })
})

/* ===================================================================== */
/* Key generators                                                         */
/* ===================================================================== */
describe('r2Storage key generators', () => {
  it('generateVideoKey embeds userId, timestamp, random token, and lowercased ext', () => {
    const key = r2.generateVideoKey(42, 'Lecture.MP4')
    expect(key).toMatch(/^videos\/42\/\d+-[a-z0-9]{1,8}\.mp4$/)
  })

  it('generateVideoKey produces distinct keys across calls (collision avoidance)', () => {
    const seen = new Set()
    for (let i = 0; i < 50; i += 1) {
      seen.add(r2.generateVideoKey('u', 'v.mp4'))
    }
    expect(seen.size).toBe(50)
  })

  it('generateVariantKey, generateThumbnailKey, generateManifestKey, generateCaptionKey share a deterministic base dir', () => {
    const base = 'videos/7/1712345-abcd1234.mp4'
    expect(r2.generateVariantKey(base, '720p')).toBe('videos/7/1712345-abcd1234/720p.mp4')
    expect(r2.generateThumbnailKey(base)).toBe('videos/7/1712345-abcd1234/thumb.jpg')
    expect(r2.generateManifestKey(base)).toBe('videos/7/1712345-abcd1234/manifest.m3u8')
    expect(r2.generateCaptionKey(base, 'en')).toBe('videos/7/1712345-abcd1234/captions/en.vtt')
  })
})

/* ===================================================================== */
/* Configuration guard                                                    */
/* ===================================================================== */
describe('r2Storage configuration guard', () => {
  it('isR2Configured returns false when any credential env var is missing', () => {
    const m = loadR2WithEnv({
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: 'secret',
    })
    expect(m.isR2Configured()).toBe(false)
  })

  it('uploadObject, getObject, getSignedDownloadUrl reject when R2 is not configured', async () => {
    const m = loadR2WithEnv({})
    await expect(m.uploadObject('k', Buffer.from('x'))).rejects.toThrow(/not configured/)
    await expect(m.getObject('k')).rejects.toThrow(/not configured/)
    await expect(m.getSignedDownloadUrl('k')).rejects.toThrow(/not configured/)
  })

  it('deleteObject and abortMultipartUpload return silently when R2 is not configured', async () => {
    const m = loadR2WithEnv({})
    await expect(m.deleteObject('k')).resolves.toBeUndefined()
    await expect(m.abortMultipartUpload('k', 'up-1')).resolves.toBeUndefined()
  })
})

/* ===================================================================== */
/* Single-object operations                                               */
/* ===================================================================== */
describe('r2Storage single-object operations (happy paths)', () => {
  it('uploadObject sends a PutObjectCommand with key, body, and contentType and returns url', async () => {
    let received
    mocks.state.sendImpl = (command) => {
      received = command
      return {}
    }

    const body = Buffer.from('hello')
    const result = await r2.uploadObject('videos/u/file.mp4', body, {
      contentType: 'video/mp4',
      metadata: { owner: '42' },
    })

    expect(received).toBeInstanceOf(mocks.commandClasses.PutObjectCommand)
    expect(received.input).toMatchObject({
      Bucket: 'studyhub-test',
      Key: 'videos/u/file.mp4',
      Body: body,
      ContentType: 'video/mp4',
      Metadata: { owner: '42' },
    })
    expect(result).toEqual({
      key: 'videos/u/file.mp4',
      url: 'https://cdn.test.example/videos/u/file.mp4',
    })
  })

  it('uploadObject defaults contentType to application/octet-stream when not provided', async () => {
    let received
    mocks.state.sendImpl = (command) => {
      received = command
      return {}
    }
    await r2.uploadObject('k', Buffer.from('x'))
    expect(received.input.ContentType).toBe('application/octet-stream')
    expect(received.input.Metadata).toBeUndefined()
  })

  it('uploadObject propagates send() errors to the caller', async () => {
    mocks.state.sendImpl = () => {
      throw Object.assign(new Error('AccessDenied'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      })
    }
    await expect(r2.uploadObject('k', Buffer.from('x'))).rejects.toThrow(/AccessDenied/)
  })

  it('getObject returns body, contentType, and contentLength from the S3 response', async () => {
    const fakeBody = { [Symbol.asyncIterator]: () => ({ next: () => ({ done: true }) }) }
    mocks.state.sendImpl = () => ({
      Body: fakeBody,
      ContentType: 'image/png',
      ContentLength: 1024,
    })

    const result = await r2.getObject('images/logo.png')
    expect(result).toEqual({
      body: fakeBody,
      contentType: 'image/png',
      contentLength: 1024,
    })
  })

  it('getObject surfaces NoSuchKey errors for missing objects', async () => {
    mocks.state.sendImpl = () => {
      throw Object.assign(new Error('NoSuchKey'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      })
    }
    await expect(r2.getObject('missing')).rejects.toThrow(/NoSuchKey/)
  })

  it('deleteObject sends a DeleteObjectCommand for the configured bucket/key', async () => {
    let received
    mocks.state.sendImpl = (command) => {
      received = command
      return {}
    }
    await r2.deleteObject('videos/u/gone.mp4')
    expect(received).toBeInstanceOf(mocks.commandClasses.DeleteObjectCommand)
    expect(received.input).toEqual({ Bucket: 'studyhub-test', Key: 'videos/u/gone.mp4' })
  })

  it('deleteObject swallows errors and reports them to Sentry (idempotent behavior)', async () => {
    mocks.state.sendImpl = () => {
      throw new Error('boom')
    }
    await expect(r2.deleteObject('k')).resolves.toBeUndefined()
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)
    expect(mocks.sentry.captureError.mock.calls[0][1]).toMatchObject({
      context: 'r2-delete',
      key: 'k',
    })
  })

  it('objectExists returns true on HeadObject success and false on failure', async () => {
    mocks.state.sendImpl = () => ({})
    expect(await r2.objectExists('exists')).toBe(true)

    mocks.state.sendImpl = () => {
      throw Object.assign(new Error('NotFound'), { name: 'NotFound' })
    }
    expect(await r2.objectExists('missing')).toBe(false)
  })
})

/* ===================================================================== */
/* Signed URLs                                                            */
/* ===================================================================== */
describe('r2Storage signed URLs', () => {
  it('getSignedDownloadUrl delegates to presigner.getSignedUrl with GetObjectCommand and expiry', async () => {
    mocks.presigner.getSignedUrl.mockResolvedValueOnce('https://signed.example/get?sig=abc')
    const url = await r2.getSignedDownloadUrl('videos/u/file.mp4', 1800)
    expect(url).toBe('https://signed.example/get?sig=abc')

    const call = mocks.presigner.getSignedUrl.mock.calls[0]
    expect(call[1]).toBeInstanceOf(mocks.commandClasses.GetObjectCommand)
    expect(call[1].input).toMatchObject({ Bucket: 'studyhub-test', Key: 'videos/u/file.mp4' })
    expect(call[2]).toEqual({ expiresIn: 1800 })
  })

  it('getSignedUploadUrl delegates to presigner with PutObjectCommand + contentType', async () => {
    mocks.presigner.getSignedUrl.mockResolvedValueOnce('https://signed.example/put?sig=def')
    const url = await r2.getSignedUploadUrl('videos/u/new.mp4', 'video/mp4', 900)
    expect(url).toBe('https://signed.example/put?sig=def')

    const call = mocks.presigner.getSignedUrl.mock.calls[0]
    expect(call[1]).toBeInstanceOf(mocks.commandClasses.PutObjectCommand)
    expect(call[1].input).toMatchObject({
      Bucket: 'studyhub-test',
      Key: 'videos/u/new.mp4',
      ContentType: 'video/mp4',
    })
    expect(call[2]).toEqual({ expiresIn: 900 })
  })
})

/* ===================================================================== */
/* Multipart upload state machine                                         */
/* ===================================================================== */
describe('r2Storage multipart upload state machine', () => {
  it('createMultipartUpload returns the UploadId from the S3 response', async () => {
    mocks.state.sendImpl = (command) => {
      expect(command).toBeInstanceOf(mocks.commandClasses.CreateMultipartUploadCommand)
      expect(command.input).toMatchObject({
        Bucket: 'studyhub-test',
        Key: 'videos/u/big.mp4',
        ContentType: 'video/mp4',
      })
      return { UploadId: 'upload-id-abc' }
    }

    const uploadId = await r2.createMultipartUpload('videos/u/big.mp4', 'video/mp4')
    expect(uploadId).toBe('upload-id-abc')
  })

  it('uploadPart sends UploadPartCommand and returns ETag + PartNumber', async () => {
    mocks.state.sendImpl = (command) => {
      expect(command).toBeInstanceOf(mocks.commandClasses.UploadPartCommand)
      expect(command.input).toMatchObject({
        Bucket: 'studyhub-test',
        Key: 'k',
        UploadId: 'up-1',
        PartNumber: 3,
      })
      return { ETag: '"etag-3"' }
    }

    const result = await r2.uploadPart('k', 'up-1', 3, Buffer.from('chunk'))
    expect(result).toEqual({ ETag: '"etag-3"', PartNumber: 3 })
  })

  it('completeMultipartUpload sorts parts by PartNumber before sending', async () => {
    let received
    mocks.state.sendImpl = (command) => {
      received = command
      return {}
    }

    const parts = [
      { ETag: '"e3"', PartNumber: 3 },
      { ETag: '"e1"', PartNumber: 1 },
      { ETag: '"e2"', PartNumber: 2 },
    ]
    const result = await r2.completeMultipartUpload('videos/u/big.mp4', 'up-1', parts)

    expect(received).toBeInstanceOf(mocks.commandClasses.CompleteMultipartUploadCommand)
    expect(received.input.MultipartUpload.Parts.map((p) => p.PartNumber)).toEqual([1, 2, 3])
    expect(result).toEqual({
      key: 'videos/u/big.mp4',
      url: 'https://cdn.test.example/videos/u/big.mp4',
    })
  })

  it('abortMultipartUpload sends AbortCommand and swallows errors to Sentry', async () => {
    mocks.state.sendImpl = () => {
      throw new Error('already-aborted')
    }
    await expect(r2.abortMultipartUpload('k', 'up-1')).resolves.toBeUndefined()
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)
    expect(mocks.sentry.captureError.mock.calls[0][1]).toMatchObject({
      context: 'r2-abort-multipart',
      key: 'k',
      uploadId: 'up-1',
    })
  })

  it('multipart round-trip: create -> upload 2 parts -> complete produces a public url', async () => {
    const commandsSeen = []
    mocks.state.sendImpl = (command) => {
      commandsSeen.push(command.constructor.name)
      if (command instanceof mocks.commandClasses.CreateMultipartUploadCommand) {
        return { UploadId: 'up-xyz' }
      }
      if (command instanceof mocks.commandClasses.UploadPartCommand) {
        return { ETag: `"etag-${command.input.PartNumber}"` }
      }
      return {}
    }

    const uploadId = await r2.createMultipartUpload('videos/u/big.mp4', 'video/mp4')
    const p1 = await r2.uploadPart('videos/u/big.mp4', uploadId, 1, Buffer.from('a'))
    const p2 = await r2.uploadPart('videos/u/big.mp4', uploadId, 2, Buffer.from('b'))
    const final = await r2.completeMultipartUpload('videos/u/big.mp4', uploadId, [p2, p1])

    expect(commandsSeen).toEqual([
      'CreateMultipartUploadCommand',
      'UploadPartCommand',
      'UploadPartCommand',
      'CompleteMultipartUploadCommand',
    ])
    expect(p1.ETag).toBe('"etag-1"')
    expect(p2.ETag).toBe('"etag-2"')
    expect(final.url).toBe('https://cdn.test.example/videos/u/big.mp4')
  })
})

/* ===================================================================== */
/* URL helpers: getPublicUrl / extractObjectKeyFromUrl                    */
/* ===================================================================== */
describe('r2Storage URL helpers', () => {
  it('getPublicUrl uses R2_PUBLIC_URL when set', () => {
    expect(r2.getPublicUrl('a/b.mp4')).toBe('https://cdn.test.example/a/b.mp4')
  })

  it('getPublicUrl falls back to the API proxy path when R2_PUBLIC_URL is blank', () => {
    const m = loadR2WithEnv({})
    expect(m.getPublicUrl('a/b.mp4')).toBe('/api/video/media/a%2Fb.mp4')
  })

  it('extractObjectKeyFromUrl round-trips a public URL back to its key', () => {
    const key = 'videos/u/file.mp4'
    const url = r2.getPublicUrl(key)
    expect(r2.extractObjectKeyFromUrl(url)).toBe(key)
  })

  it('extractObjectKeyFromUrl returns null for unrelated hosts', () => {
    expect(r2.extractObjectKeyFromUrl('https://unrelated.example/some/path.mp4')).toBeNull()
  })
})

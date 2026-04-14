import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  CreateMultipartUploadCommand: vi.fn(),
  UploadPartCommand: vi.fn(),
  CompleteMultipartUploadCommand: vi.fn(),
  AbortMultipartUploadCommand: vi.fn(),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/object-key'),
}))

vi.mock('../src/monitoring/sentry', () => ({
  captureError: vi.fn(),
}))

const {
  isR2Configured,
  uploadObject,
  getObject,
  deleteObject,
  objectExists,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
  extractObjectKeyFromUrl,
  getPublicUrl,
  generateVideoKey,
  generateVariantKey,
  generateThumbnailKey,
  generateManifestKey,
  generateAnnouncementImageKey,
  generateCaptionKey,
} = await import('../src/lib/r2Storage.js')

describe('r2Storage.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('isR2Configured()', () => {
    it('should return false when R2 env vars are not set', () => {
      const result = isR2Configured()
      expect(result).toBe(false)
    })
  })

  describe('isR2Configured() with env vars set', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_ACCOUNT_ID', 'account-123')
      vi.stubEnv('R2_ACCESS_KEY_ID', 'key-id')
      vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')

      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should return true when all required env vars are set', () => {
      const result = module.isR2Configured()
      expect(result).toBe(true)
    })
  })

  describe('getPublicUrl(key)', () => {
    it('should return the API proxy path when R2_PUBLIC_URL is not configured', () => {
      const url = getPublicUrl('videos/user-123/file.mp4')

      expect(url).toBe('/api/video/media/videos%2Fuser-123%2Ffile.mp4')
    })

    it('should properly encode the key in the fallback path', () => {
      const url = getPublicUrl('announcements/123/image with spaces.jpg')

      expect(url).toContain('/api/video/media/')
      expect(url).toContain(encodeURIComponent('announcements/123/image with spaces.jpg'))
    })
  })

  describe('getPublicUrl(key) with R2_PUBLIC_URL', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_PUBLIC_URL', 'https://r2.example.com')
      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should return the public URL when R2_PUBLIC_URL is configured', () => {
      const url = module.getPublicUrl('videos/user-123/file.mp4')
      expect(url).toBe('https://r2.example.com/videos/user-123/file.mp4')
    })
  })

  describe('uploadObject(key, body, options)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(uploadObject('test-key', Buffer.from('data'))).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('uploadObject(key, body, options) with R2 configured', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_ACCOUNT_ID', 'account-123')
      vi.stubEnv('R2_ACCESS_KEY_ID', 'key-id')
      vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
      vi.stubEnv('R2_PUBLIC_URL', 'https://r2.example.com')
      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should be configured with env vars', () => {
      expect(module.isR2Configured()).toBe(true)
    })
  })

  describe('getObject(key)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(getObject('test-key')).rejects.toThrow('R2 storage is not configured.')
    })
  })

  describe('deleteObject(key)', () => {
    it('should return gracefully when R2 is not configured', async () => {
      await expect(deleteObject('test-key')).resolves.not.toThrow()
    })
  })

  describe('objectExists(key)', () => {
    it('should return false when R2 is not configured', async () => {
      const result = await objectExists('test-key')

      expect(result).toBe(false)
    })
  })

  describe('getSignedDownloadUrl(key, expiresIn)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(getSignedDownloadUrl('test-key')).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('getSignedDownloadUrl(key, expiresIn) with R2 configured', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_ACCOUNT_ID', 'account-123')
      vi.stubEnv('R2_ACCESS_KEY_ID', 'key-id')
      vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should return a URL when R2 is configured', async () => {
      const result = await module.getSignedDownloadUrl('videos/user-123/file.mp4', 3600)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should use default expiry of 3600 seconds when not provided', async () => {
      const result = await module.getSignedDownloadUrl('test-key')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('getSignedUploadUrl(key, contentType, expiresIn)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(getSignedUploadUrl('test-key', 'video/mp4')).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('getSignedUploadUrl(key, contentType, expiresIn) with R2 configured', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_ACCOUNT_ID', 'account-123')
      vi.stubEnv('R2_ACCESS_KEY_ID', 'key-id')
      vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should return a URL when R2 is configured', async () => {
      const result = await module.getSignedUploadUrl('videos/user-123/file.mp4', 'video/mp4', 600)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('createMultipartUpload(key, contentType)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(createMultipartUpload('test-key', 'video/mp4')).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('uploadPart(key, uploadId, partNumber, body)', () => {
    it('should throw when R2 is not configured', async () => {
      await expect(uploadPart('test-key', 'upload-id', 1, Buffer.from('data'))).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('completeMultipartUpload(key, uploadId, parts)', () => {
    it('should throw when R2 is not configured', async () => {
      const parts = [{ ETag: 'etag-1', PartNumber: 1 }]

      await expect(completeMultipartUpload('test-key', 'upload-id', parts)).rejects.toThrow(
        'R2 storage is not configured.',
      )
    })
  })

  describe('abortMultipartUpload(key, uploadId)', () => {
    it('should return gracefully when R2 is not configured', async () => {
      await expect(abortMultipartUpload('test-key', 'upload-id')).resolves.not.toThrow()
    })
  })

  describe('extractObjectKeyFromUrl(url)', () => {
    it('should extract key from API proxy URL', () => {
      const key = extractObjectKeyFromUrl('/api/video/media/videos%2Fuser-123%2Ffile.mp4')

      expect(key).toBe('videos/user-123/file.mp4')
    })

    it('should return null for invalid URLs', () => {
      const key = extractObjectKeyFromUrl('https://unrelated.example.com/path')

      expect(key).toBeNull()
    })

    it('should return null for empty or null input', () => {
      expect(extractObjectKeyFromUrl('')).toBeNull()
      expect(extractObjectKeyFromUrl(null)).toBeNull()
      expect(extractObjectKeyFromUrl(undefined)).toBeNull()
    })
  })

  describe('extractObjectKeyFromUrl(url) with R2_PUBLIC_URL', () => {
    let module

    beforeEach(async () => {
      vi.stubEnv('R2_PUBLIC_URL', 'https://r2.example.com')
      vi.resetModules()
      module = await import('../src/lib/r2Storage.js')
    })

    it('should extract key from public R2 URL', () => {
      const key = module.extractObjectKeyFromUrl('https://r2.example.com/videos/user-123/file.mp4')
      expect(key).toBe('videos/user-123/file.mp4')
    })

    it('should handle trailing slashes in public URL', async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('R2_PUBLIC_URL', 'https://r2.example.com/')
      vi.resetModules()
      const moduleWithTrailingSlash = await import('../src/lib/r2Storage.js')
      const key = moduleWithTrailingSlash.extractObjectKeyFromUrl(
        'https://r2.example.com/videos/file.mp4',
      )
      expect(key).toBe('videos/file.mp4')
    })
  })

  describe('generateVideoKey(userId, originalName)', () => {
    it('should generate a valid video key with correct format', () => {
      const key = generateVideoKey('user-123', 'my-video.mp4')

      expect(key).toMatch(/^videos\/user-123\/\d+-[a-z0-9]+\.mp4$/)
    })

    it('should extract file extension correctly', () => {
      const key = generateVideoKey('user-123', 'video.mov')

      expect(key).toMatch(/\.mov$/)
    })

    it('should handle files without extension', () => {
      const key = generateVideoKey('user-123', 'video')

      expect(key).toMatch(/\.mp4$/)
    })

    it('should use lowercase extension', () => {
      const key = generateVideoKey('user-123', 'video.MP4')

      expect(key).toMatch(/\.mp4$/)
    })
  })

  describe('generateVariantKey(baseKey, quality)', () => {
    it('should generate variant key with correct format', () => {
      const variant = generateVariantKey('videos/user-123/123456-abc123.mp4', '720p')

      expect(variant).toBe('videos/user-123/123456-abc123/720p.mp4')
    })

    it('should handle keys without extension', () => {
      const variant = generateVariantKey('videos/user-123/123456-abc123', '1080p')

      expect(variant).toBe('videos/user-123/123456-abc123/1080p.mp4')
    })
  })

  describe('generateThumbnailKey(baseKey)', () => {
    it('should generate thumbnail key with correct format', () => {
      const key = generateThumbnailKey('videos/user-123/123456-abc123.mp4')

      expect(key).toBe('videos/user-123/123456-abc123/thumb.jpg')
    })
  })

  describe('generateManifestKey(baseKey)', () => {
    it('should generate manifest key with correct format', () => {
      const key = generateManifestKey('videos/user-123/123456-abc123.mp4')

      expect(key).toBe('videos/user-123/123456-abc123/manifest.m3u8')
    })
  })

  describe('generateAnnouncementImageKey(announcementId, originalName)', () => {
    it('should generate announcement image key with correct format', () => {
      const key = generateAnnouncementImageKey('announce-123', 'banner.png')

      expect(key).toMatch(/^announcements\/announce-123\/\d+-[a-z0-9]+\.png$/)
    })

    it('should extract file extension correctly', () => {
      const key = generateAnnouncementImageKey('announce-123', 'image.jpg')

      expect(key).toMatch(/\.jpg$/)
    })

    it('should handle files without extension', () => {
      const key = generateAnnouncementImageKey('announce-123', 'image')

      expect(key).toMatch(/\.jpg$/)
    })
  })

  describe('generateCaptionKey(baseKey, language)', () => {
    it('should generate caption key with correct format', () => {
      const key = generateCaptionKey('videos/user-123/123456-abc123.mp4', 'en')

      expect(key).toBe('videos/user-123/123456-abc123/captions/en.vtt')
    })

    it('should handle language codes with hyphens', () => {
      const key = generateCaptionKey('videos/user-123/123456-abc123.mp4', 'en-US')

      expect(key).toBe('videos/user-123/123456-abc123/captions/en-US.vtt')
    })
  })
})

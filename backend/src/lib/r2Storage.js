/**
 * r2Storage.js — Cloudflare R2 (S3-compatible) object storage client
 *
 * Provides upload, download, delete, and signed URL generation for
 * videos, thumbnails, HLS manifests, captions, and announcement images.
 *
 * Environment variables:
 *   R2_ACCOUNT_ID        — Cloudflare account ID
 *   R2_ACCESS_KEY_ID     — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET_NAME       — Target bucket name
 *   R2_PUBLIC_URL        — Public bucket URL (if public access enabled)
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { captureError } = require('../monitoring/sentry')

// ── Configuration ────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'studyhub-media'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

let _client = null

/**
 * Lazily initialize the S3 client. Returns null if R2 is not configured,
 * allowing graceful degradation in dev/test environments.
 */
function getClient() {
  if (_client) return _client
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return _client
}

/**
 * Check whether R2 storage is configured and available.
 */
function isR2Configured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
}

// ── Single-Object Operations ─────────────────────────────────────────────

/**
 * Upload a buffer or stream to R2.
 * @param {string} key - Object key (path in bucket)
 * @param {Buffer|ReadableStream} body - File content
 * @param {object} options - { contentType, metadata }
 * @returns {Promise<{ key: string, url: string }>}
 */
async function uploadObject(key, body, options = {}) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: options.contentType || 'application/octet-stream',
    ...(options.metadata ? { Metadata: options.metadata } : {}),
  })

  await client.send(command)
  return { key, url: getPublicUrl(key) }
}

/**
 * Download an object from R2.
 * @param {string} key - Object key
 * @returns {Promise<{ body: ReadableStream, contentType: string, contentLength: number }>}
 */
async function getObject(key) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  const response = await client.send(command)
  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  }
}

/**
 * Delete an object from R2.
 * @param {string} key - Object key
 */
async function deleteObject(key) {
  const client = getClient()
  if (!client) return

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
    await client.send(command)
  } catch (err) {
    captureError(err, { context: 'r2-delete', key })
  }
}

/**
 * Check if an object exists in R2.
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
async function objectExists(key) {
  const client = getClient()
  if (!client) return false

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Generate a time-limited signed URL for private object access.
 * @param {string} key - Object key
 * @param {number} expiresIn - Seconds until expiry (default 3600 = 1 hour)
 * @returns {Promise<string>}
 */
async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Generate a signed URL for direct browser upload (PUT).
 * Allows the frontend to upload directly to R2 without proxying through Express.
 * @param {string} key - Destination object key
 * @param {string} contentType - Expected MIME type
 * @param {number} expiresIn - Seconds until expiry (default 600 = 10 min)
 * @returns {Promise<string>}
 */
async function getSignedUploadUrl(key, contentType, expiresIn = 600) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(client, command, { expiresIn })
}

// ── Multipart Upload Operations ──────────────────────────────────────────

/**
 * Initiate a multipart upload for large files (videos).
 * @param {string} key - Object key
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} uploadId
 */
async function createMultipartUpload(key, contentType) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  const response = await client.send(command)
  return response.UploadId
}

/**
 * Upload a single part of a multipart upload.
 * @param {string} key - Object key
 * @param {string} uploadId - Multipart upload ID
 * @param {number} partNumber - Part number (1-based)
 * @param {Buffer} body - Part content
 * @returns {Promise<{ ETag: string, PartNumber: number }>}
 */
async function uploadPart(key, uploadId, partNumber, body) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new UploadPartCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: body,
  })

  const response = await client.send(command)
  return { ETag: response.ETag, PartNumber: partNumber }
}

/**
 * Complete a multipart upload, assembling all parts into the final object.
 * @param {string} key - Object key
 * @param {string} uploadId - Multipart upload ID
 * @param {Array<{ ETag: string, PartNumber: number }>} parts - Completed parts
 * @returns {Promise<{ key: string, url: string }>}
 */
async function completeMultipartUpload(key, uploadId, parts) {
  const client = getClient()
  if (!client) throw new Error('R2 storage is not configured.')

  const command = new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  })

  await client.send(command)
  return { key, url: getPublicUrl(key) }
}

/**
 * Abort a multipart upload (cleanup on failure or cancellation).
 * @param {string} key - Object key
 * @param {string} uploadId - Multipart upload ID
 */
async function abortMultipartUpload(key, uploadId) {
  const client = getClient()
  if (!client) return

  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    })
    await client.send(command)
  } catch (err) {
    captureError(err, { context: 'r2-abort-multipart', key, uploadId })
  }
}

// ── URL Helpers ──────────────────────────────────────────────────────────

/**
 * Build the public URL for an R2 object.
 * Falls back to the API proxy path if no public URL is configured.
 */
function getPublicUrl(key) {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`
  }
  // Fallback: serve through the Express API proxy
  return `/api/video/media/${encodeURIComponent(key)}`
}

function extractObjectKeyFromUrl(url) {
  const value = String(url || '').trim()
  if (!value) return null

  if (R2_PUBLIC_URL) {
    const prefix = `${R2_PUBLIC_URL.replace(/\/$/, '')}/`
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length) || null
    }
  }

  try {
    const parsed = new URL(value, 'http://studyhub.local')
    const proxyPrefix = '/api/video/media/'
    if (parsed.pathname.startsWith(proxyPrefix)) {
      return decodeURIComponent(parsed.pathname.slice(proxyPrefix.length)) || null
    }
  } catch {
    return null
  }

  return null
}

/**
 * Generate a unique R2 key for a video file.
 * Format: videos/{userId}/{timestamp}-{random}.{ext}
 */
function generateVideoKey(userId, originalName) {
  const dotIndex = originalName.lastIndexOf('.')
  const ext = dotIndex > 0 ? originalName.slice(dotIndex + 1).toLowerCase() : 'mp4'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `videos/${userId}/${timestamp}-${random}.${ext}`
}

/**
 * Generate an R2 key for a video variant (transcoded quality).
 * Format: videos/{userId}/{baseId}/{quality}.mp4
 */
function generateVariantKey(baseKey, quality) {
  const dir = baseKey.replace(/\.[^.]+$/, '')
  return `${dir}/${quality}.mp4`
}

/**
 * Generate an R2 key for a video thumbnail.
 * Format: videos/{userId}/{baseId}/thumb.jpg
 */
function generateThumbnailKey(baseKey) {
  const dir = baseKey.replace(/\.[^.]+$/, '')
  return `${dir}/thumb.jpg`
}

/**
 * Generate an R2 key for an HLS manifest.
 * Format: videos/{userId}/{baseId}/manifest.m3u8
 */
function generateManifestKey(baseKey) {
  const dir = baseKey.replace(/\.[^.]+$/, '')
  return `${dir}/manifest.m3u8`
}

/**
 * Generate an R2 key for an announcement image.
 * Format: announcements/{announcementId}/{timestamp}-{random}.{ext}
 */
function generateAnnouncementImageKey(announcementId, originalName) {
  const dotIndex = originalName.lastIndexOf('.')
  const ext = dotIndex > 0 ? originalName.slice(dotIndex + 1).toLowerCase() : 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `announcements/${announcementId}/${timestamp}-${random}.${ext}`
}

/**
 * Generate an R2 key for a VTT caption file.
 * Format: videos/{userId}/{baseId}/captions/{language}.vtt
 */
function generateCaptionKey(baseKey, language) {
  const dir = baseKey.replace(/\.[^.]+$/, '')
  return `${dir}/captions/${language}.vtt`
}

module.exports = {
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
}

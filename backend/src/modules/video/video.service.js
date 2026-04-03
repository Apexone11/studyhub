/**
 * video.service.js — Video processing pipeline
 *
 * Handles:
 *   - Metadata extraction via ffprobe (duration, resolution, codecs)
 *   - Thumbnail generation at the 3-second mark
 *   - Multi-quality transcoding (360p, 720p, 1080p)
 *   - HLS manifest generation for adaptive bitrate streaming
 *   - Metadata stripping for security (EXIF, GPS, device info)
 *
 * Depends on:
 *   - ffmpeg / ffprobe available in PATH (installed on Railway Docker image)
 *   - r2Storage.js for uploading processed files to Cloudflare R2
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { captureError } = require('../../monitoring/sentry')
const r2 = require('../../lib/r2Storage')
const prisma = require('../../lib/prisma')
const { TRANSCODE_PRESETS, VIDEO_STATUS, VIDEO_DURATION_LIMITS, MAX_VIDEO_DURATION } = require('./video.constants')

// ── Temp directory for processing ────────────────────────────────────────
const TEMP_DIR = path.join(os.tmpdir(), 'studyhub-video')

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }
}

// ── ffprobe: Extract video metadata ──────────────────────────────────────

/**
 * Extract metadata from a video file using ffprobe.
 * @param {string} filePath - Path to the video file on disk
 * @returns {Promise<{ duration, width, height, videoCodec, audioCodec, bitrate }>}
 */
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]

    const proc = spawn('ffprobe', args)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`))
      }

      try {
        const data = JSON.parse(stdout)
        const videoStream = (data.streams || []).find((s) => s.codec_type === 'video')
        const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio')

        if (!videoStream) {
          return reject(new Error('No video stream found in file.'))
        }

        resolve({
          duration: parseFloat(data.format?.duration || videoStream.duration || 0),
          width: parseInt(videoStream.width, 10) || 0,
          height: parseInt(videoStream.height, 10) || 0,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name || null,
          bitrate: parseInt(data.format?.bit_rate, 10) || 0,
          rotation: parseInt(videoStream.tags?.rotate || '0', 10),
        })
      } catch (parseErr) {
        reject(new Error(`Failed to parse ffprobe output: ${parseErr.message}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to run ffprobe: ${err.message}`))
    })
  })
}

// ── Thumbnail generation ─────────────────────────────────────────────────

/**
 * Generate a thumbnail from a video file at a specific timestamp.
 * @param {string} inputPath - Source video path
 * @param {string} outputPath - Destination thumbnail path (.jpg)
 * @param {number} timestamp - Seek position in seconds (default 3)
 * @returns {Promise<string>} outputPath on success
 */
function generateThumbnail(inputPath, outputPath, timestamp = 3) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss',
      String(Math.min(timestamp, 3)),
      '-i',
      inputPath,
      '-vframes',
      '1',
      '-vf',
      'scale=640:-2',
      '-q:v',
      '3',
      outputPath,
    ]

    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    proc.on('close', (code) => {
      if (code !== 0)
        return reject(
          new Error(`Thumbnail generation failed (code ${code}): ${stderr.slice(-500)}`),
        )
      resolve(outputPath)
    })

    proc.on('error', (err) => reject(new Error(`Failed to run ffmpeg: ${err.message}`)))
  })
}

// ── Transcoding ──────────────────────────────────────────────────────────

/**
 * Transcode a video to a specific quality preset.
 * Strips all metadata for security (no EXIF, GPS, device info in output).
 * @param {string} inputPath - Source video
 * @param {string} outputPath - Destination file
 * @param {object} preset - { width, height, videoBitrate, audioBitrate }
 * @param {object} sourceInfo - { width, height } from probeVideo
 * @returns {Promise<string>} outputPath
 */
function transcodeToPreset(inputPath, outputPath, preset, sourceInfo) {
  return new Promise((resolve, reject) => {
    // Skip transcoding to a quality higher than the source
    if (sourceInfo.height < preset.height && sourceInfo.width < preset.width) {
      return resolve(null) // Signal: skip this preset
    }

    const args = [
      '-y',
      '-i',
      inputPath,
      // Video encoding
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-b:v',
      preset.videoBitrate,
      '-maxrate',
      preset.videoBitrate,
      '-bufsize',
      String(parseInt(preset.videoBitrate) * 2) + 'k',
      '-vf',
      `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
      // Audio encoding
      '-c:a',
      'aac',
      '-b:a',
      preset.audioBitrate,
      '-ar',
      '44100',
      // Strip ALL metadata for security
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      // MP4 fast-start (moov atom at beginning for streaming)
      '-movflags',
      '+faststart',
      // Output
      outputPath,
    ]

    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    proc.on('close', (code) => {
      if (code !== 0)
        return reject(
          new Error(`Transcode to ${preset.height}p failed (code ${code}): ${stderr.slice(-500)}`),
        )
      resolve(outputPath)
    })

    proc.on('error', (err) => reject(new Error(`Failed to run ffmpeg: ${err.message}`)))
  })
}

// ── HLS Manifest Generation ──────────────────────────────────────────────

/**
 * Generate a master HLS playlist (.m3u8) pointing to available quality variants.
 * @param {object} variants - { "360p": { key, width, height }, ... }
 * @returns {string} M3U8 manifest content
 */
function generateHlsManifest(variants) {
  let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n'

  const bandwidthMap = {
    '360p': 800000,
    '720p': 2500000,
    '1080p': 5000000,
  }

  for (const [quality, info] of Object.entries(variants)) {
    if (!info || !info.key) continue
    const bandwidth = bandwidthMap[quality] || 1000000
    const url = r2.getPublicUrl(info.key)
    manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${info.width}x${info.height}\n`
    manifest += `${url}\n`
  }

  return manifest
}

// ── Full Processing Pipeline ─────────────────────────────────────────────

/**
 * Process a newly uploaded video:
 *   1. Download the raw file from R2 to a temp directory
 *   2. Probe metadata (duration, resolution)
 *   3. Validate duration limit
 *   4. Generate thumbnail and upload to R2
 *   5. Transcode to available quality presets and upload each
 *   6. Generate HLS manifest and upload to R2
 *   7. Update the Video record with all metadata and variant info
 *
 * This runs as a fire-and-forget background job after upload completes.
 * @param {number} videoId - Video record ID
 */
async function processVideo(videoId) {
  ensureTempDir()

  const video = await prisma.video.findUnique({ where: { id: videoId } })
  if (!video) return

  const baseDir = path.join(TEMP_DIR, `v-${videoId}-${Date.now()}`)
  fs.mkdirSync(baseDir, { recursive: true })

  const rawPath = path.join(baseDir, 'raw.mp4')

  try {
    // 1. Download raw video from R2
    const { body } = await r2.getObject(video.r2Key)
    const writeStream = fs.createWriteStream(rawPath)
    await new Promise((resolve, reject) => {
      body.pipe(writeStream)
      body.on('error', reject)
      writeStream.on('finish', resolve)
    })

    // 2. Probe metadata
    const metadata = await probeVideo(rawPath)

    // 3. Validate duration based on user's subscription plan
    let userPlan = 'free'

    // Determine user plan (mirror of logic in routes)
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: video.userId },
        select: { plan: true, status: true },
      })
      if (sub && sub.status === 'active') {
        userPlan = sub.plan
      }
    } catch (e) {
      // Graceful degradation
    }

    if (userPlan === 'free') {
      try {
        const donation = await prisma.donation.findFirst({
          where: { userId: video.userId },
        })
        if (donation) {
          userPlan = 'donor'
        }
      } catch (e) {
        // Graceful degradation
      }
    }

    // Check if user is admin
    try {
      const user = await prisma.user.findUnique({
        where: { id: video.userId },
        select: { role: true },
      })
      if (user && user.role === 'admin') {
        userPlan = 'admin'
      }
    } catch (e) {
      // Graceful degradation
    }

    const maxDuration = VIDEO_DURATION_LIMITS[userPlan] || MAX_VIDEO_DURATION

    if (metadata.duration > maxDuration) {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: VIDEO_STATUS.FAILED },
      })
      cleanup(baseDir)
      return
    }

    // 4. Generate thumbnail
    let thumbnailR2Key = null
    try {
      const thumbPath = path.join(baseDir, 'thumb.jpg')
      const seekTo = Math.min(3, metadata.duration * 0.1)
      await generateThumbnail(rawPath, thumbPath, seekTo)

      const thumbKey = r2.generateThumbnailKey(video.r2Key)
      const thumbBuf = fs.readFileSync(thumbPath)
      await r2.uploadObject(thumbKey, thumbBuf, { contentType: 'image/jpeg' })
      thumbnailR2Key = thumbKey
    } catch (thumbErr) {
      captureError(thumbErr, { context: 'video-thumbnail', videoId })
      // Non-fatal: continue without thumbnail
    }

    // 5. Transcode to quality presets
    const variants = {}
    for (const [quality, preset] of Object.entries(TRANSCODE_PRESETS)) {
      try {
        const outPath = path.join(baseDir, `${quality}.mp4`)
        const result = await transcodeToPreset(rawPath, outPath, preset, metadata)
        if (result === null) continue // Source too small for this preset

        const variantKey = r2.generateVariantKey(video.r2Key, quality)
        const variantBuf = fs.readFileSync(outPath)
        await r2.uploadObject(variantKey, variantBuf, { contentType: 'video/mp4' })

        variants[quality] = {
          key: variantKey,
          width: preset.width,
          height: preset.height,
        }
      } catch (transcodeErr) {
        captureError(transcodeErr, { context: 'video-transcode', videoId, quality })
        // Continue with other presets
      }
    }

    // If no variants were created, use the original as the only source
    if (Object.keys(variants).length === 0) {
      variants['original'] = {
        key: video.r2Key,
        width: metadata.width,
        height: metadata.height,
      }
    }

    // 6. Generate HLS manifest
    let hlsManifestR2Key = null
    try {
      const manifestContent = generateHlsManifest(variants)
      const manifestKey = r2.generateManifestKey(video.r2Key)
      await r2.uploadObject(manifestKey, Buffer.from(manifestContent, 'utf-8'), {
        contentType: 'application/vnd.apple.mpegurl',
      })
      hlsManifestR2Key = manifestKey
    } catch (manifestErr) {
      captureError(manifestErr, { context: 'video-manifest', videoId })
    }

    // 7. Update the Video record
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: VIDEO_STATUS.READY,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        thumbnailR2Key,
        variants,
        hlsManifestR2Key,
      },
    })
  } catch (err) {
    captureError(err, { context: 'video-process-pipeline', videoId })

    // Mark as failed
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: VIDEO_STATUS.FAILED },
      })
    } catch {
      // Database update failed too — nothing more we can do
    }
  } finally {
    cleanup(baseDir)
  }
}

/**
 * Delete all R2 objects associated with a video (original, variants, thumbnail, manifest, captions).
 * @param {number} videoId
 */
async function deleteVideoAssets(videoId) {
  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { captions: true },
    })
    if (!video) return

    // Delete original
    if (video.r2Key) await r2.deleteObject(video.r2Key)

    // Delete thumbnail
    if (video.thumbnailR2Key) await r2.deleteObject(video.thumbnailR2Key)

    // Delete HLS manifest
    if (video.hlsManifestR2Key) await r2.deleteObject(video.hlsManifestR2Key)

    // Delete variants
    if (video.variants && typeof video.variants === 'object') {
      for (const info of Object.values(video.variants)) {
        if (info?.key) await r2.deleteObject(info.key)
      }
    }

    // Delete captions
    for (const caption of video.captions) {
      if (caption.vttR2Key) await r2.deleteObject(caption.vttR2Key)
    }
  } catch (err) {
    captureError(err, { context: 'video-delete-assets', videoId })
  }
}

/**
 * Clean up temporary processing directory.
 */
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup
  }
}

module.exports = {
  probeVideo,
  generateThumbnail,
  transcodeToPreset,
  generateHlsManifest,
  processVideo,
  deleteVideoAssets,
}

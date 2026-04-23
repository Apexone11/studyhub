/**
 * video.constants.js — Configuration constants for the video module
 */

// ── Upload limits ────────────────────────────────────────────────────────
// Duration limits by subscription tier (seconds)
const VIDEO_DURATION_LIMITS = {
  free: 30 * 60, // 30 minutes
  pro_monthly: 60 * 60, // 1 hour
  pro_yearly: 60 * 60, // 1 hour
  donor: 45 * 60, // 45 minutes
  admin: 2 * 60 * 60, // 2 hours
}

// Default fallback (for unknown plans)
const MAX_VIDEO_DURATION = VIDEO_DURATION_LIMITS.free

// File size limits by subscription tier (bytes)
const VIDEO_SIZE_LIMITS = {
  free: 500 * 1024 * 1024, // 500 MB
  pro_monthly: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
  pro_yearly: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
  donor: 1 * 1024 * 1024 * 1024, // 1 GB
  admin: 2 * 1024 * 1024 * 1024, // 2 GB
}

const MAX_VIDEO_SIZE = VIDEO_SIZE_LIMITS.free
const MAX_CAPTION_SIZE = 1 * 1024 * 1024 // 1 MB (VTT files)
const CHUNK_SIZE = 2 * 1024 * 1024 // 2 MB per upload chunk — Railway HTTP/2 proxy rejects bodies larger than ~2 MB
const MIN_CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB minimum (S3/R2 requirement)

// ── Allowed MIME types and magic bytes ───────────────────────────────────
const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
])

const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])

// Magic byte signatures for video file validation
const VIDEO_SIGNATURES = [
  {
    mime: 'video/mp4',
    bytes: [0x00, 0x00, 0x00],
    offset: 0,
    check: (buf) => buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp',
  },
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 },
  {
    mime: 'video/quicktime',
    bytes: [0x00, 0x00, 0x00],
    offset: 0,
    check: (buf) =>
      buf.length >= 8 &&
      (buf.toString('ascii', 4, 8) === 'ftyp' || buf.toString('ascii', 4, 8) === 'moov'),
  },
]

// ── Transcoding presets ──────────────────────────────────────────────────
const TRANSCODE_PRESETS = {
  '360p': { width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k' },
  '720p': { width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k' },
  '1080p': { width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
}

// ── Video status values ──────────────────────────────────────────────────
const VIDEO_STATUS = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
}

// ── Playback speed options (for frontend reference) ──────────────────────
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

// ── Caption constraints ──────────────────────────────────────────────────
const ALLOWED_CAPTION_MIMES = new Set(['text/vtt', 'text/plain'])
const ALLOWED_CAPTION_EXTENSIONS = new Set(['.vtt'])
const MAX_CAPTION_LANGUAGES = 10

module.exports = {
  MAX_VIDEO_SIZE,
  MAX_VIDEO_DURATION,
  VIDEO_DURATION_LIMITS,
  VIDEO_SIZE_LIMITS,
  MAX_CAPTION_SIZE,
  CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_VIDEO_EXTENSIONS,
  VIDEO_SIGNATURES,
  TRANSCODE_PRESETS,
  VIDEO_STATUS,
  PLAYBACK_SPEEDS,
  ALLOWED_CAPTION_MIMES,
  ALLOWED_CAPTION_EXTENSIONS,
  MAX_CAPTION_LANGUAGES,
}

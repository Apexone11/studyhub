/**
 * video.constants.js — Configuration constants for the video module.
 *
 * Subscription tier caps for video duration + size are derived from
 * the canonical PLANS spec in `payments.constants.js`. Earlier this
 * file hardcoded a flat 10-minute cap for every tier even though the
 * pricing page advertises Free=30 min / Donor=45 min / Pro=60 min —
 * users on paid tiers were silently denied the longer uploads they
 * paid for. Re-deriving from PLANS guarantees the two files can't
 * drift again. `admin` keeps a separate, generous cap because the
 * admin announcements feature lives in this same module and §2 of
 * the feature-expansion roadmap calls for longer official broadcasts
 * than student uploads.
 */

const { PLANS } = require('../payments/payments.constants')

// ── Upload limits ────────────────────────────────────────────────────────
// Duration limits by subscription tier (seconds). Derived from PLANS.
const VIDEO_DURATION_LIMITS = {
  free: PLANS.free.videoMinutes * 60,
  donor: PLANS.donor.videoMinutes * 60,
  pro_monthly: PLANS.pro_monthly.videoMinutes * 60,
  pro_yearly: PLANS.pro_yearly.videoMinutes * 60,
  // Admin uploads (announcements) get a 50% bump above Pro so official
  // broadcasts can run longer than student uploads. Matches the §2
  // roadmap "10-minute cap suggested" reasoning — we land at 90 min
  // because admin video is rare and content-quality vetted.
  admin: 90 * 60,
}

// Default fallback (for unknown plans / unauthenticated requests).
const MAX_VIDEO_DURATION = VIDEO_DURATION_LIMITS.free

// File size limits by subscription tier (bytes). Derived from PLANS,
// converted from MB to bytes here so the rest of the module can stay
// in bytes (multer / Range / chunk math).
const VIDEO_SIZE_LIMITS = {
  free: PLANS.free.videoSizeMb * 1024 * 1024,
  donor: PLANS.donor.videoSizeMb * 1024 * 1024,
  pro_monthly: PLANS.pro_monthly.videoSizeMb * 1024 * 1024,
  pro_yearly: PLANS.pro_yearly.videoSizeMb * 1024 * 1024,
  // Admin gets a slightly larger cap than Pro for announcement
  // archives. 2 GB matches what we used to hardcode here.
  admin: 2 * 1024 * 1024 * 1024,
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
// BLOCKED is set when an admin rejects a video (e.g. via the moderation
// queue). It's a real DB value already written elsewhere — having a
// constant here means feed gating, sweepers, and the appeal flow can
// reference it instead of typing the string literal in every file.
const VIDEO_STATUS = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
  BLOCKED: 'blocked',
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

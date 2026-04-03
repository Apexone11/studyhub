/**
 * constants.js -- Shared backend constants.
 *
 * Centralizes magic numbers, pagination defaults, rate-limiter windows,
 * and other values that were previously scattered across modules.
 */

// ── Pagination ──────────────────────────────────────────────────────────

/** Default page size when none is specified. */
const DEFAULT_PAGE_SIZE = 20

/** Maximum items a client can request in a single page. */
const MAX_PAGE_SIZE = 100

/** Convenience: clamp a user-supplied limit to safe bounds. */
function clampLimit(raw, { defaultSize = DEFAULT_PAGE_SIZE, maxSize = MAX_PAGE_SIZE } = {}) {
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 1) return defaultSize
  return Math.min(maxSize, n)
}

/** Parse and clamp page number (1-based). */
function clampPage(raw) {
  const n = parseInt(raw, 10)
  return !n || n < 1 ? 1 : n
}

// ── Rate-limiter window sizes (ms) ──────────────────────────────────────

const WINDOW_1_MIN = 60 * 1000
const WINDOW_5_MIN = 5 * 60 * 1000
const WINDOW_15_MIN = 15 * 60 * 1000
const WINDOW_1_HOUR = 60 * 60 * 1000
const WINDOW_1_DAY = 24 * 60 * 60 * 1000

// ── Content limits ──────────────────────────────────────────────────────

/** Max characters in a chat/DM message. Validated on both frontend and backend. */
const MAX_MESSAGE_LENGTH = 5000

/** Max characters in an announcement body. */
const MAX_ANNOUNCEMENT_LENGTH = 25000

/** Max characters in a donation message. */
const MAX_DONATION_MESSAGE_LENGTH = 500

// ── Time durations ──────────────────────────────────────────────────────
const DURATION_24H_MS = 24 * 60 * 60 * 1000
const DURATION_7D_MS = 7 * 24 * 60 * 60 * 1000
const DURATION_30D_MS = 30 * 24 * 60 * 60 * 1000

// ── Auth ────────────────────────────────────────────────────────────────
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000

// ── Upload size limits (bytes) ──────────────────────────────────────────
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const COVER_MAX_BYTES = 8 * 1024 * 1024

// ── Discovery scoring ───────────────────────────────────────────────────
const DISCOVERY_FETCH_MULTIPLIER = 3
const DISCOVERY_RECENCY_DECAY_HOURS = 24 * 30

module.exports = {
  // Pagination
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampLimit,
  clampPage,

  // Rate-limiter windows
  WINDOW_1_MIN,
  WINDOW_5_MIN,
  WINDOW_15_MIN,
  WINDOW_1_HOUR,
  WINDOW_1_DAY,

  // Content limits
  MAX_MESSAGE_LENGTH,
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_DONATION_MESSAGE_LENGTH,

  // Time durations
  DURATION_24H_MS,
  DURATION_7D_MS,
  DURATION_30D_MS,

  // Auth
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MS,

  // Upload size limits
  AVATAR_MAX_BYTES,
  ATTACHMENT_MAX_BYTES,
  COVER_MAX_BYTES,

  // Discovery scoring
  DISCOVERY_FETCH_MULTIPLIER,
  DISCOVERY_RECENCY_DECAY_HOURS,
}

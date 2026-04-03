/**
 * rateLimiters.js — Centralized rate limiter presets for all route modules.
 *
 * All rate limiters use express-rate-limit with standardHeaders (RateLimit-*)
 * and key on IP address by default. Custom keyGenerators can override (e.g., userId).
 *
 * Organized by feature/module for easy discovery and updates.
 */
const rateLimit = require('express-rate-limit')

// ── CATEGORY: Generic Base Limiters ────────────────────────────────────────

/**
 * Generic auth endpoints — strict limits.
 * 15 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Write/mutation operations — moderate limits.
 * 60 requests per minute per IP.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Read operations — generous limits.
 * 200 requests per minute per IP.
 */
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Admin endpoints — moderate limits.
 * 120 requests per minute per IP.
 */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
})

/**
 * Preview / resource-intensive endpoints.
 * 60 requests per minute per IP.
 */
const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many preview requests. Please slow down.' },
})

/**
 * Public/webhook endpoints — moderate limits.
 * 100 requests per 15-minute window per IP.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
})

// ── CATEGORY: Auth Module ──────────────────────────────────────────────────

/**
 * Login endpoint — 10 requests per 15 minutes per IP.
 */
const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
})

/**
 * Registration endpoint — 8 requests per 60 minutes per IP.
 */
const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
})

/**
 * Email verification endpoint — 25 requests per 15 minutes per IP.
 */
const authVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
})

/**
 * Password reset request — 5 requests per 15 minutes per IP.
 */
const authForgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
})

/**
 * Logout endpoint — 100 requests per 15 minutes per IP.
 */
const authLogoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Google OAuth sign-in — 20 requests per 15 minutes per IP.
 */
const authGoogleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Google sign-in attempts. Please try again later.' },
})

// ── CATEGORY: Feed Module ──────────────────────────────────────────────────

/**
 * Feed reactions (like, star) — 30 requests per minute per IP.
 */
const feedReactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Feed read operations — 600 requests per minute per IP.
 */
const feedReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feed requests. Please slow down.' },
})

/**
 * Feed write operations — 120 requests per 15 minutes per IP.
 */
const feedWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feed updates. Please slow down.' },
})

/**
 * Feed comments — 10 requests per 5 minutes per IP.
 */
const feedCommentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

/**
 * Feed attachment downloads — 120 requests per 15 minutes per IP.
 */
const feedAttachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment downloads. Please slow down.' },
})

/**
 * Authenticated feed operations — 240 requests per minute per IP.
 */
const feedAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authenticated feed requests. Please slow down.' },
})

/**
 * Leaderboard requests — 120 requests per minute per IP.
 */
const feedLeaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
})

/**
 * Feed discovery page — 120 requests per 15 minutes per IP.
 */
const feedDiscoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

// ── CATEGORY: Sheets Module ────────────────────────────────────────────────

/**
 * Sheet reactions (like, star) — 30 requests per minute per IP.
 */
const sheetReactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sheet write operations — 120 requests per 15 minutes per IP.
 */
const sheetWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sheet updates. Please slow down.' },
})

/**
 * Sheet comments — 10 requests per 5 minutes per IP.
 */
const sheetCommentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

/**
 * Contribution submissions — 60 requests per 15 minutes per IP.
 */
const sheetContributionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contribution requests. Please slow down.' },
})

/**
 * Contribution reviews — 60 requests per 15 minutes per IP.
 */
const sheetContributionReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contribution reviews. Please slow down.' },
})

/**
 * Sheet attachment downloads — 120 requests per 15 minutes per IP.
 */
const sheetAttachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment downloads. Please slow down.' },
})

/**
 * Sheet leaderboard — 120 requests per minute per IP.
 */
const sheetLeaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
})

/**
 * Sheet diff requests — 60 requests per minute per IP.
 */
const sheetDiffLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many diff requests. Please slow down.' },
})

/**
 * Sheet analytics — 120 requests per 15 minutes per IP.
 */
const sheetAnalyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analytics requests. Please wait.' },
})

// ── CATEGORY: Moderation Module ────────────────────────────────────────────

/**
 * Content appeals — 5 requests per 15 minutes per IP.
 */
const moderationAppealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many appeal submissions. Please try again later.' },
})

/**
 * Content reports — 10 requests per 60 minutes per IP.
 */
const moderationReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports. Please try again later.' },
})

// ── CATEGORY: Settings Module ──────────────────────────────────────────────

/**
 * Two-factor authentication setup — 10 requests per 15 minutes per IP.
 */
const settingsTwoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
})

// ── CATEGORY: Courses Module ───────────────────────────────────────────────

/**
 * School catalog requests — 120 requests per 15 minutes per IP.
 */
const coursesSchoolsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many school catalog requests. Please try again later.' },
})

// ── CATEGORY: Sharing Module ───────────────────────────────────────────────

/**
 * Sharing mutations (create, update, delete) — 30 requests per minute per IP.
 */
const sharingMutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sharing read operations — 120 requests per minute per IP.
 */
const sharingReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

// ── CATEGORY: Notes Module ────────────────────────────────────────────────

/**
 * Note mutations — 30 requests per minute per IP.
 */
const notesMutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Note read operations — 120 requests per minute per IP.
 */
const notesReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Note comments — 20 requests per minute per IP.
 */
const notesCommentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

// ── CATEGORY: Search Module ───────────────────────────────────────────────

/**
 * Global search — 120 requests per minute per IP.
 */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down.' },
})

// ── CATEGORY: Upload Module ───────────────────────────────────────────────

/**
 * Avatar uploads — 20 requests per 15 minutes per IP.
 */
const uploadAvatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many avatar uploads. Please wait a bit.' },
})

/**
 * Attachment uploads — 40 requests per 15 minutes per IP.
 */
const uploadAttachmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment uploads. Please wait a bit.' },
})

/**
 * Sheet cover image uploads — 10 requests per 15 minutes per IP.
 */
const uploadCoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many cover uploads. Please wait a bit.' },
})

/**
 * Content inline image uploads — 60 requests per 15 minutes per IP.
 */
const uploadContentImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many image uploads. Please wait a bit.' },
})

// ── CATEGORY: Users Module ────────────────────────────────────────────────

/**
 * Follow/unfollow operations — 30 requests per minute per IP.
 */
const usersFollowLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

// ── CATEGORY: WebAuthn Module ─────────────────────────────────────────────

/**
 * WebAuthn registration/authentication — 20 requests per 15 minutes per IP.
 */
const webauthnLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many WebAuthn requests. Please try again later.' },
})

// ── CATEGORY: Messaging Module ────────────────────────────────────────────

/**
 * Message write operations — 60 requests per minute per IP.
 */
const messagingWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please slow down.' },
})

// ── CATEGORY: AI Module ───────────────────────────────────────────────────

/**
 * AI message submissions (per-user) — uses custom keyGenerator for userId.
 * windowMs and max should be overridden with AI_RATE_LIMIT_RPM from ai.constants.
 * Example: 60 requests per minute per authenticated user.
 */
const createAiMessageLimiter = (rpmLimit) => rateLimit({
  windowMs: 60 * 1000,
  max: rpmLimit,
  keyGenerator: (req) => `ai_${req.user.userId}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a moment.' },
})

// ── CATEGORY: Sheet Activity / Readme ─────────────────────────────────────

/**
 * Sheet activity feed — 120 requests per minute per IP.
 */
const sheetActivityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sheet readme extras — 120 requests per minute per IP.
 */
const sheetReadmeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

// ── CATEGORY: Library Module ──────────────────────────────────────────────

/**
 * Library write operations (shelves, bookmarks, highlights) — 60 requests per minute per IP.
 */
const libraryWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many library requests. Please slow down.' },
})

const exportDataLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Data export limit reached. You can export your data up to 3 times per day.' },
  keyGenerator: (req) => req.user?.userId || req.ip,
})

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Base limiters
  authLimiter,
  writeLimiter,
  readLimiter,
  adminLimiter,
  previewLimiter,
  publicLimiter,

  // Auth module
  authLoginLimiter,
  authRegisterLimiter,
  authVerificationLimiter,
  authForgotLimiter,
  authLogoutLimiter,
  authGoogleLimiter,

  // Feed module
  feedReactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  feedCommentLimiter,
  feedAttachmentDownloadLimiter,
  feedAuthLimiter,
  feedLeaderboardLimiter,
  feedDiscoveryLimiter,

  // Sheets module
  sheetReactLimiter,
  sheetWriteLimiter,
  sheetCommentLimiter,
  sheetContributionLimiter,
  sheetContributionReviewLimiter,
  sheetAttachmentDownloadLimiter,
  sheetLeaderboardLimiter,
  sheetDiffLimiter,
  sheetAnalyticsLimiter,
  sheetActivityLimiter,
  sheetReadmeLimiter,

  // Moderation module
  moderationAppealLimiter,
  moderationReportLimiter,

  // Settings module
  settingsTwoFaLimiter,

  // Courses module
  coursesSchoolsLimiter,

  // Sharing module
  sharingMutateLimiter,
  sharingReadLimiter,

  // Notes module
  notesMutateLimiter,
  notesReadLimiter,
  notesCommentLimiter,

  // Search module
  searchLimiter,

  // Upload module
  uploadAvatarLimiter,
  uploadAttachmentLimiter,
  uploadCoverLimiter,
  uploadContentImageLimiter,

  // Users module
  usersFollowLimiter,

  // WebAuthn module
  webauthnLimiter,

  // Messaging module
  messagingWriteLimiter,

  // AI module
  createAiMessageLimiter,

  // Library module
  libraryWriteLimiter,

  // Data export (expensive query -- 3 per day per user)
  exportDataLimiter,
}

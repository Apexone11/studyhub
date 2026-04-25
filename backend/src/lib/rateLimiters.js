/**
 * rateLimiters.js — Centralized rate limiter presets for all route modules.
 *
 * All rate limiters use express-rate-limit with standardHeaders (RateLimit-*)
 * and key on IP address by default. Custom keyGenerators can override (e.g., userId).
 *
 * Organized by feature/module for easy discovery and updates.
 */
const rateLimit = require('express-rate-limit')
const {
  WINDOW_1_MIN,
  WINDOW_5_MIN,
  WINDOW_15_MIN,
  WINDOW_1_HOUR,
  WINDOW_1_DAY,
} = require('./constants')

// ── CATEGORY: Generic Base Limiters ────────────────────────────────────────

/**
 * Global app limiter — applied to every request from backend/src/index.js.
 * 1000 requests per 15 minutes per IP.
 * Skips: '/', '/health', '/uploads/avatars/*'.
 *
 * Extracted here because CLAUDE.md requires rate limiters to live in this
 * file and not inline in route files.
 */
const globalLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === '/' || req.path === '/health' || req.path.startsWith('/uploads/avatars/'),
})

/**
 * Generic auth endpoints — strict limits.
 * 15 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_15_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
})

/**
 * Registration endpoint — 8 requests per 60 minutes per IP.
 */
const authRegisterLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
})

/**
 * Email verification endpoint — 25 requests per 15 minutes per IP.
 */
const authVerificationLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
})

/**
 * Password reset request — 5 requests per 15 minutes per IP.
 */
const authForgotLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
})

/**
 * Logout endpoint — 100 requests per 15 minutes per IP.
 */
const authLogoutLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Google OAuth sign-in — 20 requests per 15 minutes per IP.
 */
const authGoogleLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Google sign-in attempts. Please try again later.' },
})

/**
 * Google OAuth complete endpoint — 10 requests per hour per IP.
 * Used after a pending Google signup picks a role. See
 * docs/internal/roles-and-permissions-plan.md §4.2.
 */
const googleCompleteLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup completion attempts. Please try again later.' },
})

/**
 * Role-change IP bucket — 10 writes per hour per IP. Sits on top of the
 * per-user 3-changes-per-30-days DB rule enforced in users.controller.js.
 * See docs/internal/roles-and-permissions-plan.md §8.8.
 */
const roleChangeLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many role-change attempts. Please try again later.' },
})

/**
 * Panic ("kill the house lights") endpoint — 3 requests per hour per user.
 * Keyed by userId so a shared-IP household is not locked out when one member
 * triggers the flow. Panics revoke every session + trusted device and fire a
 * password-reset email, so abuse or misfires must be rate-bounded.
 * See backend/src/modules/auth/panic.controller.js for the handler.
 */
const panicLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `panic-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many panic requests. Please wait an hour.' },
})

// ── CATEGORY: Feed Module ──────────────────────────────────────────────────

/**
 * Feed reactions (like, star) — 30 requests per minute per IP.
 */
const feedReactLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Feed read operations — 600 requests per minute per IP.
 */
const feedReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feed requests. Please slow down.' },
})

/**
 * Feed write operations — 120 requests per 15 minutes per IP.
 */
const feedWriteLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feed updates. Please slow down.' },
})

/**
 * Feed comments — 10 requests per 5 minutes per IP.
 */
const feedCommentLimiter = rateLimit({
  windowMs: WINDOW_5_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

/**
 * Feed attachment downloads — 120 requests per 15 minutes per IP.
 */
const feedAttachmentDownloadLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment downloads. Please slow down.' },
})

/**
 * Authenticated feed operations — 240 requests per minute per IP.
 */
const feedAuthLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authenticated feed requests. Please slow down.' },
})

/**
 * Leaderboard requests — 120 requests per minute per IP.
 */
const feedLeaderboardLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
})

/**
 * Feed discovery page — 120 requests per 15 minutes per IP.
 */
const feedDiscoveryLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Mobile feed endpoint — 60 requests per minute per user.
 */
const feedMobileLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `feed-mobile-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many mobile feed requests. Please slow down.' },
})

// ── CATEGORY: Sheets Module ────────────────────────────────────────────────

/**
 * Sheet reactions (like, star) — 30 requests per minute per IP.
 */
const sheetReactLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sheet write operations — 120 requests per 15 minutes per IP.
 */
const sheetWriteLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sheet updates. Please slow down.' },
})

/**
 * Sheet comments — 10 requests per 5 minutes per IP.
 */
const sheetCommentLimiter = rateLimit({
  windowMs: WINDOW_5_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

/**
 * Contribution submissions — 60 requests per 15 minutes per IP.
 */
const sheetContributionLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contribution requests. Please slow down.' },
})

/**
 * Contribution reviews — 60 requests per 15 minutes per IP.
 */
const sheetContributionReviewLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contribution reviews. Please slow down.' },
})

/**
 * Sheet attachment downloads — 120 requests per 15 minutes per IP.
 */
const sheetAttachmentDownloadLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment downloads. Please slow down.' },
})

/**
 * Sheet leaderboard — 120 requests per minute per IP.
 */
const sheetLeaderboardLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
})

/**
 * Sheet diff requests — 60 requests per minute per IP.
 */
const sheetDiffLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many diff requests. Please slow down.' },
})

/**
 * Sheet analytics — 120 requests per 15 minutes per IP.
 */
const sheetAnalyticsLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_15_MIN,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many appeal submissions. Please try again later.' },
})

/**
 * Content reports — 10 requests per 60 minutes per IP.
 */
const moderationReportLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
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
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sharing read operations — 120 requests per minute per IP.
 */
const sharingReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Note read operations — 120 requests per minute per IP.
 */
const notesReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Note comments — 20 requests per minute per IP.
 */
const notesCommentLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments. Please slow down.' },
})

// Notes hardening v2 — dedicated limiters for PATCH, chunk append, version restore, and diff.

/**
 * Note PATCH updates — 120 requests per minute per IP.
 * Higher than generic notesMutateLimiter to accommodate autosave cadence.
 */
const notesPatchLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `notes-patch-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many note updates. Please slow down.' },
})

/**
 * Note chunked autosave appends — 30 requests per minute per IP.
 */
const notesChunkLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `notes-chunk-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many chunk appends. Please slow down.' },
})

/**
 * Note version restore — 10 requests per minute per IP.
 * Stricter than general mutations because restore rewrites note content.
 */
const notesRestoreLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `notes-restore-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many restore requests. Please slow down.' },
})

/**
 * Note version diff — 60 requests per minute per IP.
 */
const notesDiffLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `notes-diff-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many diff requests. Please slow down.' },
})

/**
 * Comment reactions (likes/dislikes) — 60 requests per minute per IP.
 */
const commentReactLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reactions. Please slow down.' },
})

// ── CATEGORY: Search Module ───────────────────────────────────────────────

/**
 * Global search — 120 requests per minute per IP.
 */
const searchLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down.' },
})

// ── CATEGORY: Upload Module ───────────────────────────────────────────────

/**
 * Group media uploads — 10 requests per minute per IP.
 * Per-user weekly quota is enforced separately by the media service.
 */
const groupMediaUploadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please wait a moment.' },
})

/**
 * Group reports — cheap enough to allow ~20/hour per IP but aggressive
 * enough to stop drive-by brigading. The per-user "one report per
 * group" rule lives in the DB unique index, not here.
 */
const groupReportLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports. Please wait before filing another.' },
})

/**
 * Group appeals — one per group, but we still IP-limit to stop
 * scripted appeal spam.
 */
const groupAppealLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many appeals. Please wait.' },
})

/**
 * Group join requests — stop drive-by brigading by capping to 30/hour
 * per IP. A single user who joins their own 30 public groups in an
 * hour would hit this, which is acceptable.
 */
const groupJoinLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join requests. Please slow down.' },
})

/**
 * Avatar uploads — 20 requests per 15 minutes per IP.
 */
const uploadAvatarLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many avatar uploads. Please wait a bit.' },
})

/**
 * Attachment uploads — 40 requests per 15 minutes per IP.
 */
const uploadAttachmentLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachment uploads. Please wait a bit.' },
})

/**
 * Sheet cover image uploads — 10 requests per 15 minutes per IP.
 */
const uploadCoverLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many cover uploads. Please wait a bit.' },
})

/**
 * Content inline image uploads — 60 requests per 15 minutes per IP.
 */
const uploadContentImageLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_15_MIN,
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
  windowMs: WINDOW_1_MIN,
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
const createAiMessageLimiter = (rpmLimit) =>
  rateLimit({
    windowMs: WINDOW_1_MIN,
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
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Sheet readme extras — 120 requests per minute per IP.
 */
const sheetReadmeLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

// ── CATEGORY: Library Module ──────────────────────────────────────────────

/**
 * Library write operations (shelves, bookmarks, progress) — 60 requests per minute per IP.
 */
const libraryWriteLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many library requests. Please slow down.' },
})

const exportDataLimiter = rateLimit({
  windowMs: WINDOW_1_DAY,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Data export limit reached. You can export your data up to 3 times per day.' },
  keyGenerator: (req) => `export-${req.user?.userId || 'anon'}`,
})

// ── Video module ───────────────────────────────────────────────────────────

const videoUploadInitLimiter = rateLimit({
  windowMs: WINDOW_15_MIN, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video uploads. Please wait before starting another.' },
  keyGenerator: (req) => `vid-init-${req.user?.userId || 'anon'}`,
})

const videoUploadChunkLimiter = rateLimit({
  windowMs: WINDOW_1_MIN, // 1 minute
  max: 200, // 200 chunks per minute (supports fast uploads)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload speed limit reached. Please slow down.' },
  keyGenerator: (req) => `vid-chunk-${req.user?.userId || 'anon'}`,
})

// ── Payments module ───────────────────────────────────────────────────────

const paymentCheckoutLimiter = rateLimit({
  windowMs: WINDOW_15_MIN, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts. Please wait before trying again.' },
  keyGenerator: (req) => `pay-checkout-${req.user?.userId || 'anon'}`,
})

const paymentPortalLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many portal requests. Please wait before trying again.' },
  keyGenerator: (req) => `pay-portal-${req.user?.userId || 'anon'}`,
})

const paymentReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please slow down.' },
})

const paymentWebhookLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests. Please slow down.' },
})

// ── CATEGORY: Reviews Module ─────────────────────────────────────────────

/**
 * Review submissions — 1 request per 24 hours per user.
 */
const reviewSubmitLimiter = rateLimit({
  windowMs: WINDOW_1_DAY,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You can only submit one review per day. Please try again tomorrow.' },
  keyGenerator: (req) => `review-submit-${req.user?.userId || 'anon'}`,
})

/**
 * Review read operations — 60 requests per minute per IP.
 */
const reviewReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many review requests. Please slow down.' },
})

/**
 * Review report generation — 5 requests per hour per user (AI call, expensive).
 */
const reviewReportGenerateLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Report generation limit reached. Please try again later.' },
})

// ── CATEGORY: Study Status Module ───────────────────────────────────────────

const studyStatusReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many study status requests. Please slow down.' },
})

const studyStatusWriteLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many study status updates. Please slow down.' },
  keyGenerator: (req) => `study-status-write-${req.user?.userId || 'anon'}`,
})

// ── CATEGORY: Onboarding Module ─────────────────────────────────────────

const onboardingWriteLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many onboarding requests. Please slow down.' },
  keyGenerator: (req) => `onboarding-${req.user?.userId || 'anon'}`,
})

// ── CATEGORY: Referral Module ────────────────────────────────────────────

/**
 * Referral invite sending -- 20 invites per day per user.
 */
const referralInviteLimiter = rateLimit({
  windowMs: WINDOW_1_DAY,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily invite limit reached. Try again tomorrow.' },
  keyGenerator: (req) => `referral-invite-${req.user?.userId || 'anon'}`,
})

/**
 * Referral code resolution -- 60 lookups per minute per IP.
 */
const referralResolveLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code lookups. Please slow down.' },
})

// ── CATEGORY: Session Management ────────────────────────────────────────────

/**
 * Session list — 30 requests per minute per user.
 */
const sessionListLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `session-list-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many session requests. Please slow down.' },
})

/**
 * Session revoke — 10 requests per minute per user.
 */
const sessionRevokeLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `session-revoke-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many session revocation requests. Please slow down.' },
})

/**
 * Login activity read — 30 requests per 5 minutes per user.
 * Powers the Security-tab "Login activity" list.
 */
const loginActivityLimiter = rateLimit({
  windowMs: WINDOW_5_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `login-activity-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many login activity requests. Please slow down.' },
})

/**
 * Exam writes — 10 per minute per user.
 * Phase 2 of v2 design refresh (design_v2_upcoming_exams).
 */
const examWriteLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `exam-write-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many exam changes. Please slow down.' },
})

/**
 * Exam reads — 60 per minute per user.
 */
const examReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `exam-read-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * AI suggestion reads — 60 per minute per user. Phase 3 of v2 design
 * refresh (design_v2_ai_card). Independent from the AI message limiter
 * because the suggestion endpoint is polled by the card on mount and
 * shouldn't burn message budget.
 */
const aiSuggestionsReadLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ai-suggestions-read-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * AI suggestion refresh — 5 per hour per user. Refresh is the
 * UI-spam vector for quota burn (one click = one Anthropic call).
 * The hourly cap is independent of the daily AI budget so even a
 * Pro user can't spam-refresh the card.
 */
const aiSuggestionsRefreshLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ai-suggestions-refresh-${req.user?.userId || 'anon'}`,
  message: { error: 'You are refreshing too quickly. Try again later.' },
})

/**
 * AI suggestion dismiss — 20 per hour per user. Dismiss is cheap
 * (no AI call) but still write-sided; this stops a runaway client
 * from hammering the dismiss endpoint.
 */
const aiSuggestionsDismissLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ai-suggestions-dismiss-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many dismissals. Please slow down.' },
})

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Base limiters
  globalLimiter,
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
  googleCompleteLimiter,
  roleChangeLimiter,
  panicLimiter,

  // Feed module
  feedReactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  feedCommentLimiter,
  feedAttachmentDownloadLimiter,
  feedAuthLimiter,
  feedLeaderboardLimiter,
  feedDiscoveryLimiter,
  feedMobileLimiter,

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
  notesPatchLimiter,
  notesChunkLimiter,
  notesRestoreLimiter,
  notesDiffLimiter,

  // Comment reactions (all comment types)
  commentReactLimiter,

  // Search module
  searchLimiter,

  // Upload module
  groupMediaUploadLimiter,
  uploadAvatarLimiter,
  uploadAttachmentLimiter,
  uploadCoverLimiter,
  uploadContentImageLimiter,

  // Study groups module
  groupReportLimiter,
  groupAppealLimiter,
  groupJoinLimiter,

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

  // Export module
  exportDataLimiter,

  // Video module
  videoUploadInitLimiter,
  videoUploadChunkLimiter,

  // Payments module
  paymentCheckoutLimiter,
  paymentPortalLimiter,
  paymentReadLimiter,
  paymentWebhookLimiter,

  // Reviews module
  reviewSubmitLimiter,
  reviewReadLimiter,
  reviewReportGenerateLimiter,

  // Study Status module
  studyStatusReadLimiter,
  studyStatusWriteLimiter,

  // Onboarding module
  onboardingWriteLimiter,

  // Referral module
  referralInviteLimiter,
  referralResolveLimiter,

  // Session management
  sessionListLimiter,
  sessionRevokeLimiter,
  loginActivityLimiter,

  // Exams module (Phase 2 of v2 design refresh)
  examWriteLimiter,
  examReadLimiter,
  aiSuggestionsReadLimiter,
  aiSuggestionsRefreshLimiter,
  aiSuggestionsDismissLimiter,
}

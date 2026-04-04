const express = require('express')
const requireAuth = require('../../middleware/auth')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { readLimiter, usersFollowLimiter } = require('../../lib/rateLimiters')
const usersController = require('./users.controller')

const router = express.Router()

// Apply read limiter to all GET requests on user routes
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next)
  next()
})

const followLimiter = usersFollowLimiter

// Optional auth middleware
function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated
  }
  next()
}

// ── GET /api/users/:username/activity ─────────────────────────
router.get('/me/activity', requireAuth, usersController.getMyActivity)

// ── GET /api/users/:username/activity (public) ───────────────
router.get('/:username/activity', optionalAuth, usersController.getActivityByUsername)

// ── GET /api/users/me/badges ─────────────────────────────────
router.get('/me/badges', requireAuth, usersController.getMyBadges)

// ── GET /api/users/:username/badges (public) ─────────────────
router.get('/:username/badges', optionalAuth, usersController.getBadgesByUsername)

// ── GET /api/users/me/pinned-sheets ──────────────────────────
router.get('/me/pinned-sheets', requireAuth, usersController.getMyPinnedSheets)

// ── POST /api/users/me/pinned-sheets ─────────────────────────
router.post('/me/pinned-sheets', requireAuth, usersController.addPinnedSheet)

// ── DELETE /api/users/me/pinned-sheets/:sheetId ──────────────
router.delete('/me/pinned-sheets/:sheetId', requireAuth, usersController.deletePinnedSheet)

// ── PATCH /api/users/me/pinned-sheets/reorder ────────────────
router.patch('/me/pinned-sheets/reorder', requireAuth, usersController.reorderPinnedSheets)

// ── GET /api/users/:username ───────────────────────────────────
router.get('/:username', optionalAuth, usersController.getUserByUsername)

// ── POST /api/users/:username/follow ──────────────────────────
router.post('/:username/follow', requireAuth, followLimiter, usersController.followUser)

// ── DELETE /api/users/:username/follow ────────────────────────
router.delete('/:username/follow', requireAuth, followLimiter, usersController.unfollowUser)

// ── GET /api/users/:username/followers ─────────────────────
router.get('/:username/followers', optionalAuth, usersController.getFollowers)

// ── GET /api/users/:username/following ─────────────────────
router.get('/:username/following', optionalAuth, usersController.getFollowing)

// ── GET /api/users/me/streak ────────────────────────────────────
router.get('/me/streak', requireAuth, usersController.getMyStreak)

// ── GET /api/users/me/weekly-activity ───────────────────────────
router.get('/me/weekly-activity', requireAuth, usersController.getMyWeeklyActivity)

// ── GET /api/users/me ─────────────────────────────────────────────
// Returns the authenticated user's profile data. Used by gamification
// widgets and any component that needs the current user's info.
router.get('/me', requireAuth, usersController.getMe)

// ── GET /api/users/me/follow-suggestions ──────────────────────────
// Returns up to 8 users the authenticated user may want to follow,
// prioritizing users at the same school and users with popular content.
router.get('/me/follow-suggestions', requireAuth, usersController.getFollowSuggestions)

// ── GET /api/users/me/blocked ─────────────────────────────────────
// Returns the list of user IDs the authenticated user has blocked.
router.get('/me/blocked', requireAuth, usersController.getBlockedUsers)

// ── GET /api/users/me/muted ──────────────────────────────────────
// Returns the list of user IDs the authenticated user has muted.
router.get('/me/muted', requireAuth, usersController.getMutedUsers)

// ── POST /api/users/:username/block ──────────────────────────────
router.post('/:username/block', requireAuth, followLimiter, usersController.blockUser)

// ── DELETE /api/users/:username/block ────────────────────────────
router.delete('/:username/block', requireAuth, followLimiter, usersController.unblockUser)

// ── POST /api/users/:username/mute ───────────────────────────────
router.post('/:username/mute', requireAuth, followLimiter, usersController.muteUser)

// ── DELETE /api/users/:username/mute ─────────────────────────────
router.delete('/:username/mute', requireAuth, followLimiter, usersController.unmuteUser)

module.exports = router

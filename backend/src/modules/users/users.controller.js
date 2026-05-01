const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { emitToUser } = require('../../lib/socketio')
const SOCKET_EVENTS = require('../../lib/socketEvents')
const { getProfileAccessDecision, PROFILE_VISIBILITY } = require('../../lib/profileVisibility')
const { getUserPII } = require('../../lib/piiVault')
const { buildProfilePresentation, getProfileFieldVisibility } = require('../../lib/profileMetadata')
const prisma = require('../../lib/prisma')
const { checkAndAwardBadgesLegacy: checkAndAwardBadges } = require('../achievements')
const { getUserStreak, getWeeklyActivity } = require('../../lib/streaks')
const { enrichUserWithBadges } = require('../../lib/userBadges')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const {
  CURRENT_LEGAL_VERSION,
  acceptCurrentLegalDocuments,
  getUserLegalStatus,
} = require('../legal/legal.service')

function getEnrollmentSchoolIds(enrollments = []) {
  return Array.from(
    new Set(
      (enrollments || [])
        .map((enrollment) => enrollment?.course?.school?.id)
        .filter((id) => Number.isInteger(id)),
    ),
  ).sort((left, right) => left - right)
}

function getEnrollmentSchools(enrollments = []) {
  const schoolsById = new Map()
  for (const enrollment of enrollments || []) {
    const school = enrollment?.course?.school
    if (school && Number.isInteger(school.id) && !schoolsById.has(school.id)) {
      schoolsById.set(school.id, school)
    }
  }
  return Array.from(schoolsById.values()).sort((left, right) => left.id - right.id)
}

function sharesAnySchool(leftSchoolIds = [], rightSchoolIds = []) {
  if (!leftSchoolIds.length || !rightSchoolIds.length) return false
  const rightSet = new Set(rightSchoolIds)
  return leftSchoolIds.some((id) => rightSet.has(id))
}

async function loadProfilePii(userId, req) {
  return getUserPII(userId, {
    id: req.user?.userId || null,
    role: req.user?.role || null,
    route: req.originalUrl,
    method: req.method,
  }).catch(() => null)
}

// ── GET /api/users/me/activity ─────────────────────────
const getMyActivity = async (req, res) => {
  try {
    const weeksParam = Math.min(Number(req.query.weeks) || 12, 52)
    const since = new Date()
    since.setDate(since.getDate() - weeksParam * 7)

    const rows = await prisma.userDailyActivity.findMany({
      where: { userId: req.user.userId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, commits: true, sheets: true, reviews: true, comments: true },
    })

    res.json(rows)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/:username/activity (public) ───────────────
const getActivityByUsername = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const weeksParam = Math.min(Number(req.query.weeks) || 12, 52)
    const since = new Date()
    since.setDate(since.getDate() - weeksParam * 7)

    const rows = await prisma.userDailyActivity.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, commits: true, sheets: true, reviews: true, comments: true },
    })

    res.json(rows)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/badges ─────────────────────────────────
const getMyBadges = async (req, res) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { userId: req.user.userId },
      orderBy: { unlockedAt: 'desc' },
      select: {
        unlockedAt: true,
        badge: {
          select: {
            slug: true,
            name: true,
            description: true,
            category: true,
            tier: true,
            iconUrl: true,
          },
        },
      },
    })
    res.json(badges.map((ub) => ({ ...ub.badge, unlockedAt: ub.unlockedAt })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/:username/badges (public) ─────────────────
const getBadgesByUsername = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: 'desc' },
      select: {
        unlockedAt: true,
        badge: {
          select: {
            slug: true,
            name: true,
            description: true,
            category: true,
            tier: true,
            iconUrl: true,
          },
        },
      },
    })
    res.json(badges.map((ub) => ({ ...ub.badge, unlockedAt: ub.unlockedAt })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/pinned-sheets ──────────────────────────
const getMyPinnedSheets = async (req, res) => {
  try {
    const pins = await prisma.userPinnedSheet.findMany({
      where: { userId: req.user.userId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        pinnedAt: true,
        sheet: {
          select: {
            id: true,
            title: true,
            stars: true,
            status: true,
            updatedAt: true,
            course: { select: { id: true, code: true, school: { select: { short: true } } } },
          },
        },
      },
    })
    res.json(pins)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/me/pinned-sheets ─────────────────────────
const addPinnedSheet = async (req, res) => {
  const { sheetId } = req.body || {}
  if (!sheetId || !Number.isInteger(Number(sheetId))) {
    return sendError(res, 400, 'sheetId is required.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: Number(sheetId) },
      select: { id: true, userId: true, status: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    if (sheet.userId !== req.user.userId) {
      return sendError(res, 403, 'You can only pin your own sheets.', ERROR_CODES.FORBIDDEN)
    }

    const existing = await prisma.userPinnedSheet.count({ where: { userId: req.user.userId } })
    if (existing >= 6) {
      return sendError(res, 400, 'You can pin up to 6 sheets.', ERROR_CODES.BAD_REQUEST)
    }

    const pin = await prisma.userPinnedSheet.upsert({
      where: { userId_sheetId: { userId: req.user.userId, sheetId: sheet.id } },
      update: {},
      create: { userId: req.user.userId, sheetId: sheet.id, position: existing },
    })

    res.status(201).json(pin)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── DELETE /api/users/me/pinned-sheets/:sheetId ──────────────
const deletePinnedSheet = async (req, res) => {
  const sheetId = Number(req.params.sheetId)
  try {
    await prisma.userPinnedSheet.deleteMany({
      where: { userId: req.user.userId, sheetId },
    })
    res.json({ removed: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── PATCH /api/users/me/pinned-sheets/reorder ────────────────
const reorderPinnedSheets = async (req, res) => {
  const { order } = req.body || {}
  if (!Array.isArray(order)) {
    return sendError(res, 400, 'order must be an array of sheetIds.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    await prisma.$transaction(
      order.map((sheetId, index) =>
        prisma.userPinnedSheet.updateMany({
          where: { userId: req.user.userId, sheetId: Number(sheetId) },
          data: { position: index },
        }),
      ),
    )
    res.json({ reordered: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/:username ───────────────────────────────────
const getUserByUsername = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        role: true,
        accountType: true,
        avatarUrl: true,
        coverImageUrl: true,
        profileLinks: true,
        isPrivate: true,
        createdAt: true,
        preferences: {
          select: {
            profileFieldVisibility: true,
          },
        },
        enrollments: {
          include: { course: { include: { school: true } } },
        },
        studySheets: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            course: { include: { school: true } },
          },
        },
      },
    })

    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const accessDecision = await getProfileAccessDecision(prisma, req.user, user.id)

    if (!accessDecision.allowed) {
      const errorMessage =
        accessDecision.visibility === PROFILE_VISIBILITY.PRIVATE
          ? 'This profile is private.'
          : 'This profile is only visible to classmates.'

      return sendError(res, 403, errorMessage, ERROR_CODES.FORBIDDEN)
    }

    // Compute follower/following counts with status: 'active' filter
    const [followerCount, followingCount, sheetCount] = await Promise.all([
      prisma.userFollow.count({ where: { followingId: user.id, status: 'active' } }),
      prisma.userFollow.count({ where: { followerId: user.id, status: 'active' } }),
      prisma.studySheet.count({ where: { userId: user.id, status: 'published' } }),
    ])

    // Check follow relationship and status
    let isFollowing = false
    let followStatus = null // null, 'active', or 'pending'
    const isOwner = req.user?.userId && req.user.userId === user.id
    if (req.user?.userId && !isOwner) {
      const follow = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: req.user.userId, followingId: user.id } },
      })
      if (follow) {
        followStatus = follow.status
        isFollowing = follow.status === 'active'
      }
    }

    const fieldVisibility = getProfileFieldVisibility(user.preferences?.profileFieldVisibility)

    // Private account gate: if private and viewer is not owner and not active follower
    if (user.isPrivate && !isOwner && !isFollowing) {
      // Enrich with Pro/Donor badge info
      const badges = await enrichUserWithBadges(user)
      const privatePreview = buildProfilePresentation({
        user,
        pii: null,
        profileFieldVisibility: fieldVisibility,
        isOwner,
        privatePreview: true,
      })

      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        accountType: user.accountType,
        avatarUrl: user.avatarUrl || null,
        coverImageUrl: user.coverImageUrl || null,
        isPrivate: true,
        isPrivateProfile: true,
        createdAt: user.createdAt,
        plan: badges.plan || 'free',
        isDonor: badges.isDonor || false,
        donorLevel: badges.donorLevel || null,
        followerCount,
        followingCount,
        sheetCount,
        isFollowing: false,
        followStatus,
        ...privatePreview,
      })
    }

    const shouldLoadPii =
      isOwner || fieldVisibility.age === 'public' || fieldVisibility.location === 'public'
    const pii = shouldLoadPii ? await loadProfilePii(user.id, req) : null
    const visibleProfile = buildProfilePresentation({
      user,
      pii,
      profileFieldVisibility: fieldVisibility,
      isOwner,
      privatePreview: false,
    })

    /* Fetch shared (non-private) notes for profile display */
    let sharedNotes = []
    try {
      sharedNotes = await prisma.note.findMany({
        where: { userId: user.id, private: false, moderationStatus: 'clean' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          course: { select: { id: true, code: true } },
        },
      })
    } catch {
      // Degrade gracefully if notes query fails
    }

    /* Fetch bookshelves explicitly shared on the profile */
    let sharedShelves = []
    try {
      sharedShelves = await prisma.bookShelf.findMany({
        where: { userId: user.id, visibility: 'profile' },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          description: true,
          visibility: true,
          updatedAt: true,
          _count: { select: { books: true } },
          books: {
            orderBy: { addedAt: 'desc' },
            take: 8,
            select: {
              id: true,
              volumeId: true,
              title: true,
              author: true,
              coverUrl: true,
            },
          },
        },
      })
    } catch {
      // Degrade gracefully if bookshelves query fails
    }

    /* Fetch pinned sheets for profile display */
    let pinnedSheets = []
    try {
      const pins = await prisma.userPinnedSheet.findMany({
        where: { userId: user.id },
        orderBy: { position: 'asc' },
        take: 6,
        select: {
          sheet: {
            select: {
              id: true,
              title: true,
              stars: true,
              updatedAt: true,
              status: true,
              course: { select: { id: true, code: true } },
            },
          },
        },
      })
      pinnedSheets = pins.map((p) => p.sheet).filter((s) => s && s.status === 'published')
    } catch {
      // Degrade gracefully
    }

    /* Fetch starred sheets for profile display */
    let starredSheets = []
    try {
      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: user.id },
        orderBy: { sheetId: 'desc' },
        take: 10,
        select: {
          sheet: {
            select: {
              id: true,
              title: true,
              stars: true,
              updatedAt: true,
              status: true,
              author: { select: { id: true, username: true } },
              course: { select: { id: true, code: true } },
            },
          },
        },
      })
      starredSheets = starredRows.map((r) => r.sheet).filter((s) => s && s.status === 'published')
    } catch {
      // Degrade gracefully if starred query fails
    }

    // Enrich with Pro/Donor badge info
    const badges = await enrichUserWithBadges(user)

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      accountType: user.accountType,
      avatarUrl: user.avatarUrl || null,
      coverImageUrl: user.coverImageUrl || null,
      isPrivate: user.isPrivate || false,
      createdAt: user.createdAt,
      plan: badges.plan || 'free',
      isDonor: badges.isDonor || false,
      donorLevel: badges.donorLevel || null,
      sheetCount,
      followerCount,
      followingCount,
      isFollowing,
      followStatus,
      ...visibleProfile,
      recentSheets: user.studySheets,
      enrollments: user.enrollments,
      pinnedSheets,
      sharedNotes,
      sharedShelves,
      starredSheets,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/:username/follow ──────────────────────────
const followUser = async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, username: true, isPrivate: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    if (target.id === req.user.userId)
      return sendError(res, 400, 'You cannot follow yourself.', ERROR_CODES.BAD_REQUEST)

    // Check if there's already a pending or active follow
    const existing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: req.user.userId, followingId: target.id } },
    })
    if (existing) {
      if (existing.status === 'pending') {
        return sendError(res, 409, 'Follow request already pending.', ERROR_CODES.CONFLICT)
      }
      return sendError(res, 409, 'Already following this user.', ERROR_CODES.CONFLICT)
    }

    const isPending = target.isPrivate === true
    const status = isPending ? 'pending' : 'active'

    await prisma.userFollow.create({
      data: { followerId: req.user.userId, followingId: target.id, status },
    })

    if (isPending) {
      await createNotification(prisma, {
        userId: target.id,
        type: 'follow_request',
        message: `${req.user.username} requested to follow you.`,
        actorId: req.user.userId,
        linkPath: `/users/${req.user.username}`,
      })

      return res.json({ following: false, requested: true })
    }

    await createNotification(prisma, {
      userId: target.id,
      type: 'follow',
      message: `${req.user.username} started following you.`,
      actorId: req.user.userId,
      linkPath: `/users/${req.user.username}`,
    })

    const followerCount = await prisma.userFollow.count({
      where: { followingId: target.id, status: 'active' },
    })
    checkAndAwardBadges(prisma, target.id)
    res.json({ following: true, followerCount })
  } catch (err) {
    if (err.code === 'P2002')
      return sendError(res, 409, 'Already following this user.', ERROR_CODES.CONFLICT)
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── DELETE /api/users/:username/follow ────────────────────────
// Also cancels pending follow requests
const unfollowUser = async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    await prisma.userFollow.delete({
      where: { followerId_followingId: { followerId: req.user.userId, followingId: target.id } },
    })

    const followerCount = await prisma.userFollow.count({
      where: { followingId: target.id, status: 'active' },
    })
    res.json({ following: false, followerCount })
  } catch (err) {
    if (err.code === 'P2025')
      return sendError(res, 404, 'Not following this user.', ERROR_CODES.NOT_FOUND)
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/:username/followers ─────────────────────
const getFollowers = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const follows = await prisma.userFollow.findMany({
      where: { followingId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        follower: {
          select: { id: true, username: true, role: true, avatarUrl: true },
        },
      },
    })

    res.json(follows.map((f) => f.follower))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/:username/following ─────────────────────
const getFollowing = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const follows = await prisma.userFollow.findMany({
      where: { followerId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        following: {
          select: { id: true, username: true, role: true, avatarUrl: true },
        },
      },
    })

    res.json(follows.map((f) => f.following))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/streak ────────────────────────────────────
const getMyStreak = async (req, res) => {
  try {
    const streakData = await getUserStreak(prisma, req.user.userId)
    res.json(streakData)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/weekly-activity ───────────────────────────
const getMyWeeklyActivity = async (req, res) => {
  try {
    const weeklyData = await getWeeklyActivity(prisma, req.user.userId)
    res.json(weeklyData)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me ─────────────────────────────────────────────
// Returns the authenticated user's profile data. Used by gamification
// widgets and any component that needs the current user's info.
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        accountType: true,
        avatarUrl: true,
        role: true,
        emailVerified: true,
        isStaffVerified: true,
        bio: true,
        profileLinks: true,
        isPrivate: true,
        createdAt: true,
        preferences: {
          select: {
            profileFieldVisibility: true,
          },
        },
        enrollments: {
          include: { course: { include: { school: true } } },
        },
        _count: {
          select: {
            studySheets: true,
            followers: true,
            following: true,
            notes: true,
          },
        },
      },
    })

    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const pii = await loadProfilePii(user.id, req)
    const profilePresentation = buildProfilePresentation({
      user,
      pii,
      profileFieldVisibility: user.preferences?.profileFieldVisibility,
      isOwner: true,
    })
    const schools = getEnrollmentSchools(user.enrollments)
    const school = schools[0] || null

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      accountType: user.accountType,
      verified: Boolean(user.emailVerified || user.isStaffVerified),
      isPrivate: user.isPrivate,
      createdAt: user.createdAt,
      schoolId: school?.id || null,
      school,
      schoolIds: schools.map((enrollmentSchool) => enrollmentSchool.id),
      schools,
      enrollments: user.enrollments || [],
      _count: user._count,
      ...profilePresentation,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/follow-suggestions ──────────────────────────
// Returns up to 8 users the authenticated user may want to follow,
// prioritizing users at the same school and users with popular content.
const getFollowSuggestions = async (req, res) => {
  try {
    // Get IDs the user already follows (active or pending)
    const following = await prisma.userFollow.findMany({
      where: { followerId: req.user.userId },
      select: { followingId: true },
    })
    const followingIds = following.map((f) => f.followingId)

    // Get blocked user IDs (graceful degradation)
    let blockedIds = []
    try {
      const { getBlockedUserIds } = require('../../lib/social/blockFilter')
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      blockedIds = []
    }

    const excludeIds = [...followingIds, ...blockedIds, req.user.userId]

    // Get current user for school-based suggestions
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        enrollments: {
          select: {
            course: {
              select: {
                school: { select: { id: true } },
              },
            },
          },
        },
      },
    })
    const currentSchoolIds = getEnrollmentSchoolIds(currentUser?.enrollments)

    // Prefer users from the same school, then by sheet count
    const suggestions = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        OR: [{ emailVerified: true }, { isStaffVerified: true }],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        enrollments: {
          select: {
            course: {
              select: {
                school: { select: { id: true } },
              },
            },
          },
        },
        _count: { select: { studySheets: true, followers: true } },
      },
      orderBy: [{ followers: { _count: 'desc' } }],
      take: 20,
    })

    // Sort: same school first, then by follower count
    const sorted = suggestions.sort((a, b) => {
      const aSchool = sharesAnySchool(currentSchoolIds, getEnrollmentSchoolIds(a.enrollments))
        ? 1
        : 0
      const bSchool = sharesAnySchool(currentSchoolIds, getEnrollmentSchoolIds(b.enrollments))
        ? 1
        : 0
      if (bSchool !== aSchool) return bSchool - aSchool
      return (b._count?.followers || 0) - (a._count?.followers || 0)
    })

    res.json(
      sorted.slice(0, 8).map(({ enrollments, ...suggestion }) => {
        const schoolIds = getEnrollmentSchoolIds(enrollments)
        return {
          ...suggestion,
          // Keep schoolId for older clients, but expose the full parallel-school
          // set so new surfaces do not rebuild a primary-school assumption.
          schoolId: schoolIds[0] || null,
          schoolIds,
        }
      }),
    )
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/blocked ─────────────────────────────────────
// Returns the list of user IDs the authenticated user has blocked.
const getBlockedUsers = async (req, res) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.user.userId },
      select: {
        blocked: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt })))
  } catch (err) {
    // Graceful degradation if UserBlock table doesn't exist yet
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json([])
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/muted ──────────────────────────────────────
// Returns the list of user IDs the authenticated user has muted.
const getMutedUsers = async (req, res) => {
  try {
    const mutes = await prisma.userMute.findMany({
      where: { muterId: req.user.userId },
      select: {
        muted: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(mutes.map((m) => ({ ...m.muted, mutedAt: m.createdAt })))
  } catch (err) {
    // Graceful degradation if UserMute table doesn't exist yet
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json([])
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/:username/block ──────────────────────────────
// Block a user. Bidirectional: neither sees the other.
const blockUser = async (req, res) => {
  try {
    const target = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    if (target.id === req.user.userId)
      return sendError(res, 400, 'Cannot block yourself.', ERROR_CODES.BAD_REQUEST)

    await prisma.userBlock.create({
      data: { blockerId: req.user.userId, blockedId: target.id },
    })

    // Also remove any existing follow relationship in both directions
    await prisma.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: req.user.userId, followingId: target.id },
          { followerId: target.id, followingId: req.user.userId },
        ],
      },
    })

    res.json({ blocked: true })
  } catch (err) {
    // Unique constraint = already blocked
    if (err.code === 'P2002') return res.json({ blocked: true })
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return sendError(res, 500, 'Block feature is not available yet.', ERROR_CODES.INTERNAL)
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── DELETE /api/users/:username/block ────────────────────────────
// Unblock a user.
const unblockUser = async (req, res) => {
  try {
    const target = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    await prisma.userBlock.deleteMany({
      where: { blockerId: req.user.userId, blockedId: target.id },
    })

    res.json({ blocked: false })
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json({ blocked: false })
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/:username/mute ──────────────────────────────
// Mute a user. One-directional: only the muter's feed is affected.
const muteUser = async (req, res) => {
  try {
    const target = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    if (target.id === req.user.userId)
      return sendError(res, 400, 'Cannot mute yourself.', ERROR_CODES.BAD_REQUEST)

    await prisma.userMute.create({
      data: { muterId: req.user.userId, mutedId: target.id },
    })

    res.json({ muted: true })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ muted: true })
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return sendError(res, 500, 'Mute feature is not available yet.', ERROR_CODES.INTERNAL)
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── DELETE /api/users/:username/mute ────────────────────────────
// Unmute a user.
const unmuteUser = async (req, res) => {
  try {
    const target = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!target) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    await prisma.userMute.deleteMany({
      where: { muterId: req.user.userId, mutedId: target.id },
    })

    res.json({ muted: false })
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json({ muted: false })
    }
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/follow-requests ───────────────────────────
const getFollowRequests = async (req, res) => {
  try {
    const pendingFollows = await prisma.userFollow.findMany({
      where: { followingId: req.user.userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        follower: {
          select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            avatarUrl: true,
            accountType: true,
          },
        },
      },
    })

    res.json({
      count: pendingFollows.length,
      requests: pendingFollows.map((f) => ({
        ...f.follower,
        requestedAt: f.createdAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/:username/follow-request/accept ────────────
const acceptFollowRequest = async (req, res) => {
  try {
    const requester = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, username: true },
    })
    if (!requester) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const follow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: { followerId: requester.id, followingId: req.user.userId },
      },
    })

    if (!follow || follow.status !== 'pending') {
      return sendError(res, 404, 'No pending follow request from this user.', ERROR_CODES.NOT_FOUND)
    }

    await prisma.userFollow.update({
      where: {
        followerId_followingId: { followerId: requester.id, followingId: req.user.userId },
      },
      data: { status: 'active' },
    })

    await createNotification(prisma, {
      userId: requester.id,
      type: 'follow_accepted',
      message: `${req.user.username} accepted your follow request.`,
      actorId: req.user.userId,
      linkPath: `/users/${req.user.username}`,
    })

    checkAndAwardBadges(prisma, req.user.userId)
    res.json({ accepted: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/:username/follow-request/decline ───────────
const declineFollowRequest = async (req, res) => {
  try {
    const requester = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!requester) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const follow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: { followerId: requester.id, followingId: req.user.userId },
      },
    })

    if (!follow || follow.status !== 'pending') {
      return sendError(res, 404, 'No pending follow request from this user.', ERROR_CODES.NOT_FOUND)
    }

    await prisma.userFollow.delete({
      where: {
        followerId_followingId: { followerId: requester.id, followingId: req.user.userId },
      },
    })

    res.json({ declined: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── PATCH /api/users/me/privacy ────────────────────────────────
const updatePrivacy = async (req, res) => {
  try {
    const { isPrivate } = req.body || {}
    if (typeof isPrivate !== 'boolean') {
      return sendError(res, 400, 'isPrivate must be a boolean.', ERROR_CODES.BAD_REQUEST)
    }

    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { isPrivate },
      select: { id: true, isPrivate: true },
    })

    // When switching from private to public, auto-accept all pending follow requests
    if (!isPrivate) {
      await prisma.userFollow.updateMany({
        where: { followingId: req.user.userId, status: 'pending' },
        data: { status: 'active' },
      })
    }

    res.json({ isPrivate: updated.isPrivate })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

const getTermsStatus = async (req, res) => {
  try {
    const status = await getUserLegalStatus(req.user.userId)
    res.json({
      acceptedVersion: status?.acceptedVersion || null,
      acceptedAt: status?.acceptedAt || null,
      currentVersion: CURRENT_LEGAL_VERSION,
      needsUpdate: Boolean(status?.needsAcceptance),
      missingRequiredDocuments: status?.missingRequiredDocuments || [],
      acceptedDocuments: status?.acceptedDocuments || [],
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── POST /api/users/me/terms-accept ─────────────────────────────
const acceptTerms = async (req, res) => {
  try {
    const status = await acceptCurrentLegalDocuments(req.user.userId)
    res.json({
      acceptedVersion: status.acceptedVersion,
      acceptedAt: status.acceptedAt,
      currentVersion: CURRENT_LEGAL_VERSION,
      needsUpdate: false,
      missingRequiredDocuments: [],
      acceptedDocuments: status.acceptedDocuments,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  getMyActivity,
  getActivityByUsername,
  getMyBadges,
  getBadgesByUsername,
  getMyPinnedSheets,
  addPinnedSheet,
  deletePinnedSheet,
  reorderPinnedSheets,
  getUserByUsername,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  updatePrivacy,
  getMyStreak,
  getMyWeeklyActivity,
  getMe,
  getFollowSuggestions,
  getBlockedUsers,
  getMutedUsers,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  getTermsStatus,
  acceptTerms,
  requestAccountTypeChange,
  getAccountTypeStatus,
  getLearningGoal,
  setLearningGoal,
  getOnboardingState,
}

const MAX_LEARNING_GOAL_LENGTH = 500

async function getLearningGoal(req, res) {
  try {
    const latest = await prisma.learningGoal.findFirst({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, goal: true, createdAt: true },
    })
    return res.json({ goal: latest || null })
  } catch (err) {
    captureError(err, { where: 'getLearningGoal' })
    return sendError(res, 500, 'Failed to load learning goal', ERROR_CODES.INTERNAL)
  }
}

async function setLearningGoal(req, res) {
  try {
    const raw = typeof req.body?.goal === 'string' ? req.body.goal.trim() : ''
    if (!raw) {
      return sendError(res, 400, 'goal is required', ERROR_CODES.BAD_REQUEST)
    }
    if (raw.length > MAX_LEARNING_GOAL_LENGTH) {
      return res
        .status(400)
        .json({ error: `goal must be ${MAX_LEARNING_GOAL_LENGTH} characters or fewer` })
    }
    const created = await prisma.learningGoal.create({
      data: { userId: req.user.userId, goal: raw },
      select: { id: true, goal: true, createdAt: true },
    })
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { learningGoal: raw },
    })
    return res.status(201).json({ goal: created })
  } catch (err) {
    captureError(err, { where: 'setLearningGoal' })
    return sendError(res, 500, 'Failed to save learning goal', ERROR_CODES.INTERNAL)
  }
}

// ── Account type change: 2-day revert + 3 changes/30 days rate cap ──────────
// See docs/internal/roles-and-permissions-plan.md §8.

const VALID_ACCOUNT_TYPES = ['student', 'teacher', 'other']
const DAY_MS = 24 * 60 * 60 * 1000
const REVERT_WINDOW_MS = 2 * DAY_MS
const RATE_CAP_WINDOW_MS = 30 * DAY_MS
const RATE_CAP_MAX_CHANGES = 3

async function countRecentNonRevertChanges(userId, since) {
  return prisma.roleChangeLog.count({
    where: {
      userId,
      wasRevert: false,
      changedAt: { gte: since },
    },
  })
}

async function archiveEnrollments(tx, userId) {
  const enrollments = await tx.enrollment.findMany({
    where: { userId },
    select: { id: true, courseId: true },
  })
  if (enrollments.length === 0) return 0
  await tx.userEnrollmentArchive.createMany({
    data: enrollments.map((e) => ({
      userId,
      courseId: e.courseId,
      reason: 'role_change',
    })),
  })
  await tx.enrollment.deleteMany({ where: { userId } })
  return enrollments.length
}

async function restoreEnrollments(tx, userId) {
  const archived = await tx.userEnrollmentArchive.findMany({
    where: { userId, reason: 'role_change' },
    orderBy: { archivedAt: 'desc' },
  })
  if (archived.length === 0) return { restored: 0, missing: 0 }
  const courseIds = [...new Set(archived.map((a) => a.courseId))]
  const existingCourses = await tx.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true },
  })
  const existingIds = new Set(existingCourses.map((c) => c.id))
  const restorable = archived.filter((a) => existingIds.has(a.courseId))
  if (restorable.length > 0) {
    await tx.enrollment.createMany({
      data: restorable.map((a) => ({ userId, courseId: a.courseId })),
      skipDuplicates: true,
    })
  }
  // Clear archive rows we've just consumed.
  await tx.userEnrollmentArchive.deleteMany({
    where: { userId, reason: 'role_change' },
  })
  return {
    restored: restorable.length,
    missing: archived.length - restorable.length,
  }
}

function isInRevertWindow(user) {
  return Boolean(
    user?.roleRevertDeadline && new Date(user.roleRevertDeadline).getTime() > Date.now(),
  )
}

async function requestAccountTypeChange(req, res) {
  try {
    const { accountType, reason } = req.body || {}
    if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
      return sendError(
        res,
        400,
        `Account type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const { userId } = req.user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountType: true,
        previousAccountType: true,
        roleRevertDeadline: true,
      },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    if (user.accountType === accountType) {
      return sendError(res, 400, 'You already have this account type.', ERROR_CODES.BAD_REQUEST)
    }

    const inRevert = isInRevertWindow(user)
    const isRevert = inRevert && accountType === user.previousAccountType

    // Forward changes (not reverts) count toward the 30-day rate cap.
    if (!isRevert) {
      const since = new Date(Date.now() - RATE_CAP_WINDOW_MS)
      const used = await countRecentNonRevertChanges(userId, since)
      if (used >= RATE_CAP_MAX_CHANGES) {
        const oldestWithinWindow = await prisma.roleChangeLog.findFirst({
          where: { userId, wasRevert: false, changedAt: { gte: since } },
          orderBy: { changedAt: 'asc' },
          select: { changedAt: true },
        })
        const retryAfter = oldestWithinWindow
          ? new Date(oldestWithinWindow.changedAt.getTime() + RATE_CAP_WINDOW_MS).toISOString()
          : null
        return sendError(
          res,
          409,
          `You can only change your role ${RATE_CAP_MAX_CHANGES} times every 30 days.`,
          'COOLDOWN',
          {
            retryAfter,
          },
        )
      }
    }

    const now = new Date()
    const ip = req.ip || null
    const userAgent = (req.get && req.get('user-agent')) || null
    let archivedEnrollmentCount = 0
    let restoredInfo = { restored: 0, missing: 0 }
    let nextState

    await prisma.$transaction(async (tx) => {
      if (isRevert) {
        restoredInfo = await restoreEnrollments(tx, userId)
        nextState = await tx.user.update({
          where: { id: userId },
          data: {
            accountType,
            previousAccountType: null,
            roleRevertDeadline: null,
            accountTypeChangedAt: now,
          },
          select: {
            accountType: true,
            previousAccountType: true,
            roleRevertDeadline: true,
          },
        })
      } else {
        archivedEnrollmentCount = await archiveEnrollments(tx, userId)
        nextState = await tx.user.update({
          where: { id: userId },
          data: {
            accountType,
            previousAccountType: user.accountType,
            roleRevertDeadline: new Date(now.getTime() + REVERT_WINDOW_MS),
            pendingAccountType: null,
            accountTypeChangedAt: now,
          },
          select: {
            accountType: true,
            previousAccountType: true,
            roleRevertDeadline: true,
          },
        })
      }

      await tx.roleChangeLog.create({
        data: {
          userId,
          fromAccountType: user.accountType,
          toAccountType: accountType,
          reason: typeof reason === 'string' && reason ? reason.slice(0, 500) : null,
          wasRevert: isRevert,
          ip,
          userAgent,
          changedAt: now,
        },
      })
    })

    emitToUser(userId, SOCKET_EVENTS.USER_ROLE_CHANGED, {
      accountType: nextState.accountType,
      previousAccountType: nextState.previousAccountType,
      roleRevertDeadline: nextState.roleRevertDeadline,
      wasRevert: isRevert,
      changedAt: now.toISOString(),
    })

    return res.json({
      accountType: nextState.accountType,
      previousAccountType: nextState.previousAccountType,
      roleRevertDeadline: nextState.roleRevertDeadline,
      wasRevert: isRevert,
      archivedEnrollmentCount,
      restoredEnrollmentCount: restoredInfo.restored,
      unavailableCourseCount: restoredInfo.missing,
      needsReload: true,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function getAccountTypeStatus(req, res) {
  try {
    const { userId } = req.user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountType: true,
        previousAccountType: true,
        roleRevertDeadline: true,
        accountTypeChangedAt: true,
      },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    // Expire stale revert windows so the client doesn't see fake state.
    let { previousAccountType, roleRevertDeadline } = user
    if (roleRevertDeadline && new Date(roleRevertDeadline).getTime() <= Date.now()) {
      await prisma.user.update({
        where: { id: userId },
        data: { roleRevertDeadline: null, previousAccountType: null },
      })
      previousAccountType = null
      roleRevertDeadline = null
    }

    const since = new Date(Date.now() - RATE_CAP_WINDOW_MS)
    const used = await countRecentNonRevertChanges(userId, since)

    return res.json({
      accountType: user.accountType,
      previousAccountType,
      roleRevertDeadline,
      changedAt: user.accountTypeChangedAt,
      changesUsedLast30Days: used,
      changesRemainingLast30Days: Math.max(0, RATE_CAP_MAX_CHANGES - used),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── GET /api/users/me/onboarding-state ──────────────────────────────────────
//
// Per-role Getting Started checklist state. Every signal here is derived from
// existing tables — no new schema. The shape matches the `testFn(state)`
// contract in frontend/studyhub-app/src/features/onboarding/checklistConfig.js.
//
// Each Prisma call is wrapped in safeCount/safeFirst below so a missing table
// (e.g., if a migration is lagging in a preview env) degrades gracefully to
// 0 / false rather than throwing. The per-call fallbacks are also why this
// endpoint is safe to ship before every downstream feature (Sections, topic
// follow scoreboard, learning-goal task engine) has landed — those counters
// will stay at 0 until the underlying tables ship in later weeks.
//
// See docs/internal/design-refresh-v2-week2-brainstorm.md §7 and
//     docs/internal/design-refresh-v2-week2-to-week5-execution.md.
async function getOnboardingState(req, res) {
  const userId = req.user?.userId
  if (!userId) {
    return sendError(res, 401, 'Not authenticated', ERROR_CODES.UNAUTHORIZED)
  }

  /** Run a Prisma promise and return `fallback` if it rejects. */
  const safe = async (thunk, fallback) => {
    try {
      return await thunk()
    } catch (err) {
      captureError(err, { where: 'getOnboardingState', userId, note: 'safe fallback' })
      return fallback
    }
  }

  try {
    const [
      userRow,
      onboarding,
      enrollmentCount,
      starCount,
      examCount,
      groupMembershipCount,
      publishedMaterialCount,
      problemQueuePostCount,
      hashtagFollowCount,
      learningGoalRow,
      noteCount,
      sectionCount,
      scheduledSessionCount,
    ] = await Promise.all([
      safe(
        () =>
          prisma.user.findUnique({
            where: { id: userId },
            select: { accountType: true, trustLevel: true, learningGoal: true },
          }),
        null,
      ),
      safe(
        () =>
          prisma.onboardingProgress.findUnique({
            where: { userId },
            select: { schoolSelected: true, coursesAdded: true, completedAt: true },
          }),
        null,
      ),
      safe(() => prisma.enrollment.count({ where: { userId } }), 0),
      safe(() => prisma.starredSheet.count({ where: { userId } }), 0),
      safe(() => prisma.courseExam.count({ where: { userId } }), 0),
      safe(() => prisma.studyGroupMember.count({ where: { userId, status: 'active' } }), 0),
      safe(() => prisma.studySheet.count({ where: { userId, status: 'published' } }), 0),
      safe(
        () =>
          prisma.groupDiscussionPost.count({
            where: { userId, type: { in: ['question', 'announcement'] } },
          }),
        0,
      ),
      safe(() => prisma.hashtagFollow.count({ where: { userId } }), 0),
      safe(
        () =>
          prisma.learningGoal.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          }),
        null,
      ),
      safe(() => prisma.note.count({ where: { userId } }), 0),
      // Sections the user is enrolled in (as a student) OR teaches.
      // Counted via SectionEnrollment (student side) and Section (teacher
      // side); we prefer whichever is greater because an "onboarded" user
      // has at least one relationship either way.
      safe(async () => {
        const [enrolled, taught] = await Promise.all([
          prisma.sectionEnrollment.count({ where: { userId } }),
          prisma.section.count({ where: { teacherId: userId, archived: false } }),
        ])
        return Math.max(enrolled, taught)
      }, 0),
      // Scheduled sessions the user has RSVP'd to with "going" or "maybe".
      // Proxy for "has this user engaged with any scheduled session yet?"
      safe(
        () =>
          prisma.groupSessionRsvp.count({
            where: { userId, status: { in: ['going', 'maybe'] } },
          }),
        0,
      ),
    ])

    const accountType = userRow?.accountType || 'student'
    // hasSchool: true if onboarding has a recorded school selection OR the
    // user has at least one enrollment (because enrollment implies a school).
    const hasSchool = Boolean(onboarding?.schoolSelected) || enrollmentCount > 0
    // hasMajor is not yet a first-class field — v2 Week 3 will add a
    // `major` column under the Settings → Profile polish pass. Until then
    // this is false and the checklist item stays unchecked.
    const hasMajor = false
    // teacherVerified proxies off trustLevel >= 2 for now. When the full
    // StaffVerification model lands (v2 Week 4+), swap in the real lookup.
    const teacherVerified = (userRow?.trustLevel ?? 0) >= 2

    return res.json({
      accountType,
      hasSchool,
      hasMajor,
      courseFollowCount: enrollmentCount,
      starCount,
      examCount,
      groupMembershipCount,
      teacherVerified,
      publishedMaterialCount,
      // Live counters — wired 2026-04-23 per tech-debt handoff §14.
      // SectionEnrollment + Section (teacher) + GroupSessionRsvp come from
      // the main Prisma query above; wrapped in `safe()` for graceful
      // degradation if any table is unreachable.
      sectionCount,
      scheduledSessionCount,
      problemQueuePostCount,
      topicFollowCount: hashtagFollowCount,
      hasLearningGoal: Boolean(learningGoalRow) || Boolean(userRow?.learningGoal),
      // Goal task engine (Week 4 of master plan) — stays 0 until the
      // GoalTask model lands. Explicitly called out so future work finds it.
      completedGoalTaskCount: 0,
      noteCount,
      // Non-checklist metadata the client uses for copy + analytics.
      meta: {
        onboardingCompleted: Boolean(onboarding?.completedAt),
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    captureError(err, { where: 'getOnboardingState', userId })
    return sendError(res, 500, 'Failed to load onboarding state', ERROR_CODES.INTERNAL)
  }
}

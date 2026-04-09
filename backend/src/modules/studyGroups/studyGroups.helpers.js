/**
 * studyGroups.helpers.js — Shared helper functions for study groups
 */

const prisma = require('../../lib/prisma')
const sanitizeHtml = require('sanitize-html')

/**
 * Parse an ID param with radix 10 and return null on NaN
 */
function parseId(val) {
  const parsed = parseInt(val, 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Get membership record or null
 */
async function requireGroupMember(groupId, userId) {
  return prisma.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
}

/**
 * Check if user is admin (returns boolean)
 */
async function isGroupAdmin(groupId, userId) {
  const member = await requireGroupMember(groupId, userId)
  return member && member.role === 'admin'
}

/**
 * Check if user is admin or moderator (returns boolean)
 */
async function isGroupAdminOrMod(groupId, userId) {
  const member = await requireGroupMember(groupId, userId)
  return member && (member.role === 'admin' || member.role === 'moderator')
}

/**
 * Phase 5: check if a member is currently muted. Returns true/false.
 * A mute is active when `mutedUntil` is non-null and in the future.
 * Graceful degradation: returns false on any error.
 */
async function isMutedInGroup(groupId, userId) {
  if (!groupId || !userId) return false
  try {
    const member = await prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { mutedUntil: true, mutedReason: true },
    })
    if (!member || !member.mutedUntil) return false
    return new Date(member.mutedUntil) > new Date()
  } catch {
    return false
  }
}

/**
 * Phase 5: check if a user is blocked from a group. Returns the block
 * row on hit, null on miss. Graceful-degradation: returns null on any
 * DB error so a missing table never 500s the request.
 */
async function isBlockedFromGroup(groupId, userId) {
  if (!groupId || !userId) return null
  try {
    return await prisma.groupBlock.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, reason: true, createdAt: true },
    })
  } catch {
    return null
  }
}

/**
 * Strip HTML tags from user content.
 * Uses sanitize-html to strip all tags reliably (regex is bypassable).
 */
function stripHtmlTags(text) {
  if (!text || typeof text !== 'string') return ''
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} })
}

/**
 * Validate group name
 */
function validateGroupName(name) {
  const trimmed = (name || '').trim()
  if (!trimmed || trimmed.length < 1 || trimmed.length > 100) {
    return null
  }
  return trimmed
}

/**
 * Validate description
 */
function validateDescription(desc) {
  if (!desc) return ''
  const stripped = stripHtmlTags(desc)
  if (stripped.length > 2000) {
    return null // invalid
  }
  return stripped
}

/**
 * Validate title (strips HTML to prevent XSS)
 */
function validateTitle(title) {
  const trimmed = stripHtmlTags(title || '').trim()
  if (!trimmed || trimmed.length < 1 || trimmed.length > 200) {
    return null
  }
  return trimmed
}

/**
 * Validate a resource URL.  Must be a valid URL with https or http scheme.
 */
function validateResourceUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    return parsed.href
  } catch {
    return null
  }
}

/**
 * Format group for response (with counts)
 */
async function formatGroup(group, currentUserId = null) {
  // Run aggregate queries in parallel for performance
  const [
    memberCount,
    pendingMemberCount,
    invitedMemberCount,
    resourceCount,
    upcomingSessionCount,
    discussionPostCount,
    userMembershipResult,
  ] =
    await Promise.all([
      prisma.studyGroupMember.count({
        where: { groupId: group.id, status: 'active' },
      }),
      prisma.studyGroupMember.count({
        where: { groupId: group.id, status: 'pending' },
      }),
      prisma.studyGroupMember.count({
        where: { groupId: group.id, status: 'invited' },
      }),
      prisma.groupResource.count({
        where: { groupId: group.id },
      }),
      prisma.groupSession.count({
        where: { groupId: group.id, scheduledAt: { gte: new Date() }, status: { in: ['upcoming', 'in_progress'] } },
      }),
      prisma.groupDiscussionPost.count({
        where: { groupId: group.id },
      }),
      currentUserId ? requireGroupMember(group.id, currentUserId) : Promise.resolve(null),
    ])

  const userMembership = userMembershipResult

  // Derive convenience fields for frontend
  const isMember = userMembership && userMembership.status === 'active'
  const userRole = userMembership ? userMembership.role : null
  const availableSeats = Math.max(0, (group.maxMembers || 0) - memberCount)

  // Look up course name if courseId exists
  let courseName = null
  let courseCode = null
  let schoolId = null
  let schoolName = null
  let schoolShort = null
  if (group.courseId) {
    try {
      const course = await prisma.course.findUnique({
        where: { id: group.courseId },
        select: {
          name: true,
          code: true,
          school: {
            select: {
              id: true,
              name: true,
              short: true,
            },
          },
        },
      })
      courseName = course?.name || null
      courseCode = course?.code || null
      schoolId = course?.school?.id || null
      schoolName = course?.school?.name || null
      schoolShort = course?.school?.short || null
    } catch {
      // Non-critical, ignore
    }
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    // Phase 4 header banner
    backgroundUrl: group.backgroundUrl ?? null,
    backgroundCredit: group.backgroundCredit ?? null,
    courseId: group.courseId,
    courseName,
    courseCode,
    schoolId,
    schoolName,
    schoolShort,
    privacy: group.privacy,
    maxMembers: group.maxMembers,
    createdById: group.createdById,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    memberCount,
    pendingMemberCount,
    invitedMemberCount,
    availableSeats,
    resourceCount,
    upcomingSessionCount,
    discussionPostCount,
    isMember: !!isMember,
    userRole,
    userMembership: userMembership ? {
      id: userMembership.id,
      role: userMembership.role,
      status: userMembership.status,
      joinedAt: userMembership.joinedAt,
    } : null,
    // Phase 5 trust & safety surface
    moderationStatus: group.moderationStatus ?? 'active',
    warnedUntil: group.warnedUntil ?? null,
    lockedAt: group.lockedAt ?? null,
    deletedAt: group.deletedAt ?? null,
    memberListPrivate: group.memberListPrivate ?? false,
    requirePostApproval: group.requirePostApproval ?? false,
  }
}

module.exports = {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  isGroupAdminOrMod,
  isBlockedFromGroup,
  isMutedInGroup,
  stripHtmlTags,
  validateGroupName,
  validateDescription,
  validateTitle,
  validateResourceUrl,
  formatGroup,
}

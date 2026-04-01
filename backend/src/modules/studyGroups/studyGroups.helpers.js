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
  const [memberCount, resourceCount, upcomingSessionCount, discussionPostCount, userMembershipResult] =
    await Promise.all([
      prisma.studyGroupMember.count({
        where: { groupId: group.id, status: 'active' },
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

  // Look up course name if courseId exists
  let courseName = null
  if (group.courseId) {
    try {
      const course = await prisma.course.findUnique({
        where: { id: group.courseId },
        select: { name: true },
      })
      courseName = course?.name || null
    } catch {
      // Non-critical, ignore
    }
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    courseId: group.courseId,
    courseName,
    privacy: group.privacy,
    maxMembers: group.maxMembers,
    createdById: group.createdById,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    memberCount,
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
  }
}

module.exports = {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  isGroupAdminOrMod,
  stripHtmlTags,
  validateGroupName,
  validateDescription,
  validateTitle,
  validateResourceUrl,
  formatGroup,
}

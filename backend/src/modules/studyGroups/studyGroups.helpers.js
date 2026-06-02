/**
 * studyGroups.helpers.js — Shared helper functions for study groups
 */

const prisma = require('../../lib/prisma')
const sanitizeHtml = require('../../lib/html/safeSanitize')

/**
 * Parse an ID param with radix 10 and return null on NaN
 */
function parseId(val) {
  const parsed = Number.parseInt(val, 10)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * Get membership record or null.
 *
 * NOTE: this returns the row for ANY status (active / pending / invited /
 * banned). Callers that gate a privileged read or write MUST check
 * `member.status === 'active'` themselves — use requireActiveGroupMember
 * for the common "must be an active member" gate so a pending or banned
 * user cannot read/write a private group's sub-resources.
 */
async function requireGroupMember(groupId, userId) {
  return prisma.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
}

/**
 * Get membership record only when the caller is an ACTIVE member.
 * Returns the row on hit, null when the user is not a member OR their
 * membership is still pending/invited/banned. This is the gate the
 * create/read sub-resource handlers use so an un-approved or banned
 * user can't read discussions/resources/sessions or create posts in a
 * private group.
 */
async function requireActiveGroupMember(groupId, userId) {
  const member = await requireGroupMember(groupId, userId)
  if (!member || member.status !== 'active') return null
  return member
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
  ] = await Promise.all([
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
      where: {
        groupId: group.id,
        scheduledAt: { gte: new Date() },
        status: { in: ['upcoming', 'in_progress'] },
      },
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
    userMembership: userMembership
      ? {
          id: userMembership.id,
          role: userMembership.role,
          status: userMembership.status,
          joinedAt: userMembership.joinedAt,
        }
      : null,
    // Phase 5 trust & safety surface
    moderationStatus: group.moderationStatus ?? 'active',
    warnedUntil: group.warnedUntil ?? null,
    lockedAt: group.lockedAt ?? null,
    deletedAt: group.deletedAt ?? null,
    memberListPrivate: group.memberListPrivate ?? false,
    requirePostApproval: group.requirePostApproval ?? false,
  }
}

/**
 * Synchronous list-path formatter. Produces the SAME shape as formatGroup()
 * but takes pre-batched counts + the viewer's membership instead of issuing
 * 8 queries per group. The list endpoint batches all counts/memberships in a
 * handful of groupBy/findMany calls and maps in memory — turning the old
 * ~8×N query fan-out into a constant ~7 queries per page.
 *
 * formatGroup() (async, single-group) is intentionally KEPT for
 * get/create/update so their responses stay byte-identical.
 *
 * @param {object} group — StudyGroup row WITH `course` relation included.
 * @param {object} batch
 * @param {{active:number,pending:number,invited:number}} [batch.memberCounts]
 * @param {number} [batch.resourceCount]
 * @param {number} [batch.upcomingSessionCount]
 * @param {number} [batch.discussionPostCount]
 * @param {object|null} [batch.membership] — viewer's StudyGroupMember row or null
 */
function formatGroupFromBatch(group, batch = {}) {
  const memberCounts = batch.memberCounts || { active: 0, pending: 0, invited: 0 }
  const memberCount = memberCounts.active || 0
  const pendingMemberCount = memberCounts.pending || 0
  const invitedMemberCount = memberCounts.invited || 0
  const resourceCount = batch.resourceCount || 0
  const upcomingSessionCount = batch.upcomingSessionCount || 0
  const discussionPostCount = batch.discussionPostCount || 0
  const userMembership = batch.membership || null

  const isMember = userMembership && userMembership.status === 'active'
  const userRole = userMembership ? userMembership.role : null
  const availableSeats = Math.max(0, (group.maxMembers || 0) - memberCount)

  const course = group.course || null
  const courseName = course?.name || null
  const courseCode = course?.code || null
  const schoolId = course?.school?.id || null
  const schoolName = course?.school?.name || null
  const schoolShort = course?.school?.short || null

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
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
    userMembership: userMembership
      ? {
          id: userMembership.id,
          role: userMembership.role,
          status: userMembership.status,
          joinedAt: userMembership.joinedAt,
        }
      : null,
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
  requireActiveGroupMember,
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
  formatGroupFromBatch,
}

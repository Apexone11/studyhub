/**
 * roleNotifications.js — role-aware push/email routing.
 *
 * `shouldSendForRole(event, user)` returns false for notification events
 * that the recipient's role shouldn't see. Today this is narrow:
 *   - school.announcement.created — skipped if viewer is a Self-learner
 *     OR viewer isn't enrolled at the event's school.
 *   - course.activity — skipped if viewer isn't enrolled in the course.
 *   - topic.activity — sent only if the viewer follows the hashtag.
 *
 * Anything not listed is role-agnostic and returns true. See
 * docs/roles-and-permissions-plan.md §10.1.
 */

const SELF_LEARNER = 'other'

/**
 * @param {{
 *   type: string,
 *   schoolId?: number,
 *   courseId?: number,
 *   hashtagId?: number,
 * }} event
 * @param {{
 *   accountType?: string,
 *   schoolIds?: number[],
 *   enrolledCourseIds?: number[],
 *   followedHashtagIds?: number[],
 * }} user
 */
function shouldSendForRole(event, user) {
  if (!event || typeof event.type !== 'string') return true
  const type = event.type
  const accountType = user?.accountType

  if (type === 'school.announcement.created') {
    if (accountType === SELF_LEARNER) return false
    const schoolIds = Array.isArray(user?.schoolIds) ? user.schoolIds : []
    if (event.schoolId == null) return true
    return schoolIds.includes(event.schoolId)
  }

  if (type === 'course.activity') {
    if (event.courseId == null) return true
    const enrolled = Array.isArray(user?.enrolledCourseIds) ? user.enrolledCourseIds : []
    return enrolled.includes(event.courseId)
  }

  if (type === 'topic.activity') {
    if (event.hashtagId == null) return false
    const follows = Array.isArray(user?.followedHashtagIds) ? user.followedHashtagIds : []
    return follows.includes(event.hashtagId)
  }

  return true
}

module.exports = { shouldSendForRole }

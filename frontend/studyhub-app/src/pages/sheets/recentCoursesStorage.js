export const RECENT_COURSES_KEY = 'studyhub.sheets.recentCourses'
export const RECENT_COURSES_TTL_MS = 60 * 60 * 1000
export const MAX_RECENT_COURSES = 7

function toTimestamp(value) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function pruneRecentCourses(entries, now = Date.now()) {
  if (!Array.isArray(entries)) return []

  return entries
    .filter((entry) => entry && entry.id && entry.code)
    .map((entry) => ({
      id: entry.id,
      code: entry.code,
      schoolId: entry.schoolId || '',
      schoolLabel: entry.schoolLabel || '',
      viewedAt: entry.viewedAt || new Date(now).toISOString(),
    }))
    .filter((entry) => now - toTimestamp(entry.viewedAt) <= RECENT_COURSES_TTL_MS)
    .sort((left, right) => toTimestamp(right.viewedAt) - toTimestamp(left.viewedAt))
    .slice(0, MAX_RECENT_COURSES)
}

export function parseRecentCourses(raw, now = Date.now()) {
  if (!raw) return []

  try {
    return pruneRecentCourses(JSON.parse(raw), now)
  } catch {
    return []
  }
}

export function recordRecentCourse(entries, course, now = Date.now()) {
  const nextEntry = {
    id: course.id,
    code: course.code,
    schoolId: course.school?.id || course.schoolId || '',
    schoolLabel: course.school?.short || course.school?.name || course.schoolLabel || '',
    viewedAt: new Date(now).toISOString(),
  }

  const dedupedEntries = pruneRecentCourses(entries, now).filter((entry) => String(entry.id) !== String(course.id))
  return pruneRecentCourses([nextEntry, ...dedupedEntries], now)
}
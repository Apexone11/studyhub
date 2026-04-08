import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_COURSES,
  RECENT_COURSES_TTL_MS,
  parseRecentCourses,
  recordRecentCourse,
} from './recentCoursesStorage'

describe('recentCoursesStorage', () => {
  it('drops expired entries when parsing stored recent courses', () => {
    const now = Date.parse('2026-04-08T12:00:00.000Z')
    const raw = JSON.stringify([
      { id: 1, code: 'CMSC131', viewedAt: '2026-04-08T11:30:00.000Z' },
      { id: 2, code: 'MATH151', viewedAt: '2026-04-08T09:30:00.000Z' },
    ])

    expect(parseRecentCourses(raw, now)).toEqual([
      { id: 1, code: 'CMSC131', schoolId: '', schoolLabel: '', viewedAt: '2026-04-08T11:30:00.000Z' },
    ])
  })

  it('records a course at the front, dedupes, and caps the list at seven entries', () => {
    const now = Date.parse('2026-04-08T12:00:00.000Z')
    const entries = Array.from({ length: MAX_RECENT_COURSES }, (_, index) => ({
      id: index + 1,
      code: `COURSE${index + 1}`,
      viewedAt: new Date(now - ((index + 1) * 1000)).toISOString(),
    }))

    const updated = recordRecentCourse(entries, {
      id: 3,
      code: 'COURSE3',
      school: { id: 22, short: 'UMBC' },
    }, now + 500)

    expect(updated).toHaveLength(MAX_RECENT_COURSES)
    expect(updated[0]).toMatchObject({ id: 3, code: 'COURSE3', schoolId: 22, schoolLabel: 'UMBC' })
    expect(updated.filter((entry) => entry.id === 3)).toHaveLength(1)
  })

  it('keeps only entries from the last hour when recording a course', () => {
    const now = Date.parse('2026-04-08T12:00:00.000Z')
    const updated = recordRecentCourse([
      { id: 1, code: 'CMSC131', viewedAt: new Date(now - RECENT_COURSES_TTL_MS + 1000).toISOString() },
      { id: 2, code: 'MATH151', viewedAt: new Date(now - RECENT_COURSES_TTL_MS - 1000).toISOString() },
    ], {
      id: 3,
      code: 'PHYS121',
    }, now)

    expect(updated.map((entry) => entry.id)).toEqual([3, 1])
  })
})
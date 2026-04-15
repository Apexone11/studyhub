import { describe, expect, it } from 'vitest'
import { shouldSendForRole } from '../src/lib/roleNotifications.js'

describe('shouldSendForRole', () => {
  it('passes through role-agnostic events (mention, reply, star, dm)', () => {
    for (const type of ['mention', 'reply', 'star', 'dm', 'ai.ready', 'anything-else']) {
      expect(shouldSendForRole({ type }, { accountType: 'other' })).toBe(true)
      expect(shouldSendForRole({ type }, { accountType: 'student' })).toBe(true)
    }
  })

  it('skips school announcements for Self-learners regardless of schoolIds', () => {
    expect(
      shouldSendForRole(
        { type: 'school.announcement.created', schoolId: 7 },
        { accountType: 'other', schoolIds: [7] },
      ),
    ).toBe(false)
  })

  it('skips school announcements for students not at that school', () => {
    expect(
      shouldSendForRole(
        { type: 'school.announcement.created', schoolId: 5 },
        { accountType: 'student', schoolIds: [7] },
      ),
    ).toBe(false)
  })

  it('sends school announcements to enrolled students at the right school', () => {
    expect(
      shouldSendForRole(
        { type: 'school.announcement.created', schoolId: 5 },
        { accountType: 'student', schoolIds: [5, 9] },
      ),
    ).toBe(true)
  })

  it('skips course.activity if the user is not enrolled', () => {
    expect(
      shouldSendForRole(
        { type: 'course.activity', courseId: 101 },
        { accountType: 'student', enrolledCourseIds: [99] },
      ),
    ).toBe(false)
  })

  it('sends course.activity when the user is enrolled', () => {
    expect(
      shouldSendForRole(
        { type: 'course.activity', courseId: 101 },
        { accountType: 'student', enrolledCourseIds: [101] },
      ),
    ).toBe(true)
  })

  it('routes topic.activity only to hashtag followers', () => {
    expect(
      shouldSendForRole(
        { type: 'topic.activity', hashtagId: 42 },
        { accountType: 'other', followedHashtagIds: [42] },
      ),
    ).toBe(true)
    expect(
      shouldSendForRole(
        { type: 'topic.activity', hashtagId: 42 },
        { accountType: 'other', followedHashtagIds: [99] },
      ),
    ).toBe(false)
  })

  it('treats malformed input conservatively', () => {
    expect(shouldSendForRole(null, { accountType: 'student' })).toBe(true)
    expect(shouldSendForRole({}, { accountType: 'student' })).toBe(true)
    expect(shouldSendForRole({ type: 'topic.activity' }, { accountType: 'other' })).toBe(false)
  })
})

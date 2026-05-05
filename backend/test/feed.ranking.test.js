import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { scoreFeedItem, ALLOWED_SORT_MODES } = require('../src/modules/feed/feed.list.controller')

/*
 * Unit tests for the feed ranking score. These tests assert the contract
 * the controller depends on:
 *   1. The ranked sort produces a different order from pure recency when
 *      engagement signals diverge — otherwise the ranked mode is dead code.
 *   2. The follow / same-school / course boosts compose multiplicatively
 *      and the strongest boost (follow) outranks weaker ones.
 *   3. Time decay actually decays — a 7-day-old high-engagement post sinks
 *      below a 1-hour-old fresh post given the documented thresholds.
 *   4. The ALLOWED_SORT_MODES allowlist matches the controller spec.
 */

function makeItem(overrides = {}) {
  return {
    id: overrides.id || 1,
    type: overrides.type || 'post',
    createdAt: overrides.createdAt || new Date(),
    reactions: overrides.reactions || { likes: 0, dislikes: 0 },
    commentCount: overrides.commentCount || 0,
    forks: overrides.forks || 0,
    downloads: overrides.downloads || 0,
    author: overrides.author || { id: 100 },
    course: overrides.course || null,
    authorSchoolIds: overrides.authorSchoolIds || null,
    ...overrides,
  }
}

describe('feed ranking', () => {
  it('exports the sort-mode allowlist used by the controller', () => {
    expect(ALLOWED_SORT_MODES.has('ranked')).toBe(true)
    expect(ALLOWED_SORT_MODES.has('recent')).toBe(true)
    expect(ALLOWED_SORT_MODES.has('latest')).toBe(false)
    expect(ALLOWED_SORT_MODES.has('')).toBe(false)
  })

  it('produces a different order from pure recency when engagement diverges', () => {
    // Item A: brand-new but zero engagement.
    // Item B: 30 minutes old with 20 likes + 10 comments.
    const now = Date.now()
    const items = [
      makeItem({
        id: 1,
        createdAt: new Date(now - 60_000),
        reactions: { likes: 0, dislikes: 0 },
        commentCount: 0,
      }),
      makeItem({
        id: 2,
        createdAt: new Date(now - 30 * 60_000),
        reactions: { likes: 20, dislikes: 0 },
        commentCount: 10,
      }),
    ]
    const ranked = [...items].sort((a, b) => scoreFeedItem(b) - scoreFeedItem(a))
    const recent = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    // Ranked should put the high-engagement post first; recent should put
    // the brand-new post first.
    expect(ranked[0].id).toBe(2)
    expect(recent[0].id).toBe(1)
  })

  it('time decay sinks a 7-day-old highly-engaged post below a 1-hour-old fresh post', () => {
    const now = Date.now()
    const old = makeItem({
      id: 1,
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      reactions: { likes: 50, dislikes: 0 },
      commentCount: 30,
    })
    const fresh = makeItem({
      id: 2,
      createdAt: new Date(now - 60 * 60 * 1000),
      reactions: { likes: 0, dislikes: 0 },
      commentCount: 0,
    })
    expect(scoreFeedItem(fresh)).toBeGreaterThan(scoreFeedItem(old))
  })

  it('follow boost outranks identical content from a non-followed author', () => {
    const now = Date.now()
    const followed = makeItem({
      id: 1,
      author: { id: 200 },
      createdAt: new Date(now - 10 * 60_000),
      reactions: { likes: 5, dislikes: 0 },
      commentCount: 2,
    })
    const stranger = makeItem({
      id: 2,
      author: { id: 300 },
      createdAt: new Date(now - 10 * 60_000),
      reactions: { likes: 5, dislikes: 0 },
      commentCount: 2,
    })
    const ctx = {
      followingIds: new Set([200]),
      schoolIds: new Set(),
      courseIds: new Set(),
    }
    expect(scoreFeedItem(followed, ctx)).toBeGreaterThan(scoreFeedItem(stranger, ctx))
  })

  it('same-school boost lifts an item but is weaker than a follow boost', () => {
    const now = Date.now()
    const base = {
      createdAt: new Date(now - 30 * 60_000),
      reactions: { likes: 1, dislikes: 0 },
      commentCount: 0,
    }
    const followed = makeItem({ ...base, id: 1, author: { id: 200 } })
    const sameSchool = makeItem({
      ...base,
      id: 2,
      author: { id: 300 },
      authorSchoolIds: [10],
    })
    const stranger = makeItem({ ...base, id: 3, author: { id: 400 } })
    const ctx = {
      followingIds: new Set([200]),
      schoolIds: new Set([10]),
      courseIds: new Set(),
    }
    const sFollowed = scoreFeedItem(followed, ctx)
    const sSchool = scoreFeedItem(sameSchool, ctx)
    const sStranger = scoreFeedItem(stranger, ctx)
    expect(sFollowed).toBeGreaterThan(sSchool)
    expect(sSchool).toBeGreaterThan(sStranger)
  })

  it('course-enrollment boost stacks with the follow boost', () => {
    const now = Date.now()
    const base = {
      createdAt: new Date(now - 15 * 60_000),
      reactions: { likes: 1, dislikes: 0 },
      commentCount: 0,
    }
    const followedAndEnrolled = makeItem({
      ...base,
      id: 1,
      author: { id: 200 },
      course: { id: 50 },
    })
    const followedOnly = makeItem({
      ...base,
      id: 2,
      author: { id: 200 },
      course: { id: 99 },
    })
    const ctx = {
      followingIds: new Set([200]),
      schoolIds: new Set(),
      courseIds: new Set([50]),
    }
    expect(scoreFeedItem(followedAndEnrolled, ctx)).toBeGreaterThan(
      scoreFeedItem(followedOnly, ctx),
    )
  })

  it('handles missing createdAt gracefully without throwing', () => {
    const item = makeItem({ createdAt: null })
    expect(() => scoreFeedItem(item)).not.toThrow()
    expect(Number.isFinite(scoreFeedItem(item))).toBe(true)
  })

  it('dislike penalty reduces score below a no-engagement post', () => {
    const now = Date.now()
    const base = { createdAt: new Date(now - 5 * 60_000) }
    const negative = makeItem({
      ...base,
      id: 1,
      reactions: { likes: 0, dislikes: 10 },
    })
    const neutral = makeItem({ ...base, id: 2, reactions: { likes: 0, dislikes: 0 } })
    expect(scoreFeedItem(neutral)).toBeGreaterThan(scoreFeedItem(negative))
  })
})

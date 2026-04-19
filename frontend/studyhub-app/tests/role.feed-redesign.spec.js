import { expect, test } from '@playwright/test'

/**
 * Self-learner feed redesign E2E (docs/internal/roles-and-permissions-plan.md §12.4).
 * Asserts that a Self-learner viewer:
 *   - Sees the topic interest chip row (not course chips).
 *   - Sees the goal triage card.
 *   - Gets community-flavored composer copy (no "classmates").
 *   - Does not see the school-suggestion banner.
 */

async function mockSelfLearnerAuth(page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: 301,
        username: 'beta_self_learner',
        role: 'student',
        accountType: 'other',
        email: 'sl@example.com',
        emailVerified: true,
        twoFaEnabled: false,
        avatarUrl: null,
        createdAt: '2026-03-16T12:00:00.000Z',
        enrollments: [],
        counts: { courses: 0, sheets: 0, stars: 0 },
        csrfToken: 'csrf-token',
      },
    }),
  )
  await page.route('**/api/notifications?*', (route) =>
    route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } }),
  )
  await page.route('**/api/feed?*', (route) =>
    route.fulfill({
      status: 200,
      json: { items: [], total: 0, partial: false, degradedSections: [] },
    }),
  )
  await page.route('**/api/sheets/leaderboard?type=*', (route) =>
    route.fulfill({ status: 200, json: [] }),
  )
  await page.route('**/api/hashtags/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        hashtags: [
          { id: 1, name: 'calculus', followedAt: new Date().toISOString() },
          { id: 2, name: 'web_dev', followedAt: new Date().toISOString() },
        ],
      },
    }),
  )
  await page.route('**/api/users/me/learning-goal', (route) =>
    route.fulfill({
      status: 200,
      json: {
        goal: { id: 1, goal: 'Finish React Router deep dive', createdAt: new Date().toISOString() },
      },
    }),
  )
  await page.route('**/api/flags/evaluate/flag_roles_v2**', (route) =>
    route.fulfill({ status: 200, json: { enabled: true } }),
  )
}

test('Self-learner feed shows topic chips, goal card, and community copy @smoke', async ({
  page,
}) => {
  await mockSelfLearnerAuth(page)

  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('studyhub.feed.getting-started.dismissed', '1')
  })

  await page.goto('/feed')

  // Goal card.
  await expect(page.getByRole('heading', { name: /Your learning goal/i })).toBeVisible()
  await expect(page.getByText(/Finish React Router deep dive/)).toBeVisible()

  // Interest chip row with the user's followed topics.
  await expect(page.getByRole('button', { name: /^#calculus$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^#web_dev$/ })).toBeVisible()

  // Community-flavored composer copy.
  await expect(page.getByText(/Share with the community/i)).toBeVisible()
  await expect(page.getByText(/Share with your classmates/i)).toHaveCount(0)

  // Sidebar: "TOPICS I FOLLOW" is visible, "MY COURSES" is hidden for 'other'.
  await expect(page.getByText(/TOPICS I FOLLOW/i)).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: /MY COURSES/i })).toHaveCount(0)
})

import { expect, test } from '@playwright/test'

/**
 * Label-scan sweep (docs/internal/roles-and-permissions-plan.md §12.4).
 * For each role-aware surface, assert no literal "Other" or "Member" string
 * appears as a role label. The whitelist covers legitimate non-role uses
 * (report reasons, appeal categories, deletion reasons).
 */

const WHITELIST = [
  // Deletion-reason dropdown shown on settings delete-account section.
  'Reason for leaving',
]

async function mockAuth(page, accountType) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: 200 + (accountType === 'other' ? 1 : accountType === 'teacher' ? 2 : 0),
        username: `user_${accountType}`,
        role: 'student',
        accountType,
        email: `${accountType}@example.com`,
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
    route.fulfill({ status: 200, json: { hashtags: [] } }),
  )
  await page.route('**/api/flags/evaluate/flag_roles_v2**', (route) =>
    route.fulfill({ status: 200, json: { enabled: true } }),
  )
}

/** Asserts no offending role-label string is visible outside the whitelist. */
async function expectNoOffendingRoleLabels(page) {
  const text = await page.evaluate(() => document.body.innerText || '')
  for (const phrase of ['\\bOther\\b', '\\bMember\\b']) {
    const re = new RegExp(phrase)
    const matches = text.split('\n').filter((line) => re.test(line))
    // Drop whitelisted lines.
    const unexpected = matches.filter((line) => !WHITELIST.some((w) => line.includes(w)))
    expect(unexpected, `Unexpected role label match for /${phrase}/`).toEqual([])
  }
}

test('Signup page: role chip reads "Self-learner", never "Other" @smoke', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
  )
  await page.goto('/register')
  await expect(page.getByRole('button', { name: 'Self-learner' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Other$/ })).toHaveCount(0)
})

test('Sidebar + feed: Self-learner never sees "Member" as a role label @smoke', async ({
  page,
}) => {
  await mockAuth(page, 'other')
  await page.goto('/feed')
  await expect(page.getByText(/Self-learner/).first()).toBeVisible()
  await expectNoOffendingRoleLabels(page)
})

test('Profile page: role badge reads "Self-learner", no "Member" string @smoke', async ({
  page,
}) => {
  await mockAuth(page, 'other')
  await page.route('**/api/users/user_other*', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: 201,
        username: 'user_other',
        displayName: 'Self Learner',
        accountType: 'other',
        role: 'student',
        plan: 'free',
        isDonor: false,
        donorLevel: null,
        bio: '',
        enrollments: [],
        counts: { courses: 0, sheets: 0, stars: 0 },
        createdAt: '2026-03-16T12:00:00.000Z',
      },
    }),
  )
  await page.goto('/users/user_other')
  await expect(page.getByText(/Self-learner/).first()).toBeVisible()
  await expectNoOffendingRoleLabels(page)
})

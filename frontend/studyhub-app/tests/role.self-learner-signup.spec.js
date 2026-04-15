import { expect, test } from '@playwright/test'

/**
 * Self-learner signup E2E (docs/roles-and-permissions-plan.md §12.4):
 * - Email/password sign-up with the "Self-learner" chip.
 * - Lands on /onboarding?track=self-learner.
 * - Onboarding skips school + course steps and shows the interest-chip grid.
 * - Selecting 3+ topics + skipping the goal step lands on /feed.
 * - Sidebar reads "Self-learner" (never "Member"), "MY COURSES" is gone,
 *   and "TOPICS I FOLLOW" surfaces the picks.
 */

const SELF_LEARNER_USER = {
  id: 42,
  username: 'beta_self_learner',
  role: 'student',
  accountType: 'other',
  email: null,
  emailVerified: false,
  twoFaEnabled: false,
  avatarUrl: null,
  createdAt: '2026-03-16T12:00:00.000Z',
  enrollments: [],
  counts: { courses: 0, sheets: 0, stars: 0 },
  csrfToken: 'csrf-token',
}

async function mockPublicAuthApis(page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
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
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test('Self-learner signup picks Self-learner chip, follows topics, lands on feed @smoke', async ({
  page,
}) => {
  const followCalls = []
  let registerPayload = null

  await mockPublicAuthApis(page)
  await disableTutorials(page)

  await page.route('**/api/auth/register', async (route) => {
    registerPayload = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: { user: SELF_LEARNER_USER } })
  })
  await page.route('**/api/courses/schools', (route) => route.fulfill({ status: 200, json: [] }))

  // Onboarding state machine: minimal stub that just advances steps.
  let currentStep = 1
  await page.route('**/api/onboarding/state', (route) =>
    route.fulfill({
      status: 200,
      json: {
        state: { currentStep, completed: false, skipped: false, progress: {} },
      },
    }),
  )
  await page.route('**/api/onboarding/steps/*', async (route) => {
    currentStep += 1
    await route.fulfill({
      status: 200,
      json: { state: { currentStep, completed: false, skipped: false, progress: {} } },
    })
  })

  // Hashtag follow + me endpoints.
  let nextHashtagId = 100
  await page.route('**/api/hashtags/follow', async (route) => {
    const body = route.request().postDataJSON()
    followCalls.push(body.name)
    await route.fulfill({
      status: 201,
      json: { hashtag: { id: nextHashtagId++, name: body.name } },
    })
  })
  await page.route('**/api/hashtags/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        hashtags: followCalls.map((name, idx) => ({
          id: 100 + idx,
          name,
          followedAt: new Date().toISOString(),
        })),
      },
    }),
  )

  // ── Sign up with the Self-learner chip ───────────────────────────────────
  await page.goto('/register')
  await page.getByLabel('Username').fill('beta_self_learner')
  await page.getByLabel('Password', { exact: true }).fill('Password123')
  await page.getByLabel('Confirm Password').fill('Password123')

  // Plan §12.2: chip must read "Self-learner", never "Other".
  await expect(page.getByRole('button', { name: 'Self-learner' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Other$/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Self-learner' }).click()

  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create Account' }).click()

  expect(registerPayload).toMatchObject({
    username: 'beta_self_learner',
    accountType: 'other',
  })

  // ── Self-learner onboarding track ────────────────────────────────────────
  // Step 1: Welcome.
  await expect(page.getByRole('button', { name: /Get started/i })).toBeVisible()
  await page.getByRole('button', { name: /Get started/i }).click()

  // Step 2: Pick interests. School/course steps must be absent.
  await expect(page.getByRole('heading', { name: /What do you want to learn\?/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Choose your courses/i })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Pick your school/i })).toHaveCount(0)

  await page.getByRole('button', { name: /^#Calculus$/ }).click()
  await page.getByRole('button', { name: /^#Web Dev$/ }).click()
  await page.getByRole('button', { name: /^#Physics$/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Confirm hashtag follow API was hit for each pick.
  await expect.poll(() => followCalls.length).toBe(3)
  expect(followCalls).toEqual(expect.arrayContaining(['calculus', 'web_dev', 'physics']))

  // Step 3: Goal — skip.
  await expect(
    page.getByRole('heading', { name: /What do you want to learn this month\?/i }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Skip$/ }).click()

  // Step 4-6: skip the rest of the funnel to land on the feed.
  await page.getByRole('button', { name: /Skip setup entirely/i }).click()

  await expect(page).toHaveURL(/\/feed/)

  // ── Sidebar: role label + topic section ──────────────────────────────────
  await expect(page.getByText(/Self-learner/)).toBeVisible()
  await expect(page.getByText(/Member/)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 3, name: /MY COURSES/i })).toHaveCount(0)
  await expect(page.getByText(/TOPICS I FOLLOW/i)).toBeVisible()
})

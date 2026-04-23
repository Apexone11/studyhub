import { expect, test } from '@playwright/test'

/**
 * Role OAuth picker E2E (docs/internal/roles-and-permissions-plan.md §12.4).
 * The Google button itself is rendered by @react-oauth/google, which is
 * painful to drive headlessly. Instead we simulate the backend response by
 * seeding sessionStorage (the same shape the `needs_role` handler writes)
 * and driving the picker screen directly. This validates the screen and
 * completion call without standing up a real Google OAuth flow.
 */

const STORAGE_KEY = 'studyhub.google.pending'

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

test('Google picker lets a new user pick Self-learner and lands on onboarding @smoke', async ({
  page,
}) => {
  await mockPublicAuthApis(page)

  await page.addInitScript((key) => {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        tempToken: 'tok-playwright',
        email: 'picker@example.com',
        name: 'Picker User',
        avatarUrl: null,
      }),
    )
  }, STORAGE_KEY)

  let completePayload = null
  await page.route('**/api/auth/google/complete', async (route) => {
    completePayload = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        status: 'signed_in',
        user: {
          id: 111,
          username: 'picker_user',
          role: 'student',
          accountType: 'other',
          email: 'picker@example.com',
          emailVerified: true,
          twoFaEnabled: false,
          avatarUrl: null,
          createdAt: '2026-03-16T12:00:00.000Z',
          enrollments: [],
          counts: { courses: 0, sheets: 0, stars: 0 },
          csrfToken: 'csrf-token',
        },
        nextRoute: '/onboarding?track=self-learner',
      },
    })
  })

  await page.goto('/signup/role')

  // Three chips, "Self-learner" present, "Other" absent.
  await expect(page.getByRole('radio', { name: 'Student' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Teacher / TA' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Self-learner' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Other$/ })).toHaveCount(0)

  // Continue is disabled until a role is picked.
  const continueBtn = page.getByRole('button', { name: /continue/i })
  await expect(continueBtn).toBeDisabled()

  await page.getByRole('radio', { name: 'Self-learner' }).click()
  await expect(continueBtn).toBeEnabled()
  await continueBtn.click()

  await expect(page).toHaveURL(/\/onboarding\?track=self-learner/)
  expect(completePayload).toMatchObject({
    tempToken: 'tok-playwright',
    accountType: 'other',
    legalAccepted: true,
  })

  // Session storage cleared after success.
  const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
  expect(stored).toBeNull()
})

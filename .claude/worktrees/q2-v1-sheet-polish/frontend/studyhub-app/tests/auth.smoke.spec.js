import { expect, test } from '@playwright/test'

async function mockPublicAuthApis(page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  })
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({ status: 200, json: { items: [], total: 0, partial: false, degradedSections: [] } })
  })
  await page.route('**/api/sheets/leaderboard?type=*', async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })
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

test('registration creates a local account and lets users skip course setup @smoke', async ({ page }) => {
  let registerPayload = null

  await mockPublicAuthApis(page)
  await disableTutorials(page)
  await page.route('**/api/auth/register', async (route) => {
    registerPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        user: {
          id: 7,
          username: 'new_student',
          role: 'student',
          email: null,
          emailVerified: false,
          twoFaEnabled: false,
          avatarUrl: null,
          createdAt: '2026-03-16T12:00:00.000Z',
          enrollments: [],
          counts: { courses: 0, sheets: 0, stars: 0 },
          csrfToken: 'csrf-token',
        },
      },
    })
  })
  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
          courses: [{ id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I' }],
        },
      ],
    })
  })

  await page.goto('/register')
  await page.getByLabel('Username').fill('new_student')
  await page.getByLabel('Password', { exact: true }).fill('Password123')
  await page.getByLabel('Confirm Password').fill('Password123')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create Account' }).click()

  expect(registerPayload).toMatchObject({
    username: 'new_student',
    password: 'Password123',
    confirmPassword: 'Password123',
    termsAccepted: true,
  })

  await expect(page.getByRole('heading', { name: 'Choose your courses' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip For Now' }).click()

  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible()
})

test('local login signs in immediately without email verification @smoke', async ({ page }) => {

  await mockPublicAuthApis(page)
  await disableTutorials(page)
  await page.route('**/api/auth/login', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      username: 'legacy_user',
      password: 'Password123',
    })
    await route.fulfill({
      status: 200,
      json: {
        user: {
          id: 9,
          username: 'legacy_user',
          role: 'student',
          email: 'legacy_user@studyhub.test',
          emailVerified: true,
          twoFaEnabled: false,
          avatarUrl: null,
          createdAt: '2026-03-16T12:00:00.000Z',
          enrollments: [],
          counts: { courses: 0, sheets: 0, stars: 0 },
          csrfToken: 'csrf-token',
        },
      },
    })
  })

  await page.goto('/login')
  await page.getByLabel('Username').fill('legacy_user')
  await page.getByLabel('Password').fill('Password123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible()
})
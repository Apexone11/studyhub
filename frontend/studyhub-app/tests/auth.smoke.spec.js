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

test('registration verifies email before account creation @smoke', async ({ page }) => {
  let startPayload = null
  let completePayload = null

  await mockPublicAuthApis(page)
  await page.route('**/api/auth/register/start', async (route) => {
    startPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        verificationToken: 'register-token',
        deliveryHint: 'ne***@studyhub.test',
        expiresAt: '2026-03-16T12:15:00.000Z',
        resendAvailableAt: '2026-03-16T12:01:00.000Z',
      },
    })
  })
  await page.route('**/api/auth/register/verify', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      verificationToken: 'register-token',
      code: '123456',
    })
    await route.fulfill({
      status: 200,
      json: {
        verified: true,
        verificationToken: 'register-token',
        nextStep: 'courses',
        expiresAt: '2026-03-16T12:15:00.000Z',
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
  await page.route('**/api/auth/register/complete', async (route) => {
    completePayload = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        user: {
          id: 7,
          username: 'new_student',
          role: 'student',
          email: 'new_student@studyhub.test',
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

  await page.goto('/register')
  await page.getByLabel('Username').fill('new_student')
  await page.getByLabel('Email', { exact: true }).fill('new_student@studyhub.test')
  await page.getByLabel('Password', { exact: true }).fill('Password123')
  await page.getByLabel('Confirm Password').fill('Password123')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continue To Email Verification' }).click()

  expect(startPayload).toMatchObject({
    username: 'new_student',
    email: 'new_student@studyhub.test',
    password: 'Password123',
    confirmPassword: 'Password123',
    termsAccepted: true,
  })

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
  await page.getByLabel('Verification Code').fill('123456')
  await page.getByRole('button', { name: 'Verify Code' }).click()
  await expect(page.getByRole('heading', { name: 'Choose your courses' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip For Now' }).click()

  expect(completePayload).toMatchObject({
    verificationToken: 'register-token',
    schoolId: null,
    courseIds: [],
    customCourses: [],
  })

  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByText('Share an update')).toBeVisible()
})

test('legacy login requires email verification before session success @smoke', async ({ page }) => {
  let sendPayload = null
  let verifyPayload = null

  await mockPublicAuthApis(page)
  await page.route('**/api/auth/login', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      username: 'legacy_user',
      password: 'Password123',
    })
    await route.fulfill({
      status: 200,
      json: {
        requiresEmailVerification: true,
        verificationToken: 'login-token',
        emailRequired: true,
        emailHint: '',
        email: null,
        expiresAt: '2026-03-16T12:15:00.000Z',
        resendAvailableAt: '2026-03-16T12:01:00.000Z',
      },
    })
  })
  await page.route('**/api/auth/login/verification/send', async (route) => {
    sendPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      json: {
        requiresEmailVerification: true,
        verificationToken: 'login-token',
        emailRequired: false,
        emailHint: 'le***@studyhub.test',
        email: 'legacy_user@studyhub.test',
        expiresAt: '2026-03-16T12:15:00.000Z',
        resendAvailableAt: '2026-03-16T12:01:00.000Z',
      },
    })
  })
  await page.route('**/api/auth/login/verification/verify', async (route) => {
    verifyPayload = route.request().postDataJSON()
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
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
  await page.getByLabel('Email Address').fill('legacy_user@studyhub.test')
  await page.getByRole('button', { name: 'Send / Resend Code' }).click()

  expect(sendPayload).toMatchObject({
    verificationToken: 'login-token',
    email: 'legacy_user@studyhub.test',
  })

  await page.getByLabel('Verification Code').fill('654321')
  await page.getByRole('button', { name: 'Verify Email' }).click()

  expect(verifyPayload).toMatchObject({
    verificationToken: 'login-token',
    code: '654321',
  })

  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByText('Share an update')).toBeVisible()
})
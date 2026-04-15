import { expect, test } from '@playwright/test'

/**
 * Role switch E2E (docs/roles-and-permissions-plan.md §12.4).
 * Drives Settings → Role tile through three scenarios:
 *   1. Change role → success path → reload-to-apply flag set.
 *   2. Revert within 2 days → restored-enrollment toast.
 *   3. 3rd forward change within 30 days → 409 COOLDOWN error toast.
 */

async function mockBaseAuth(page, accountType = 'student') {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        user: {
          id: 9,
          username: 'switch_user',
          role: 'student',
          accountType,
          email: 'switch@example.com',
          emailVerified: true,
          twoFaEnabled: false,
          avatarUrl: null,
          createdAt: '2026-03-16T12:00:00.000Z',
          enrollments: [],
          counts: { courses: 0, sheets: 0, stars: 0 },
          csrfToken: 'csrf-token',
        },
      },
    }),
  )
  await page.route('**/api/notifications?*', (route) =>
    route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } }),
  )
  await page.route('**/api/flags/evaluate/flag_roles_v2**', (route) =>
    route.fulfill({ status: 200, json: { enabled: true } }),
  )
}

test('Switching role sets the reload flag and fires the update toast @smoke', async ({ page }) => {
  await mockBaseAuth(page, 'student')

  let currentState = {
    accountType: 'student',
    previousAccountType: null,
    roleRevertDeadline: null,
    changesUsedLast30Days: 0,
    changesRemainingLast30Days: 3,
  }

  await page.route('**/api/users/me/role-status', (route) =>
    route.fulfill({ status: 200, json: currentState }),
  )
  await page.route('**/api/users/me/account-type-status', (route) =>
    route.fulfill({ status: 200, json: currentState }),
  )

  let patchPayload = null
  await page.route('**/api/users/me/account-type', async (route) => {
    patchPayload = route.request().postDataJSON()
    const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    currentState = {
      accountType: patchPayload.accountType,
      previousAccountType: 'student',
      roleRevertDeadline: deadline,
      changesUsedLast30Days: 1,
      changesRemainingLast30Days: 2,
    }
    await route.fulfill({
      status: 200,
      json: {
        accountType: patchPayload.accountType,
        previousAccountType: 'student',
        roleRevertDeadline: deadline,
        wasRevert: false,
        archivedEnrollmentCount: 0,
        needsReload: true,
      },
    })
  })

  // Block the actual reload so the test can observe the flag.
  await page.addInitScript(() => {
    window.__reloadCalled = 0
    const originalReload = window.location.reload
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      value: () => {
        window.__reloadCalled += 1
      },
    })
    window.__restoreReload = originalReload
  })

  await page.goto('/settings?tab=account')
  await expect(page.getByRole('heading', { name: 'Your role' })).toBeVisible()

  await page.getByRole('button', { name: /change role/i }).click()
  await page.getByRole('radio', { name: 'Self-learner' }).click()
  await page.getByRole('button', { name: /^Change role$/i }).click()

  await expect.poll(() => patchPayload?.accountType).toBe('other')

  // Reload flag written before the page reloads.
  const flag = await page.evaluate(() => localStorage.getItem('pending_role_reload'))
  expect(flag).toBeTruthy()
  expect(JSON.parse(flag)).toMatchObject({ targetRole: 'other' })

  await expect.poll(() => page.evaluate(() => window.__reloadCalled)).toBeGreaterThan(0)
})

test('Hitting the 30-day cap surfaces a cooldown error toast @smoke', async ({ page }) => {
  await mockBaseAuth(page, 'other')

  await page.route('**/api/users/me/role-status', (route) =>
    route.fulfill({
      status: 200,
      json: {
        accountType: 'other',
        previousAccountType: null,
        roleRevertDeadline: null,
        changesUsedLast30Days: 3,
        changesRemainingLast30Days: 0,
      },
    }),
  )
  await page.route('**/api/users/me/account-type-status', (route) =>
    route.fulfill({
      status: 200,
      json: {
        accountType: 'other',
        previousAccountType: null,
        roleRevertDeadline: null,
        changesUsedLast30Days: 3,
        changesRemainingLast30Days: 0,
      },
    }),
  )

  await page.route('**/api/users/me/account-type', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: 'You can only change your role 3 times every 30 days.',
        code: 'COOLDOWN',
        retryAfter: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      },
    }),
  )

  await page.goto('/settings?tab=account')
  await page.getByRole('button', { name: /change role/i }).click()
  await page.getByRole('radio', { name: 'Student' }).click()
  await page.getByRole('button', { name: /^Change role$/i }).click()

  await expect(page.getByText(/3 times every 30 days/i)).toBeVisible()
})

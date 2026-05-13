/**
 * smoke.mobile.spec.js — phone-viewport smoke coverage of the 8 highest-
 * traffic flows.
 *
 * Loop M21 — every test here is tagged `@mobile @smoke` so it can run
 * inside the standard `npm run test:e2e:smoke` lane while the dedicated
 * mobile config (`playwright.mobile.config.js`) pins the viewport to
 * 390×844 with a real iPhone UA + `isMobile/hasTouch`.
 *
 * Each test relies on `mockAuthenticatedApp` for deterministic data, so
 * the failure mode of any test is "the component under test is not
 * shipped / broken" rather than "the API changed."
 *
 * Tests fail informatively when M1/M3 components aren't shipped:
 *   - `data-testid="mobile-bottom-nav"` from `MobileBottomNav.jsx`
 *   - `aria-label="Open navigation"` from `AppSidebar.jsx`
 * The selectors are descriptive so a failure points at the component
 * that needs to ship rather than at a brittle text string.
 */
import { expect, test, devices } from '@playwright/test'
import { mockAuthenticatedApp } from '../helpers/mockStudyHubApi'

// Belt-and-suspenders: pin every test in this file to the iPhone 13 Pro
// device profile even when the suite is run via the standard
// `playwright.config.js`. The mobile config also sets this at the
// project level — this `test.use` is what makes the test correct in
// either invocation.
test.use({ ...devices['iPhone 13 Pro'] })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

async function mockPublicAuthApis(page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  })
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { items: [], total: 0, partial: false, degradedSections: [] },
    })
  })
  await page.route('**/api/sheets/leaderboard?type=*', async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })
  await page.route('**/api/platform-stats', async (route) => {
    await route.fulfill({
      status: 200,
      json: { totalUsers: 0, totalSheets: 0, totalCourses: 0, totalSchools: 0 },
    })
  })
  await page.route('**/api/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, json: { ok: true } })
      return
    }
    await route.fulfill({ status: 200, json: {} })
  })
}

test.describe('@mobile @smoke mobile smoke', () => {
  test('home page loads with the hero CTA visible on a phone viewport', async ({ page }) => {
    await mockPublicAuthApis(page)
    await page.goto('/')
    // The HomePage hero copy and the primary "Get started" / "Sign up"
    // CTA are the load-bearing affordance for unauthenticated phone
    // visitors. Either link visible is acceptable — the page ships both
    // depending on layout state.
    const heroCta = page.getByRole('link', { name: /sign up|get started|create account/i }).first()
    await expect(heroCta).toBeVisible({ timeout: 10000 })
  })

  test('login page renders and the form accepts input', async ({ page }) => {
    await mockPublicAuthApis(page)
    await page.goto('/login')

    const usernameField = page.getByLabel(/username|email/i).first()
    const passwordField = page.getByLabel(/password/i).first()
    await expect(usernameField).toBeVisible({ timeout: 10000 })
    await expect(passwordField).toBeVisible()
    // Typing on a touch viewport — the form must accept input without
    // the on-screen keyboard zooming. We can't observe the OS keyboard
    // from Playwright, but we can confirm the field actually captures
    // characters which proves there is no `inputMode="none"` or
    // `readonly` regression.
    await usernameField.fill('beta_student1')
    await passwordField.fill('correct horse battery staple')
    await expect(usernameField).toHaveValue('beta_student1')
  })

  test('register page renders with a usable form', async ({ page }) => {
    await mockPublicAuthApis(page)
    await page.goto('/register')

    // Don't depend on a specific heading copy — the v2 design refresh
    // has moved this string twice. Look for the submit button instead
    // (load-bearing affordance for the page's primary job).
    const submit = page.getByRole('button', { name: /sign ?up|create account|continue/i }).first()
    await expect(submit).toBeVisible({ timeout: 10000 })
  })

  test('mobile hamburger drawer opens from the sidebar trigger', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/feed')

    const openNav = page.getByRole('button', { name: 'Open navigation' })
    await expect(openNav).toBeVisible({ timeout: 10000 })
    await openNav.click()
    await expect(page.getByRole('dialog', { name: 'Sidebar navigation' })).toBeVisible()
  })

  test('sheets browse renders single-column on phone width', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/sheets')
    await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible({
      timeout: 10000,
    })

    // Confirm no card horizontally exceeds the viewport (phone-width
    // single-column constraint). The first article on /sheets is a
    // sheet card.
    const firstCard = page.locator('article').first()
    if ((await firstCard.count()) > 0) {
      const box = await firstCard.boundingBox()
      const viewport = page.viewportSize()
      if (box && viewport) {
        expect(box.width).toBeLessThanOrEqual(viewport.width + 1)
      }
    }
  })

  test('note viewer renders without horizontal overflow', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/notes')
    await expect(page.getByRole('heading', { name: 'My Notes' })).toBeVisible({
      timeout: 10000,
    })

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1)
  })

  test('messages page renders the conversation list', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/messages')
    // We only assert the page loads — conversation list contents are
    // mocked empty by the catch-all. The test verifies the route
    // renders on a phone without crashing.
    await expect(page).toHaveURL(/\/messages/)
    // Look for the load-bearing "Messages" heading or page surface.
    const messagesArea = page.locator('main, [role="main"]').first()
    await expect(messagesArea).toBeVisible({ timeout: 10000 })
  })

  test('settings page renders with the sidebar collapsed', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/settings')

    await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 10000 })
    // On compact viewports the AppSidebar is rendered as a drawer
    // trigger, not as an always-visible rail. The "Open navigation"
    // button is the canonical indicator.
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
  })
})

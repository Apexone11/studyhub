/**
 * E2E tests for Playground page at /playground.
 *
 * The Playground is an authenticated page showing a "Coming Soon" landing
 * with feature cards and CTAs to return to main app features.
 *
 * @tags @e2e @playground
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

test.use({ serviceWorkers: 'block' })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test.describe('Playground Page @e2e', () => {
  test('playground page loads with heading', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'playground_tester', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: /code playground/i })
    await expect(heading).toBeVisible()
  })

  test('shows coming soon indicator', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'playground_tester_2', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    const comingSoon = page.getByText(/coming soon/i)
    await expect(comingSoon).toBeVisible()
  })

  test('displays feature cards', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'playground_tester_3', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    const browserEditor = page.getByText(/browser-based editor/i)
    const multipleLanguages = page.getByText(/multiple languages/i)
    const livePreview = page.getByText(/live preview/i)

    await expect(browserEditor).toBeVisible()
    await expect(multipleLanguages).toBeVisible()
    await expect(livePreview).toBeVisible()
  })

  test('has navigation back to main app', async ({ page }) => {
    await disableTutorials(page)

    const user = createSessionUser({ username: 'playground_tester_4', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    const sheetsLink = page.getByRole('link', { name: /sheets|study sheets/i })
    const dashboardLink = page.getByRole('link', { name: /dashboard/i })

    const hasNavigationLink = (await sheetsLink.isVisible()) || (await dashboardLink.isVisible())
    expect(hasNavigationLink).toBe(true)
  })

  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: 'Unauthorized' },
      })
    })

    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: 'Not authenticated' },
      })
    })

    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/login/)
  })
})

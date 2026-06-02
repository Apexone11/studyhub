/**
 * bottom-nav.mobile.spec.js — MobileBottomNav contract.
 *
 * MobileBottomNav (`src/components/sidebar/MobileBottomNav.jsx`) is the
 * iOS/Android-style fixed bottom rail rendered ONLY on phone-class
 * viewports for authenticated users. It is suppressed on /ai and on
 * auth/onboarding routes.
 *
 * Three contracts under test:
 *   1. The nav renders on phone width with `data-testid="mobile-bottom-nav"`.
 *   2. The active destination has `aria-current="page"` matching the URL.
 *   3. The nav is hidden on /ai (founder rule: the /ai page owns the
 *      full viewport for chat and the nav would overlap the composer).
 *
 * If MobileBottomNav isn't shipped yet, these tests fail with
 * "expected locator to be visible" — the selector is the canonical
 * `data-testid` baked into the component.
 */
import { expect, test, devices } from '@playwright/test'
import { mockAuthenticatedApp } from '../helpers/mockStudyHubApi'

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

test.describe('@mobile @smoke MobileBottomNav', () => {
  test('renders the fixed bottom rail on phone viewport', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/feed')

    const nav = page.locator('[data-testid="mobile-bottom-nav"]')
    await expect(nav).toBeVisible({ timeout: 10000 })

    // 5 primary destinations: Feed / Sheets / Notes / Messages / AI.
    const links = nav.locator('a')
    await expect(links).toHaveCount(5)

    // Each tab is anchored to the viewport bottom row.
    const box = await nav.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    // Fixed position at bottom — y should sit near viewport.height.
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 100)
  })

  test('active destination has aria-current="page" matching the route', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/sheets')

    const nav = page.locator('[data-testid="mobile-bottom-nav"]')
    await expect(nav).toBeVisible({ timeout: 10000 })

    const activeLink = nav.locator('a[aria-current="page"]')
    await expect(activeLink).toHaveCount(1)
    // The label of the active link should match the current section
    // ("Sheets" because we navigated to /sheets).
    await expect(activeLink).toHaveText(/sheets/i)
  })

  test('nav is hidden on /ai (owns the full viewport for chat)', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/ai')
    // Either the nav node is not in the DOM at all, or the render gate
    // unmounts it. Either passes — we assert the locator is not
    // visible.
    const nav = page.locator('[data-testid="mobile-bottom-nav"]')
    await expect(nav).toHaveCount(0)
  })
})

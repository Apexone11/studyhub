/**
 * E2E tests for legal pages (Terms, Privacy, Guidelines, Cookie Policy, Disclaimer, About).
 *
 * These are public pages that do not require authentication.
 * Tests verify correct page headings, shared layout elements, and navigation.
 *
 * @tags @e2e @legal-pages
 */
import { test, expect } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

async function mockUnauthenticated(page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: 'Not authenticated' },
    })
  })
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: 'Unauthorized' },
    })
  })
}

test.describe('Legal Pages @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticated(page)
  })

  test('terms page loads with correct heading', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Terms of Service' })
    await expect(heading).toBeVisible()
  })

  test('privacy page loads with correct heading', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Privacy Policy' })
    await expect(heading).toBeVisible()
  })

  test('guidelines page loads with correct heading', async ({ page }) => {
    await page.goto('/guidelines')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Community Guidelines' })
    await expect(heading).toBeVisible()
  })

  test('cookie policy page loads', async ({ page }) => {
    await page.goto('/cookies')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Cookie Policy' })
    await expect(heading).toBeVisible()
  })

  test('disclaimer page loads', async ({ page }) => {
    await page.goto('/disclaimer')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Disclaimer' })
    await expect(heading).toBeVisible()
  })

  test('about page loads with mission statement', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('domcontentloaded')

    const heading = page.getByRole('heading', { name: 'Knowledge Belongs to Everyone' })
    await expect(heading).toBeVisible()
  })

  test('about page shows team section', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('domcontentloaded')

    const teamMember = page.getByText('Abdul Rahman Fornah')
    await expect(teamMember).toBeVisible()
  })

  test('about page shows roadmap', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('domcontentloaded')

    const roadmapHeading = page.getByRole('heading', { name: /roadmap/i })
    await expect(roadmapHeading).toBeVisible()
  })

  test('legal pages have navbar', async ({ page }) => {
    const legalRoutes = [
      '/terms',
      '/privacy',
      '/guidelines',
      '/cookies',
      '/disclaimer',
      '/about',
    ]

    for (const route of legalRoutes) {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      const logo = page
        .getByRole('link')
        .filter({ hasText: /studyhub|home/i })
        .first()
      await expect(logo).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('footer links navigate between legal pages', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('domcontentloaded')

    const privacyLink = page.getByRole('link', { name: /privacy/i }).last()
    await expect(privacyLink).toBeVisible()

    await privacyLink.click()
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/\/privacy$/)

    const privacyPageHeading = page.getByRole('heading', { name: 'Privacy Policy' })
    await expect(privacyPageHeading).toBeVisible()
  })
})

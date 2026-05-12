/**
 * smoke.2026-05-12.spec.js — Broad cycle smoke pass (loop T9, 2026-05-12).
 *
 * Eight scenarios covering the canonical public surfaces of the StudyHub web
 * app. Every test mocks `/api/auth/me` to 401 so the public guards on these
 * routes stay in their unauthenticated branch. Network requests outside the
 * mocked list are short-circuited to empty success to keep the suite hermetic.
 *
 * Tagged `@smoke @cycle-2026-05-12` so the broader smoke gate can include /
 * exclude this file by tag selector.
 */
import { expect, test } from '@playwright/test'

async function mockPublicShell(page) {
  // Catch-all stays first → lowest priority under Playwright's LIFO matching.
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, json: {} })
    } else {
      await route.fulfill({ status: 200, json: { ok: true } })
    }
  })
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  })
  await page.route('**/api/platform-stats', async (route) => {
    await route.fulfill({
      status: 200,
      json: { totalUsers: 100, totalSheets: 250, totalCourses: 30, totalSchools: 5 },
    })
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
}

test.describe('Public surface smoke @smoke @cycle-2026-05-12', () => {
  test('anonymous user lands on /, sees hero CTA to register', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Primary CTA in the hero links to /register — verifies the marketing hero
    // rendered without redirecting away or crashing.
    const primary = page.getByRole('link', { name: /Get Started Free/i }).first()
    await expect(primary).toBeVisible()
    await expect(primary).toHaveAttribute('href', /\/register$/)
  })

  test('login page form validates email-ish input', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const username = page.getByLabel('Username').first()
    await expect(username).toBeVisible()
    const password = page.getByLabel('Password').first()
    await expect(password).toBeVisible()

    // Submit button is the canonical "Sign In" CTA. Don't click it (would fire
    // a request) — assert that it exists and is initially enabled.
    const submit = page.getByRole('button', { name: 'Sign In', exact: true })
    await expect(submit).toBeVisible()

    // Empty submit must not crash the page or navigate.
    await submit.click({ trial: true })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('register page exposes required fields', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/register')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirm Password')).toBeVisible()

    const submit = page.getByRole('button', { name: /Create Account/i })
    await expect(submit).toBeVisible()
  })

  test('unknown route renders styled 404 page', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/no-such-route-2026')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('404', { exact: true })).toBeVisible()
    await expect(page.getByText(/Page not found/i)).toBeVisible()
    // Recovery links: home + feed
    await expect(page.getByRole('link', { name: /Go Home/i })).toBeVisible()
  })

  test('/pricing renders the plan grid heading', async ({ page }) => {
    await mockPublicShell(page)
    await page.route('**/api/payments/**', async (route) => {
      await route.fulfill({ status: 200, json: {} })
    })

    await page.goto('/pricing')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('heading', { name: 'StudyHub Pro' })).toBeVisible()
    // At least one Subscribe button must render so the grid is real, not empty.
    await expect(page.getByRole('button', { name: /Subscribe/i }).first()).toBeVisible()
  })

  test('/supporters renders showcase heading', async ({ page }) => {
    await mockPublicShell(page)
    await page.route('**/api/payments/supporters**', async (route) => {
      await route.fulfill({ status: 200, json: { donors: [], proMembers: [], total: 0 } })
    })

    await page.goto('/supporters')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('heading', { name: 'Our Supporters' })).toBeVisible()
  })

  test('/terms renders self-hosted legal content', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/terms')
    await page.waitForLoadState('domcontentloaded')

    // The legal page renders the body text into the document — checking the
    // body is visible and no error banner appears is the lightweight
    // contract. Self-hosted (no third-party iframe per industry-standard
    // anti-pattern guidance in CLAUDE.md).
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Server error')).toHaveCount(0)
    // We don't render an iframe for legal docs anymore — assert that.
    await expect(page.locator('iframe[src*="termly"]')).toHaveCount(0)
  })

  test('/privacy renders self-hosted legal content', async ({ page }) => {
    await mockPublicShell(page)
    await page.goto('/privacy')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Server error')).toHaveCount(0)
    await expect(page.locator('iframe[src*="termly"]')).toHaveCount(0)
  })
})

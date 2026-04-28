/**
 * docs.spec.js — Playwright smoke coverage for the public /docs feature
 * catalog shipped in Design Refresh v2 Week 2.
 *
 * Covers:
 *   - /docs is public (no auth)
 *   - The landing grid lists the core features
 *   - A sub-page renders with a breadcrumb + Try CTA
 *   - Mobile viewport renders without horizontal overflow
 *
 * Tagged @smoke so the fast CI lane picks it up.
 */
import { test, expect } from '@playwright/test'

test.describe('@smoke public docs page', () => {
  test('landing page renders the feature catalog', async ({ page }) => {
    await page.goto('/docs')

    await expect(
      page.getByRole('heading', { level: 1, name: /everything studyhub does/i }),
    ).toBeVisible()

    // Three featured tiles must be present in the grid.
    await expect(page.getByRole('link', { name: /feed/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /study sheets/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /study groups/i }).first()).toBeVisible()

    // "By role" section shows three role cards.
    await expect(page.getByRole('heading', { name: /if you are a student/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /if you are a teacher/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /if you are a self-learner/i })).toBeVisible()
  })

  test('feature sub-page renders with breadcrumb + CTA', async ({ page }) => {
    await page.goto('/docs/feed')

    await expect(page.getByRole('heading', { level: 1, name: /^feed$/i })).toBeVisible()

    // Breadcrumb
    await expect(page.getByRole('link', { name: /^docs$/i }).first()).toBeVisible()

    // Should render the "What it is" section
    await expect(page.getByRole('heading', { name: /what it is/i })).toBeVisible()

    // Unauthenticated CTA routes to /register with an intent param
    const cta = page.getByRole('link', { name: /try feed/i }).first()
    await expect(cta).toBeVisible()
    const href = await cta.getAttribute('href')
    expect(href).toContain('/register')
    expect(href).toContain('intent=feed')
  })

  test('unknown feature slug shows a friendly not-found', async ({ page }) => {
    await page.goto('/docs/this-feature-does-not-exist')
    await expect(page.getByText(/we could not find that feature/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /back to docs/i })).toBeVisible()
  })
})

// The mobile-viewport companion test lives in docs.mobile.smoke.spec.js
// because Playwright requires `test.use({ ...devices['Pixel 7'] })` at
// file scope, not inside a describe block.

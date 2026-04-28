/**
 * docs.mobile.smoke.spec.js — mobile-viewport companion to docs.spec.js.
 *
 * `test.use({ ...devices['Pixel 7'] })` must live at file scope, not
 * inside a describe block (Playwright errors with "Cannot use({
 * defaultBrowserType }) in a describe group, because it forces a new
 * worker"). Split out from docs.spec.js so the rest of that file's
 * desktop-viewport coverage stays in one place.
 *
 * Tagged @smoke so the fast CI lane picks it up.
 */
import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['Pixel 7'] })

test('@smoke public docs page renders without horizontal overflow on a phone', async ({ page }) => {
  await page.goto('/docs')
  await expect(
    page.getByRole('heading', { level: 1, name: /everything studyhub does/i }),
  ).toBeVisible()

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  // Allow 1px of sub-pixel rounding; anything more is real overflow.
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1)
})

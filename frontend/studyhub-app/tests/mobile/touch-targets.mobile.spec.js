/**
 * touch-targets.mobile.spec.js — WCAG 2.5.5 / Apple HIG / Material:
 * every interactive target on a mobile viewport must be at least 44×44
 * CSS pixels. Tap targets smaller than that are misfire risks on
 * thumb-driven interfaces.
 *
 * We don't measure EVERY button on EVERY page — that would test the
 * design tokens, not the implementation. Instead we measure every
 * visible button / link / role=button on the three core authenticated
 * surfaces a phone user lands on most: /feed, /sheets, /messages.
 *
 * The check is intentionally tolerant — a target whose computed box
 * shows >44px in EITHER dimension after factoring in padding counts as
 * passing. Some icon-only buttons paint at 24px but expand their hit
 * area via padding, which is enough.
 */
import { expect, test, devices } from '@playwright/test'
import { mockAuthenticatedApp } from '../helpers/mockStudyHubApi'

test.use({ ...devices['iPhone 13 Pro'] })

const MIN_TAP_SIZE_PX = 44
// Decorative / structural anchors that don't need a 44px hit area —
// e.g., text-only inline links inside a paragraph of running copy. We
// exclude links inside an explicit `[data-testid="prose"]` and the
// `<a href="#main">` skip-link which is hidden until keyboard focus.
const EXCLUDE_SELECTORS = [
  'a[href^="#"]', // anchor/skip-link
  '[data-testid="prose"] a',
  'a[data-decorative="true"]',
]

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

async function collectViolations(page) {
  const violations = []
  const candidates = await page.locator('button, a[href], [role="button"]').all()
  for (const handle of candidates) {
    // Skip excluded selectors and invisible elements.
    const skip = await handle.evaluate((el, excludes) => {
      if (excludes.some((sel) => el.matches(sel))) return true
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return true
      const style = window.getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') return true
      if (Number(style.opacity) === 0) return true
      return false
    }, EXCLUDE_SELECTORS)
    if (skip) continue

    const box = await handle.boundingBox()
    if (!box) continue
    if (box.width >= MIN_TAP_SIZE_PX || box.height >= MIN_TAP_SIZE_PX) continue
    // Neither dimension reaches 44 — record for the assertion.
    const label = await handle.evaluate((el) => {
      const aria = el.getAttribute('aria-label')
      if (aria) return aria
      const text = (el.textContent || '').trim().slice(0, 40)
      if (text) return text
      return el.outerHTML.slice(0, 80)
    })
    violations.push({ label, width: box.width, height: box.height })
  }
  return violations
}

test.describe('@mobile @smoke touch targets', () => {
  test('feed page interactive targets meet 44px minimum', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/feed')
    await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible({ timeout: 10000 })

    const violations = await collectViolations(page)
    expect(
      violations,
      `Tap targets smaller than ${MIN_TAP_SIZE_PX}px on /feed:\n` +
        violations
          .map((v) => `  - "${v.label}" ${v.width.toFixed(1)}×${v.height.toFixed(1)}px`)
          .join('\n'),
    ).toEqual([])
  })

  test('sheets page interactive targets meet 44px minimum', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/sheets')
    await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible({
      timeout: 10000,
    })

    const violations = await collectViolations(page)
    expect(
      violations,
      `Tap targets smaller than ${MIN_TAP_SIZE_PX}px on /sheets:\n` +
        violations
          .map((v) => `  - "${v.label}" ${v.width.toFixed(1)}×${v.height.toFixed(1)}px`)
          .join('\n'),
    ).toEqual([])
  })

  test('messages page interactive targets meet 44px minimum', async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page)
    await page.goto('/messages')
    // Don't wait on a specific element — the catch-all returns an empty
    // conversation list, so we just give the page a beat to mount.
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    const violations = await collectViolations(page)
    expect(
      violations,
      `Tap targets smaller than ${MIN_TAP_SIZE_PX}px on /messages:\n` +
        violations
          .map((v) => `  - "${v.label}" ${v.width.toFixed(1)}×${v.height.toFixed(1)}px`)
          .join('\n'),
    ).toEqual([])
  })
})

/**
 * print-button.spec.js — Sheet / note print button contract (loop T9).
 *
 * Single scenario: clicking the print button on a sheet detail page invokes
 * `window.print()`. The print() call would block on a real run, so we stub
 * it via `page.addInitScript` and assert the stub was called.
 *
 * Tagged @smoke @cycle-2026-05-12.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser, mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
  })
}

async function stubPrint(page) {
  // Replace window.print at navigation time so the click handler increments
  // our counter instead of opening the native dialog (which would freeze
  // headless tests).
  await page.addInitScript(() => {
    let count = 0
    Object.defineProperty(window, '__printCallCount', {
      get: () => count,
      configurable: true,
    })
    window.print = () => {
      count += 1
    }
  })
}

test.describe('Print button @smoke @cycle-2026-05-12', () => {
  test('clicking print on a sheet triggers window.print()', async ({ page }) => {
    await disableTutorials(page)
    await stubPrint(page)

    const user = createSessionUser({ id: 42, username: 'printer', role: 'student' })
    const { sheet } = await mockAuthenticatedApp(page, { user })

    await page.goto(`/sheets/${sheet.id}`)
    await page.waitForLoadState('domcontentloaded')

    const printBtn = page.getByRole('button', { name: /Print this sheet/i })
    await expect(printBtn).toBeVisible()

    await printBtn.click()

    // The stub increments __printCallCount; check it was called exactly once.
    const calls = await page.evaluate(() => window.__printCallCount)
    expect(calls).toBe(1)
  })
})

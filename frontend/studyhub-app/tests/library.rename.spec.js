/**
 * library.rename.spec.js — Verifies the Week 5 BookHub → Library rename
 * (master plan §23.7 / L4-LOW-3).
 *
 * Asserts:
 *  - The /library page hero text is "Library", not "BookHub".
 *  - The document title / aria-label of the route is "Library".
 *  - The string "BookHub" does not appear anywhere on the rendered page.
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test.describe('Library rename: BookHub → Library', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
    await mockAuthenticatedApp(page, {
      user: createSessionUser(),
      routes: {
        '**/api/library/popular*': {
          status: 200,
          body: { books: [], total: 0 },
        },
        '**/api/library/search*': {
          status: 200,
          body: { books: [], total: 0 },
        },
        '**/api/library/shelves*': { status: 200, body: { shelves: [] } },
      },
    })
  })

  test('hero shows "Library" and not "BookHub"', async ({ page }) => {
    await page.goto('/library')
    // Hero title should be present
    const hero = page.locator('.library-hero__title')
    await expect(hero).toHaveText('Library')
    // The page should not contain "BookHub" anywhere
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).not.toContain('BookHub')
  })

  test('document title contains "Library"', async ({ page }) => {
    await page.goto('/library')
    await expect(page).toHaveTitle(/Library/i)
  })
})

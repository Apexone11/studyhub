/**
 * E2E tests for /library (BookHub).
 *
 * Covers the Google-Books-powered discovery surface:
 *   - popular books render on initial load
 *   - typed search hits /api/library/search with the query
 *   - clicking a BookCard navigates to /library/:volumeId
 *   - empty state appears when the API returns zero results
 *
 * Full rewrite 2026-04-23 per the tech-debt handoff. The previous file was
 * authored against a /api/library/books endpoint that no longer exists and
 * used data-testid selectors that the real BookCard / LibraryPage don't
 * emit. This spec targets the actual current markup:
 *   - search input: placeholder "Search books by title, author..."
 *   - book cards: <a class="book-card" href="/library/<volumeId>">
 *   - empty copy: "No books found"
 */

import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

function makeVolume(overrides = {}) {
  return {
    volumeId: 'vol-1',
    title: 'Introduction to Algorithms',
    authors: ['Thomas Cormen'],
    publishedDate: '2022',
    description: 'A classic CS textbook on algorithm design and analysis.',
    pageCount: 1312,
    categories: ['Computers'],
    thumbnail: null,
    previewLink: null,
    infoLink: null,
    downloadable: false,
    ...overrides,
  }
}

test.describe('Library Page @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
  })

  test('popular books render on initial load', async ({ page }) => {
    await mockAuthenticatedApp(page, {
      user: createSessionUser({ username: 'library_reader_1' }),
    })
    await page.route('**/api/library/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          books: [
            makeVolume({ volumeId: 'vol-1', title: 'Introduction to Algorithms' }),
            makeVolume({
              volumeId: 'vol-2',
              title: 'Structure and Interpretation of Computer Programs',
            }),
          ],
          total: 2,
        }),
      }),
    )

    await page.goto('/library')

    await expect(page.getByText('Introduction to Algorithms')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Structure and Interpretation of Computer Programs')).toBeVisible()
  })

  test('typed search hits /api/library/search with the query', async ({ page }) => {
    await mockAuthenticatedApp(page, {
      user: createSessionUser({ username: 'library_searcher' }),
    })

    let searchedFor = ''
    await page.route('**/api/library/search**', (route) => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('q') || ''
      if (q) searchedFor = q
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          books: q
            ? [makeVolume({ volumeId: 'vol-bio', title: 'Campbell Biology' })]
            : [makeVolume({ volumeId: 'vol-default', title: 'Default Popular Book' })],
          total: q ? 1 : 1,
        }),
      })
    })

    await page.goto('/library')

    const searchInput = page.getByPlaceholder(/search books by title, author/i)
    await searchInput.fill('biology')
    await searchInput.press('Enter')

    await expect(page.getByText('Campbell Biology')).toBeVisible({ timeout: 10000 })
    expect(searchedFor.toLowerCase()).toContain('biology')
  })

  test('clicking a book card navigates to /library/:volumeId', async ({ page }) => {
    await mockAuthenticatedApp(page, {
      user: createSessionUser({ username: 'library_navigator' }),
    })
    await page.route('**/api/library/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          books: [makeVolume({ volumeId: 'nav-target', title: 'Crime and Punishment' })],
          total: 1,
        }),
      }),
    )
    // Detail page also fetches; give it something sensible.
    await page.route('**/api/library/books/nav-target', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeVolume({ volumeId: 'nav-target', title: 'Crime and Punishment' })),
      }),
    )

    await page.goto('/library')
    await page.getByText('Crime and Punishment').first().click()
    await expect(page).toHaveURL(/\/library\/nav-target$/)
  })

  test('empty state appears when the API returns zero results', async ({ page }) => {
    await mockAuthenticatedApp(page, {
      user: createSessionUser({ username: 'library_empty' }),
    })
    await page.route('**/api/library/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ books: [], total: 0 }),
      }),
    )

    await page.goto('/library')
    await expect(page.getByText(/No books found/i)).toBeVisible({ timeout: 10000 })
  })
})

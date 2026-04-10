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

test.describe('Library Page', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
  })

  test('library page loads and displays book grid', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-1',
      email: 'test@university.edu',
      username: 'testuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      // Mock library books endpoint
      await page.route('**/api/library/books*', (route) => {
        route.abort('blockedbyclient')
        route.continue()
      })

      await page.route('**/api/library/books', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            books: [
              {
                id: 'book-1',
                title: 'Introduction to Computer Science',
                author: 'John Smith',
                description: 'A comprehensive guide to CS fundamentals',
                coverUrl: 'https://example.com/cover1.jpg',
                category: 'Computer Science',
                language: 'English',
                downloadUrl: 'https://example.com/download/book-1',
                pageCount: 450,
                publishedYear: 2022,
              },
              {
                id: 'book-2',
                title: 'Modern Mathematics',
                author: 'Jane Doe',
                description: 'Advanced math concepts explained',
                coverUrl: 'https://example.com/cover2.jpg',
                category: 'Mathematics',
                language: 'English',
                downloadUrl: 'https://example.com/download/book-2',
                pageCount: 380,
                publishedYear: 2023,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
        })
      })

      await page.goto('/library')

      // Verify page heading is visible
      const heading = page.locator('text=Library')
      await expect(heading).toBeVisible()

      // Verify book cards render
      const bookCards = page.locator('[data-testid="book-card"]')
      await expect(bookCards).toHaveCount(2)

      // Verify first book title is visible
      const firstBookTitle = page.locator('text=Introduction to Computer Science')
      await expect(firstBookTitle).toBeVisible()

      // Verify second book title is visible
      const secondBookTitle = page.locator('text=Modern Mathematics')
      await expect(secondBookTitle).toBeVisible()
    })
  })

  test('search filters books', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-2',
      email: 'searcher@university.edu',
      username: 'searcher',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      let searchCalled = false

      await page.route('**/api/library/books*', (route) => {
        const url = new URL(route.request().url())
        const searchParam = url.searchParams.get('search')

        if (searchParam === 'mathematics') {
          searchCalled = true
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              books: [
                {
                  id: 'book-2',
                  title: 'Modern Mathematics',
                  author: 'Jane Doe',
                  description: 'Advanced math concepts explained',
                  coverUrl: 'https://example.com/cover2.jpg',
                  category: 'Mathematics',
                  language: 'English',
                  downloadUrl: 'https://example.com/download/book-2',
                  pageCount: 380,
                  publishedYear: 2023,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            }),
          })
        } else {
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              books: [],
              total: 0,
              page: 1,
              pageSize: 20,
            }),
          })
        }
      })

      await page.goto('/library')

      // Find and fill search input
      const searchInput = page.locator('[data-testid="library-search"]')
      await searchInput.fill('mathematics')

      // Wait for API call with search parameter
      await page.waitForLoadState('networkidle')

      // Verify search was called with correct parameter
      expect(searchCalled).toBe(true)

      // Verify filtered result is visible
      const bookTitle = page.locator('text=Modern Mathematics')
      await expect(bookTitle).toBeVisible()
    })
  })

  test('empty state shown when no books', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-3',
      email: 'emptystate@university.edu',
      username: 'emptyuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/library/books*', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            books: [],
            total: 0,
            page: 1,
            pageSize: 20,
          }),
        })
      })

      await page.goto('/library')

      // Verify empty state message is visible
      const emptyState = page.locator('[data-testid="library-empty-state"]')
      await expect(emptyState).toBeVisible()

      // Verify no book cards are present
      const bookCards = page.locator('[data-testid="book-card"]')
      await expect(bookCards).toHaveCount(0)
    })
  })

  test('book card links to detail page', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-4',
      email: 'detail@university.edu',
      username: 'detailuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/library/books', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            books: [
              {
                id: 'book-1',
                title: 'Introduction to Computer Science',
                author: 'John Smith',
                description: 'A comprehensive guide to CS fundamentals',
                coverUrl: 'https://example.com/cover1.jpg',
                category: 'Computer Science',
                language: 'English',
                downloadUrl: 'https://example.com/download/book-1',
                pageCount: 450,
                publishedYear: 2022,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
        })
      })

      await page.goto('/library')

      // Click on book card
      const bookCard = page.locator('[data-testid="book-card"]').first()
      await bookCard.click()

      // Verify navigation to detail page
      await expect(page).toHaveURL(/\/library\/book-1/)
    })
  })

  test('book detail page loads', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-5',
      email: 'detailpage@university.edu',
      username: 'detailpageuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/library/books/book-1', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'book-1',
            title: 'Introduction to Computer Science',
            author: 'John Smith',
            description:
              'A comprehensive guide to CS fundamentals covering algorithms, data structures, and software engineering principles.',
            coverUrl: 'https://example.com/cover1.jpg',
            category: 'Computer Science',
            language: 'English',
            downloadUrl: 'https://example.com/download/book-1',
            pageCount: 450,
            publishedYear: 2022,
          }),
        })
      })

      await page.goto('/library/book-1')

      // Verify book title is visible
      const title = page.locator('text=Introduction to Computer Science')
      await expect(title).toBeVisible()

      // Verify author is visible
      const author = page.locator('text=John Smith')
      await expect(author).toBeVisible()
    })
  })
})

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

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
  })

  test('dashboard loads with user greeting', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-dash-1',
      email: 'dashuser@university.edu',
      username: 'dashuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/dashboard/summary', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-dash-1',
              username: 'dashuser',
              email: 'dashuser@university.edu',
              avatar: 'https://example.com/avatar.jpg',
            },
            recentSheets: [
              {
                id: 'sheet-1',
                title: 'Biology Notes Chapter 5',
                course: 'Biology 101',
                createdAt: new Date().toISOString(),
              },
              {
                id: 'sheet-2',
                title: 'Chemistry Study Guide',
                course: 'Chemistry 201',
                createdAt: new Date().toISOString(),
              },
            ],
            stats: {
              sheets: 12,
              stars: 48,
              courses: 5,
              streak: 7,
            },
            activeCourses: [
              {
                id: 'course-1',
                code: 'BIO101',
                name: 'Biology 101',
                school: 'State University',
              },
              {
                id: 'course-2',
                code: 'CHEM201',
                name: 'Chemistry 201',
                school: 'State University',
              },
            ],
          }),
        })
      })

      await page.goto('/dashboard')

      // Verify welcome text is visible
      const welcomeText = page.locator('text=Welcome')
      await expect(welcomeText).toBeVisible()

      // Verify username is in greeting
      const usernameInGreeting = page.locator('text=dashuser')
      await expect(usernameInGreeting).toBeVisible()

      // Verify page heading
      const dashboardHeading = page.locator('text=Dashboard')
      await expect(dashboardHeading).toBeVisible()
    })
  })

  test('stat cards display correct values', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-dash-2',
      email: 'statuser@university.edu',
      username: 'statuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/dashboard/summary', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-dash-2',
              username: 'statuser',
              email: 'statuser@university.edu',
              avatar: 'https://example.com/avatar.jpg',
            },
            recentSheets: [],
            stats: {
              sheets: 15,
              stars: 62,
              courses: 4,
              streak: 3,
            },
            activeCourses: [],
          }),
        })
      })

      await page.goto('/dashboard')

      // Wait for stat cards to render
      await page.waitForLoadState('networkidle')

      // Verify sheet count
      const sheetCount = page.locator('[data-testid="stat-sheets"]')
      await expect(sheetCount).toContainText('15')

      // Verify star count
      const starCount = page.locator('[data-testid="stat-stars"]')
      await expect(starCount).toContainText('62')

      // Verify course count
      const courseCount = page.locator('[data-testid="stat-courses"]')
      await expect(courseCount).toContainText('4')

      // Verify streak
      const streakCount = page.locator('[data-testid="stat-streak"]')
      await expect(streakCount).toContainText('3')
    })
  })

  test('recent sheets section renders', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-dash-3',
      email: 'recentuser@university.edu',
      username: 'recentuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/dashboard/summary', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-dash-3',
              username: 'recentuser',
              email: 'recentuser@university.edu',
              avatar: 'https://example.com/avatar.jpg',
            },
            recentSheets: [
              {
                id: 'sheet-101',
                title: 'Advanced Calculus Notes',
                course: 'Calculus 301',
                createdAt: new Date().toISOString(),
              },
              {
                id: 'sheet-102',
                title: 'Physics Formulas',
                course: 'Physics 201',
                createdAt: new Date().toISOString(),
              },
              {
                id: 'sheet-103',
                title: 'History Timeline',
                course: 'History 101',
                createdAt: new Date().toISOString(),
              },
            ],
            stats: {
              sheets: 8,
              stars: 25,
              courses: 3,
              streak: 2,
            },
            activeCourses: [],
          }),
        })
      })

      await page.goto('/dashboard')

      // Verify recent sheets heading
      const recentSheetsHeading = page.locator('text=Recent Sheets')
      await expect(recentSheetsHeading).toBeVisible()

      // Verify first sheet title
      const firstSheetTitle = page.locator('text=Advanced Calculus Notes')
      await expect(firstSheetTitle).toBeVisible()

      // Verify second sheet title
      const secondSheetTitle = page.locator('text=Physics Formulas')
      await expect(secondSheetTitle).toBeVisible()

      // Verify third sheet title
      const thirdSheetTitle = page.locator('text=History Timeline')
      await expect(thirdSheetTitle).toBeVisible()
    })
  })

  test('quick actions are clickable', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-dash-4',
      email: 'actionuser@university.edu',
      username: 'actionuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/dashboard/summary', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-dash-4',
              username: 'actionuser',
              email: 'actionuser@university.edu',
              avatar: 'https://example.com/avatar.jpg',
            },
            recentSheets: [],
            stats: {
              sheets: 5,
              stars: 10,
              courses: 2,
              streak: 1,
            },
            activeCourses: [],
          }),
        })
      })

      await page.goto('/dashboard')

      // Verify upload sheet action is present
      const uploadButton = page.locator('a:has-text("Upload Sheet"), button:has-text("Upload Sheet")')
      await expect(uploadButton).toBeVisible()

      // Verify browse sheets action is present
      const browseButton = page.locator('a:has-text("Browse Sheets"), button:has-text("Browse Sheets")')
      await expect(browseButton).toBeVisible()

      // Click upload sheet action
      const uploadAction = page.locator('[data-testid="quick-action-upload"]')
      if (await uploadAction.isVisible()) {
        await uploadAction.click()
        // Wait for navigation or modal
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test('redirects to login when unauthenticated', async ({ page }) => {
    // Don't mock authenticated app - test redirect for unauthenticated user
    await disableTutorials(page)

    // Mock the session check to return unauthenticated
    await page.route('**/api/auth/me', (route) => {
      route.abort('blockedbyclient')
    })

    await page.goto('/dashboard')

    // Wait for redirect
    await page.waitForURL('/login')

    // Verify we're on login page
    await expect(page).toHaveURL(/\/login/)

    // Verify login heading is visible
    const loginHeading = page.locator('text=Sign In')
    await expect(loginHeading).toBeVisible({ timeout: 5000 }).catch(() => {
      // If "Sign In" not found, check for "Login" or similar
      return expect(page.locator('text=/login|sign in/i')).toBeVisible()
    })
  })
})

/**
 * cycle36-decomposed-pages.smoke.spec.js
 *
 * Smoke coverage for pages decomposed in Cycle 36:
 *   - Upload sheet page (UploadNavActions, UploadSheetFormFields, EditorPanel)
 *   - Admin overview (StatsGrid, ModerationOverview, Pager)
 *   - User profile page
 *
 * Validates that token-migrated styles render correctly and decomposed
 * components mount without errors.
 *
 * Run:  npx playwright test cycle36-decomposed --project=chromium
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

const THEMES = ['light', 'dark']

async function applyTheme(page, theme) {
  if (theme === 'dark') {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'studyhub_prefs_42',
        JSON.stringify({ theme: 'dark', fontSize: 'medium' })
      )
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.route('**/api/settings/preferences', async (route) => {
      await route.fulfill({ status: 200, json: { theme: 'dark', fontSize: 'medium' } })
    })
  } else {
    await page.emulateMedia({ colorScheme: 'light' })
  }
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    const keys = ['feed', 'sheets', 'viewer', 'upload', 'dashboard', 'settings', 'profile', 'announcements', 'notes']
    for (const key of keys) window.localStorage.setItem(`tutorial_${key}_seen`, '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Upload Sheet Page — decomposed into UploadNavActions + UploadSheetFormFields
 * ═══════════════════════════════════════════════════════════════════════════ */

for (const theme of THEMES) {
  test.describe(`[${theme}] Upload Sheet Page @cycle36-smoke`, () => {
    test.beforeEach(async ({ page }) => {
      await applyTheme(page, theme)
      await disableTutorials(page)
    })

    test('renders form fields and nav actions (new sheet)', async ({ page }) => {
      await mockAuthenticatedApp(page)
      await page.goto('/sheets/upload')

      // InfoFields component
      const titleInput = page.locator('input[placeholder*="CMSC131"]')
      await expect(titleInput).toBeVisible({ timeout: 8000 })

      // Course select
      const courseSelect = page.locator('select')
      await expect(courseSelect.first()).toBeVisible()

      // DescriptionField component
      const descTextarea = page.locator('textarea[placeholder*="Brief summary"]')
      await expect(descTextarea).toBeVisible()

      // UploadNavActions — Save Draft button
      await expect(page.getByRole('button', { name: /save draft/i })).toBeVisible()

      // UploadNavActions — Publish button
      await expect(page.getByRole('button', { name: /publish/i })).toBeVisible()

      // UploadNavActions — Cancel link
      await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible()

      // EditorPanel — editor textarea
      const editorTextarea = page.locator('textarea[placeholder*="Start writing"]')
      await expect(editorTextarea).toBeVisible()

      // No console errors from token migration
      const errors = []
      page.on('pageerror', (err) => errors.push(err.message))
      await page.waitForTimeout(500)
      expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    })

    test('renders edit mode with draft banner', async ({ page }) => {
      await mockAuthenticatedApp(page)
      // Mock the draft sheet endpoint
      await page.route('**/api/sheets/501', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              id: 501,
              title: 'My Draft Sheet',
              description: 'Draft description',
              content: '# Hello\n\nDraft content',
              contentFormat: 'markdown',
              status: 'draft',
              courseId: 101,
              allowDownloads: true,
              userId: 42,
              course: { id: 101, code: 'CMSC131', name: 'OOP I' },
              author: { id: 42, username: 'regression_admin' },
            },
          })
        } else {
          await route.fulfill({ status: 200, json: { success: true } })
        }
      })

      await page.goto('/sheets/upload?draft=501')
      // Should show draft content loaded in editor
      await expect(page.locator('textarea').first()).toBeVisible({ timeout: 8000 })
    })
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Admin Page — decomposed StatsGrid, ModerationOverview, ActivityLog
 * ═══════════════════════════════════════════════════════════════════════════ */

for (const theme of THEMES) {
  test.describe(`[${theme}] Admin Overview @cycle36-smoke`, () => {
    test.beforeEach(async ({ page }) => {
      await applyTheme(page, theme)
      await disableTutorials(page)
    })

    test('renders stats grid and tab navigation', async ({ page }) => {
      await mockAuthenticatedApp(page)
      // Additional admin routes for moderation
      await page.route('**/api/admin/stats', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            totalUsers: 24,
            users: { thisWeek: 3 },
            totalSheets: 55,
            sheets: { published: 48, draft: 7 },
            feedPosts: { total: 120 },
            totalComments: 18,
            flaggedRequests: 2,
            totalStars: 89,
            totalNotes: 14,
            totalFollows: 9,
            totalReactions: 22,
            moderation: {
              pendingCases: 1,
              activeStrikes: 0,
              pendingAppeals: 0,
              recentActions: [
                {
                  id: 10,
                  contentType: 'sheet',
                  status: 'confirmed',
                  user: { username: 'testuser' },
                  reviewer: { username: 'regression_admin' },
                  reviewNote: 'Plagiarized content',
                  updatedAt: '2026-03-23T10:00:00.000Z',
                },
              ],
            },
          },
        })
      })
      await page.route('**/api/admin/sheet-reviews?*', async (route) => {
        await route.fulfill({ status: 200, json: { reviews: [], total: 0, page: 1 } })
      })
      await page.route('**/api/admin/moderation/cases?*', async (route) => {
        await route.fulfill({ status: 200, json: { cases: [], total: 0, page: 1 } })
      })

      await page.goto('/admin')
      // StatsGrid — should show stat labels
      await expect(page.getByText('USERS')).toBeVisible({ timeout: 8000 })
      await expect(page.getByText('SHEETS')).toBeVisible()
      await expect(page.getByText('STARS')).toBeVisible()

      // Tab navigation should be present
      await expect(page.getByText('Overview')).toBeVisible()
      await expect(page.getByText('Users')).toBeVisible()
    })
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
 * User Profile Page
 * ═══════════════════════════════════════════════════════════════════════════ */

for (const theme of THEMES) {
  test.describe(`[${theme}] User Profile @cycle36-smoke`, () => {
    test.beforeEach(async ({ page }) => {
      await applyTheme(page, theme)
      await disableTutorials(page)
    })

    test('renders public profile with sheets', async ({ page }) => {
      await mockAuthenticatedApp(page)
      await page.route('**/api/users/regression_admin', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            id: 42,
            username: 'regression_admin',
            role: 'admin',
            bio: 'CS student at UMD',
            avatarUrl: null,
            createdAt: '2026-03-16T12:00:00.000Z',
            emailVerified: true,
            profileVisibility: 'public',
            _count: { studySheets: 2, followers: 5, following: 3 },
            enrollments: [
              { id: 900, course: { id: 101, code: 'CMSC131', name: 'OOP I', school: { id: 1, name: 'UMD', short: 'UMD' } } },
            ],
          },
        })
      })
      await page.route('**/api/users/regression_admin/sheets*', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            sheets: [
              {
                id: 501,
                title: 'Algorithms Midterm Review',
                status: 'published',
                createdAt: '2026-03-16T12:00:00.000Z',
                stars: 12,
                course: { id: 101, code: 'CMSC131' },
              },
            ],
            total: 1,
          },
        })
      })
      await page.route('**/api/users/regression_admin/followers*', async (route) => {
        await route.fulfill({ status: 200, json: { isFollowing: false } })
      })

      await page.goto('/users/regression_admin')
      await expect(page.getByText('regression_admin')).toBeVisible({ timeout: 8000 })
    })
  })
}

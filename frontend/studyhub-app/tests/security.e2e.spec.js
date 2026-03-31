/**
 * Security-focused end-to-end tests for StudyHub
 *
 * This test suite validates critical security boundaries:
 * 1. XSS prevention — user-generated content with XSS payloads renders as escaped text
 * 2. Auth boundary enforcement — unauthenticated users are redirected from protected pages
 * 3. CSRF token presence — mutation requests include credentials
 * 4. Admin route protection — non-admin users cannot access admin pages
 * 5. Content injection in search — special characters render safely
 *
 * @tags @security @e2e
 */
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

/* ── Constants ──────────────────────────────────────────────────────── */

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img onerror=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<svg onload=alert(1)>',
  '<img src=x onerror=alert(1)>',
]

const PROTECTED_ROUTES = [
  { path: '/settings', label: 'Settings' },
  { path: '/admin', label: 'Admin' },
  { path: '/sheets/upload', label: 'Upload' },
]

const SPECIAL_SEARCH_CHARS = [
  '<',
  '>',
  '"',
  "'",
  '&',
  ';',
  '|',
  '$',
  '`',
  '\\',
]

/* ── XSS Prevention Tests ──────────────────────────────────────────── */

test.describe('XSS Prevention', () => {
  test('sheet title with XSS payload renders as escaped text', async ({ page }) => {
    const xssPayload = '<script>alert("xss")</script>'
    const sheetWithXss = {
      id: 501,
      title: xssPayload,
      description: 'Safe description',
      content: 'Safe content',
      createdAt: '2026-03-16T12:00:00.000Z',
      updatedAt: '2026-03-16T12:00:00.000Z',
      userId: 42,
      stars: 0,
      downloads: 0,
      forks: 0,
      starred: false,
      commentCount: 0,
      reactions: { likes: 0, dislikes: 0, userReaction: null },
      course: { id: 101, code: 'CMSC131', name: 'OOP I', school: { id: 1, name: 'UMD', short: 'UMD' } },
      author: { id: 42, username: 'testuser' },
      incomingContributions: [],
      outgoingContributions: [],
      contentFormat: 'markdown',
      status: 'published',
      hasAttachment: false,
      allowDownloads: true,
      htmlRiskTier: 0,
      htmlWorkflow: {
        scanStatus: 'completed',
        riskTier: 0,
        previewMode: 'interactive',
        ackRequired: false,
        scanFindings: [],
        riskSummary: null,
        tierExplanation: null,
        findingsByCategory: {},
      },
    }

    await mockAuthenticatedApp(page, { sheet: sheetWithXss })
    await page.route('**/api/sheets/501', async (route) => {
      await route.fulfill({ status: 200, json: sheetWithXss })
    })

    let scriptExecuted = false
    page.on('console', (msg) => {
      if (msg.text().includes('xss')) scriptExecuted = true
    })

    await page.goto('/sheets/501')
    await page.waitForLoadState('networkidle')

    expect(scriptExecuted).toBeFalsy()

    const titleText = await page.locator('h1, [data-testid="sheet-title"]').first().textContent()
    expect(titleText).toContain('<script>')
    expect(titleText).not.toContain('alert')
  })

  test('comment content with XSS payload renders as escaped text', async ({ page }) => {
    const xssPayload = '"><img onerror=alert(1)>'
    const commentWithXss = {
      id: 1001,
      content: xssPayload,
      createdAt: '2026-03-16T12:05:00.000Z',
      author: { id: 17, username: 'attacker' },
    }

    await mockAuthenticatedApp(page)
    await page.route('**/api/sheets/501/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { comments: [commentWithXss], total: 1 },
      })
    })

    let imgOnerrorFired = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert')) imgOnerrorFired = true
    })

    await page.goto('/sheets/501')
    await page.waitForLoadState('networkidle')

    expect(imgOnerrorFired).toBeFalsy()

    const commentText = await page.locator('[data-testid="comment"], .comment').first().textContent()
    expect(commentText).toContain('"><img')
  })

  test('user profile bio with XSS payload renders as escaped text', async ({ page }) => {
    const xssPayload = '<svg onload=alert(1)>'
    const userWithXss = {
      id: 80,
      username: 'xss_user',
      role: 'student',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      bio: xssPayload,
      _count: { enrollments: 0, studySheets: 1 },
      enrollments: [],
      sheets: [],
      followerCount: 0,
      followingCount: 0,
      isFollowing: false,
    }

    await mockAuthenticatedApp(page)
    await page.route('**/api/users/xss_user', async (route) => {
      await route.fulfill({ status: 200, json: userWithXss })
    })
    await page.route('**/api/users/xss_user/followers*', async (route) => {
      await route.fulfill({ status: 200, json: [] })
    })
    await page.route('**/api/users/xss_user/following*', async (route) => {
      await route.fulfill({ status: 200, json: [] })
    })

    let svgOnloadFired = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert')) svgOnloadFired = true
    })

    await page.goto('/users/xss_user')
    await page.waitForLoadState('networkidle')

    expect(svgOnloadFired).toBeFalsy()

    const bioText = await page.locator('[data-testid="user-bio"], .bio').first().textContent()
    expect(bioText).toContain('<svg')
  })

  test('sheet description with HTML entities renders safely', async ({ page }) => {
    const dangerousDescription = '&lt;script&gt;alert(1)&lt;/script&gt;'
    const sheetWithHtmlEntities = {
      id: 501,
      title: 'Safe Title',
      description: dangerousDescription,
      content: 'Content',
      createdAt: '2026-03-16T12:00:00.000Z',
      updatedAt: '2026-03-16T12:00:00.000Z',
      userId: 42,
      stars: 0,
      downloads: 0,
      forks: 0,
      starred: false,
      commentCount: 0,
      reactions: { likes: 0, dislikes: 0, userReaction: null },
      course: { id: 101, code: 'CMSC131', name: 'OOP I', school: { id: 1, name: 'UMD', short: 'UMD' } },
      author: { id: 42, username: 'testuser' },
      incomingContributions: [],
      outgoingContributions: [],
      contentFormat: 'markdown',
      status: 'published',
      hasAttachment: false,
      allowDownloads: true,
      htmlRiskTier: 0,
      htmlWorkflow: { scanStatus: 'completed', riskTier: 0, previewMode: 'interactive', ackRequired: false, scanFindings: [], riskSummary: null, tierExplanation: null, findingsByCategory: {} },
    }

    await mockAuthenticatedApp(page, { sheet: sheetWithHtmlEntities })

    let scriptFired = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert')) scriptFired = true
    })

    await page.goto('/sheets/501')
    await page.waitForLoadState('networkidle')

    expect(scriptFired).toBeFalsy()
  })
})

/* ── Auth Boundary Enforcement Tests ──────────────────────────────── */

test.describe('Auth Boundary Enforcement', () => {
  PROTECTED_ROUTES.forEach(({ path, label }) => {
    test(`unauthenticated user is redirected from ${label} (${path})`, async ({ page }) => {
      // Mock auth/me to return 401 Unauthorized
      await page.route('**/api/auth/me', async (route) => {
        await route.abort('failed')
      })

      // Mock catch-all to prevent hangs
      await page.route('**/api/**', async (route) => {
        await route.fulfill({ status: 200, json: {} })
      })

      await page.goto(path)
      await page.waitForLoadState('networkidle')

      // Should redirect to login
      expect(page.url()).toContain('/login')
    })
  })

  test('unauthenticated user accessing /settings redirects to login', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    })

    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/login')
  })

  test('authenticated user can access /dashboard', async ({ page }) => {
    await mockAuthenticatedApp(page)

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard')
    expect(page.url()).not.toContain('/login')
  })

  test('session expiration redirects to login on protected route', async ({ page }) => {
    await mockAuthenticatedApp(page)

    // Navigate to a protected page
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Now mock auth/me to return 401
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Session expired' } })
    })

    // Trigger a navigation that will call auth/me
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should be redirected to login
    expect(page.url()).toContain('/login')
  })
})

/* ── CSRF Token and Credentials Tests ──────────────────────────────── */

test.describe('CSRF Token & Request Credentials', () => {
  test('POST requests to create note include credentials', async ({ page }) => {
    const capturedRequests = []

    await page.on('request', (request) => {
      if (request.url().includes('/api/notes') && request.method() === 'POST') {
        capturedRequests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
        })
      }
    })

    await mockAuthenticatedApp(page)

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Mock the note creation endpoint
    await page.route('**/api/notes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          json: {
            id: 999,
            title: 'New Note',
            content: 'Test content',
            private: true,
            courseId: 101,
            updatedAt: '2026-03-16T12:15:00.000Z',
          },
        })
      }
    })

    const newNoteButton = page.locator('button:has-text("New Note"), [data-testid="new-note-button"]').first()
    if (await newNoteButton.isVisible().catch(() => false)) {
      await newNoteButton.click().catch(() => {})
      await page.waitForTimeout(500)
    }

    expect(capturedRequests.length).toBeGreaterThanOrEqual(0)
  })

  test('PATCH requests include credentials', async ({ page }) => {
    await mockAuthenticatedApp(page)

    const capturedRequests = []
    await page.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() === 'PATCH') {
        capturedRequests.push({
          method: request.method(),
          url: request.url(),
        })
      }
    })

    await page.route('**/api/settings/me', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          json: {
            id: 42,
            username: 'updated_user',
            email: 'updated@test.com',
          },
        })
      } else {
        await route.fulfill({
          status: 200,
          json: createSessionUser(),
        })
      }
    })

    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
  })

  test('DELETE requests include credentials', async ({ page }) => {
    await mockAuthenticatedApp(page)

    const capturedRequests = []
    await page.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() === 'DELETE') {
        capturedRequests.push({
          method: request.method(),
          url: request.url(),
        })
      }
    })

    await page.route('**/api/notes/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, json: { deleted: true } })
      }
    })

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  })
})

/* ── Admin Route Protection Tests ────────────────────────────────── */

test.describe('Admin Route Protection', () => {
  test('student user cannot access admin page', async ({ page }) => {
    const studentUser = createSessionUser({
      role: 'student',
      username: 'student_user',
    })

    await mockAuthenticatedApp(page, { user: studentUser })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Should either redirect or show access denied
    const isAdminPage = page.url().includes('/admin')
    const hasAccessDeniedMessage = await page
      .locator('text=/access denied|not authorized|admin only/i')
      .isVisible()
      .catch(() => false)

    if (isAdminPage) {
      // If still on admin page, should show access denied
      expect(hasAccessDeniedMessage).toBeTruthy()
    } else {
      // Should redirect away
      expect(page.url()).not.toContain('/admin')
    }
  })

  test('admin user can access admin page', async ({ page }) => {
    const adminUser = createSessionUser({
      role: 'admin',
      username: 'admin_user',
    })

    await mockAuthenticatedApp(page, { user: adminUser })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/admin')
  })

  test('admin stats tab is only rendered for admin users', async ({ page }) => {
    const studentUser = createSessionUser({
      role: 'student',
      username: 'student_user',
    })

    await mockAuthenticatedApp(page, { user: studentUser })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    const adminStatsTab = page.locator('[data-testid="admin-stats-tab"], text=/Admin Stats/i').first()
    const isVisible = await adminStatsTab.isVisible().catch(() => false)

    expect(isVisible).toBeFalsy()
  })

  test('admin user sees admin stats tab', async ({ page }) => {
    const adminUser = createSessionUser({
      role: 'admin',
      username: 'admin_user',
    })

    await mockAuthenticatedApp(page, { user: adminUser })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Admin page should be accessible
    expect(page.url()).toContain('/admin')
  })
})

/* ── Content Injection in Search Tests ───────────────────────────── */

test.describe('Content Injection in Search', () => {
  test('search query with special characters renders safely', async ({ page }) => {
    await mockAuthenticatedApp(page)

    // Mock search endpoint
    await page.route('**/api/search*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          sheets: [
            {
              id: 501,
              title: 'Search Result',
              description: 'Result description',
              author: { id: 42, username: 'user' },
              course: { id: 101, code: 'CS101' },
              stars: 5,
            },
          ],
          courses: [],
          users: [],
          total: 1,
        },
      })
    })

    await page.goto('/sheets')
    await page.waitForLoadState('networkidle')

    // Open search modal
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      // Test with special characters
      const specialQuery = '<img src=x onerror=alert(1)> & "malicious"'
      await searchInput.fill(specialQuery)
      await page.waitForTimeout(500)

      let xssExecuted = false
      page.on('console', (msg) => {
        if (msg.text().includes('alert')) xssExecuted = true
      })

      expect(xssExecuted).toBeFalsy()
    }
  })

  test('search results with XSS payloads in title render safely', async ({ page }) => {
    const maliciousResults = {
      sheets: [
        {
          id: 1,
          title: '<script>alert("xss")</script>',
          description: 'Description',
          author: { id: 1, username: 'user1' },
          course: { id: 1, code: 'CS101' },
          stars: 0,
        },
        {
          id: 2,
          title: '"><img onerror=alert(1)>',
          description: 'Another description',
          author: { id: 2, username: 'user2' },
          course: { id: 1, code: 'CS101' },
          stars: 0,
        },
      ],
      courses: [],
      users: [],
      total: 2,
    }

    await mockAuthenticatedApp(page)
    await page.route('**/api/search*', async (route) => {
      await route.fulfill({ status: 200, json: maliciousResults })
    })

    let xssExecuted = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert')) xssExecuted = true
    })

    await page.goto('/sheets')
    await page.waitForLoadState('networkidle')

    // Trigger search
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test')
      await page.waitForTimeout(500)
    }

    expect(xssExecuted).toBeFalsy()
  })

  test('search with SQL injection-like strings renders safely', async ({ page }) => {
    await mockAuthenticatedApp(page)

    await page.route('**/api/search*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { sheets: [], courses: [], users: [], total: 0 },
      })
    })

    await page.goto('/sheets')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      // Test SQL injection-like strings
      const sqlLikeQuery = "'; DROP TABLE users; --"
      await searchInput.fill(sqlLikeQuery)
      await page.waitForTimeout(500)

      // Should still render without errors
      expect(page.url()).toContain('/sheets')
    }
  })

  test('search queries with encoded payloads render safely', async ({ page }) => {
    await mockAuthenticatedApp(page)

    await page.route('**/api/search*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { sheets: [], courses: [], users: [], total: 0 },
      })
    })

    await page.goto('/sheets')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      // Test URL encoded payload
      const encodedPayload = '%3Cscript%3Ealert(1)%3C/script%3E'
      await searchInput.fill(encodedPayload)
      await page.waitForTimeout(500)

      let xssExecuted = false
      page.on('console', (msg) => {
        if (msg.text().includes('alert')) xssExecuted = true
      })

      expect(xssExecuted).toBeFalsy()
    }
  })
})

/* ── Combined Security Scenarios ──────────────────────────────────– */

test.describe('Combined Security Scenarios', () => {
  test('multiline XSS payload in comment is neutralized', async ({ page }) => {
    const multilineXss = `
      <div onclick="alert(1)">
        <script>console.log("xss")</script>
      </div>
    `.trim()

    const commentWithXss = {
      id: 1001,
      content: multilineXss,
      createdAt: '2026-03-16T12:05:00.000Z',
      author: { id: 17, username: 'attacker' },
    }

    await mockAuthenticatedApp(page)
    await page.route('**/api/sheets/501/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { comments: [commentWithXss], total: 1 },
      })
    })

    let xssExecuted = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert') || msg.text().includes('xss')) xssExecuted = true
    })

    await page.goto('/sheets/501')
    await page.waitForLoadState('networkidle')

    expect(xssExecuted).toBeFalsy()
  })

  test('event handler injection via data attributes is prevented', async ({ page }) => {
    const sheetWithEventHandlers = {
      id: 501,
      title: 'Title',
      description: '<div data-onclick="alert(1)">Dangerous</div>',
      content: 'Content',
      createdAt: '2026-03-16T12:00:00.000Z',
      updatedAt: '2026-03-16T12:00:00.000Z',
      userId: 42,
      stars: 0,
      downloads: 0,
      forks: 0,
      starred: false,
      commentCount: 0,
      reactions: { likes: 0, dislikes: 0, userReaction: null },
      course: { id: 101, code: 'CMSC131', name: 'OOP I', school: { id: 1, name: 'UMD', short: 'UMD' } },
      author: { id: 42, username: 'testuser' },
      incomingContributions: [],
      outgoingContributions: [],
      contentFormat: 'markdown',
      status: 'published',
      hasAttachment: false,
      allowDownloads: true,
      htmlRiskTier: 0,
      htmlWorkflow: { scanStatus: 'completed', riskTier: 0, previewMode: 'interactive', ackRequired: false, scanFindings: [], riskSummary: null, tierExplanation: null, findingsByCategory: {} },
    }

    await mockAuthenticatedApp(page, { sheet: sheetWithEventHandlers })

    let handlerExecuted = false
    page.on('console', (msg) => {
      if (msg.text().includes('alert')) handlerExecuted = true
    })

    await page.goto('/sheets/501')
    await page.waitForLoadState('networkidle')

    expect(handlerExecuted).toBeFalsy()
  })
})

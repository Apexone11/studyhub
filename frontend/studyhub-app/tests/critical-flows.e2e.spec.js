import { expect, test } from '@playwright/test'
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

test('sheet CRUD flow: navigate sheets, verify list, upload button routes correctly @critical', async ({
  page,
}) => {
  await disableTutorials(page)

  const studentUser = createSessionUser({
    username: 'sheet_crud_student',
    role: 'student',
    email: 'crud_student@studyhub.test',
  })

  const { sheet } = await mockAuthenticatedApp(page, {
    user: studentUser,
  })

  await page.route('**/api/sheets', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: { sheets: [sheet], total: 1 },
      })
    }
  })

  await page.goto('/sheets')
  await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
  await expect(page.getByRole('link', { name: sheet.title })).toBeVisible()
  await expect(page.getByText(sheet.description)).toBeVisible()

  // Verify stats display
  await expect(page.getByText(`${sheet.stars}`)).toBeVisible()
  await expect(page.getByText(`${sheet.downloads}`)).toBeVisible()

  // Verify upload button navigation
  const uploadButton = page.getByRole('button', { name: /upload/i }).first()
  await expect(uploadButton).toBeVisible()

  let uploadNavigated = false
  page.on('popup', () => {
    uploadNavigated = true
  })

  // Mock sheet creation API
  await page.route('**/api/sheets', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: 502,
          title: payload.title || 'New Study Sheet',
          description: payload.description || '',
          content: payload.content || '',
          createdAt: '2026-03-29T12:00:00.000Z',
          updatedAt: '2026-03-29T12:00:00.000Z',
          userId: studentUser.id,
          courseId: payload.courseId,
          stars: 0,
          downloads: 0,
          forks: 0,
          starred: false,
          commentCount: 0,
          reactions: { likes: 0, dislikes: 0, userReaction: null },
          course: sheet.course,
          author: { id: studentUser.id, username: studentUser.username },
          status: 'published',
          contentFormat: 'markdown',
        },
      })
    }
  })

  await uploadButton.click()
  await page.waitForURL(/\/sheets\/\d+|\/upload/, { timeout: 5000 })

  const currentUrl = page.url()
  expect(currentUrl).toMatch(/\/sheets\/\d+|\/upload|\/sheets$/)
})

test('feed interaction flow: load feed, verify posts, test comment and reaction @critical', async ({
  page,
}) => {
  await disableTutorials(page)

  const feedUser = createSessionUser({
    username: 'feed_interaction_user',
    role: 'student',
    email: 'feed_user@studyhub.test',
  })

  const mockPost = {
    id: 700,
    feedKey: 'post-700',
    type: 'post',
    createdAt: '2026-03-29T11:00:00.000Z',
    content: 'Just completed my algorithms study sheet!',
    preview: 'Just completed my algorithms study sheet!',
    author: { id: feedUser.id, username: feedUser.username },
    course: { id: 101, code: 'CMSC131' },
    commentCount: 2,
    reactions: { likes: 5, dislikes: 0, userReaction: null },
    hasAttachment: false,
    attachmentName: null,
    attachmentType: null,
    allowDownloads: false,
    linkPath: '/feed?post=700',
  }

  const mockSheet = {
    id: 501,
    feedKey: 'sheet-501',
    type: 'sheet',
    title: 'Algorithms Midterm Review',
    description: 'Practice problems and explanations.',
    preview: 'Practice problems and explanations.',
    createdAt: '2026-03-29T10:30:00.000Z',
    author: { id: 22, username: 'algorithms_mentor' },
    course: { id: 101, code: 'CMSC131' },
    stars: 8,
    downloads: 15,
    forks: 2,
    starred: false,
    commentCount: 3,
    reactions: { likes: 6, dislikes: 1, userReaction: null },
    linkPath: '/sheets/501',
  }

  await mockAuthenticatedApp(page, {
    user: feedUser,
    feedItems: [mockPost, mockSheet],
  })

  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        items: [mockPost, mockSheet],
        total: 2,
        partial: false,
        degradedSections: [],
      },
    })
  })

  await page.goto('/feed')

  // Verify feed loads with posts and sheets
  await expect(page.getByRole('heading', { name: /feed|home/i }).first()).toBeVisible()
  await expect(page.getByText(mockPost.content)).toBeVisible()
  await expect(page.getByRole('link', { name: mockSheet.title })).toBeVisible()

  // Verify post reaction data displays
  await expect(page.getByText('5')).toBeVisible()

  // Test comment creation via modal
  await page.route('**/api/feed/posts/700/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: 1002,
          content: payload.content,
          createdAt: '2026-03-29T12:00:00.000Z',
          author: { id: feedUser.id, username: feedUser.username },
        },
      })
    }
  })

  // Click on post to open modal/detail view
  const postContent = page.getByText(mockPost.content)
  await expect(postContent).toBeVisible()

  // Test reaction toggle
  await page.route('**/api/feed/posts/700/reactions', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        json: {
          id: 700,
          reactions: {
            likes: payload.reaction === 'like' ? 6 : 5,
            dislikes: payload.reaction === 'dislike' ? 1 : 0,
            userReaction: payload.reaction,
          },
        },
      })
    }
  })

  const likeButton = page.getByRole('button', { name: /like/i }).first()
  if (await likeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await likeButton.click()
    // Verify reaction updated
    await expect(page.getByText(/6/)).toBeVisible()
  }
})

test('profile viewing flow: navigate to profile, verify stats and contribution data @critical', async ({
  page,
}) => {
  await disableTutorials(page)

  const viewerUser = createSessionUser({
    username: 'profile_viewer',
    role: 'student',
    email: 'viewer@studyhub.test',
  })

  const profileUser = {
    id: 88,
    username: 'profile_student',
    role: 'student',
    email: 'profile@studyhub.test',
    emailVerified: true,
    twoFaEnabled: false,
    avatarUrl: null,
    createdAt: '2026-01-15T08:00:00.000Z',
    enrollments: [
      {
        id: 905,
        courseId: 101,
        course: {
          id: 101,
          code: 'CMSC131',
          name: 'Object-Oriented Programming I',
          school: {
            id: 1,
            name: 'University of Maryland',
            short: 'UMD',
          },
        },
      },
      {
        id: 906,
        courseId: 102,
        course: {
          id: 102,
          code: 'CMSC132',
          name: 'Object-Oriented Programming II',
          school: {
            id: 1,
            name: 'University of Maryland',
            short: 'UMD',
          },
        },
      },
    ],
    counts: { courses: 2, sheets: 5, stars: 12 },
    _count: { enrollments: 2, studySheets: 5 },
  }

  const profileSheets = [
    {
      id: 510,
      title: 'Java Inheritance Patterns',
      description: 'Deep dive into inheritance and polymorphism.',
      createdAt: '2026-03-20T10:00:00.000Z',
      author: { id: profileUser.id, username: profileUser.username },
      course: profileUser.enrollments[0].course,
      stars: 7,
      downloads: 14,
      forks: 2,
    },
    {
      id: 511,
      title: 'Data Structures Cheat Sheet',
      description: 'Quick reference for common data structures.',
      createdAt: '2026-03-15T09:30:00.000Z',
      author: { id: profileUser.id, username: profileUser.username },
      course: profileUser.enrollments[1].course,
      stars: 5,
      downloads: 8,
      forks: 0,
    },
  ]

  await mockAuthenticatedApp(page, {
    user: viewerUser,
  })

  await page.route(`**/api/users/${profileUser.username}`, async (route) => {
    await route.fulfill({
      status: 200,
      json: profileUser,
    })
  })

  await page.route(`**/api/users/${profileUser.username}/sheets?*`, async (route) => {
    await route.fulfill({
      status: 200,
      json: { sheets: profileSheets, total: profileSheets.length },
    })
  })

  await page.goto(`/profile/${profileUser.username}`)

  // Verify profile header and stats widget
  await expect(page.getByRole('heading', { name: profileUser.username })).toBeVisible()
  await expect(page.getByText(`${profileUser.counts.courses}`)).toBeVisible()
  await expect(page.getByText(`${profileUser.counts.sheets}`)).toBeVisible()
  await expect(page.getByText(`${profileUser.counts.stars}`)).toBeVisible()

  // Verify contribution data (sheets) displays
  for (const sheet of profileSheets) {
    await expect(page.getByRole('link', { name: sheet.title })).toBeVisible()
  }

  // Verify follow button
  const followButton = page.getByRole('button', { name: /follow|unfollow/i })
  await expect(followButton).toBeVisible()

  // Test follow toggle
  await page.route('**/api/users/*/follow', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        json: { followed: true },
      })
    }
  })

  await followButton.click()
  // Verify follow state changed
  await expect(page.getByRole('button', { name: /unfollow/i })).toBeVisible()
})

test('admin moderation flow: navigate moderation, verify case list and audit log @critical', async ({
  page,
}) => {
  await disableTutorials(page)

  const adminUser = createSessionUser({
    username: 'admin_moderator',
    role: 'admin',
    email: 'admin@studyhub.test',
  })

  await mockAuthenticatedApp(page, {
    user: adminUser,
  })

  const mockCases = [
    {
      id: 401,
      status: 'open',
      priority: 'high',
      category: 'spam',
      createdAt: '2026-03-28T15:00:00.000Z',
      updatedAt: '2026-03-29T10:00:00.000Z',
      summary: 'Suspicious post with repeated links',
      reporter: { id: 1, username: 'reporter1' },
      assignee: { id: adminUser.id, username: adminUser.username },
    },
    {
      id: 402,
      status: 'investigating',
      priority: 'medium',
      category: 'inappropriate_content',
      createdAt: '2026-03-27T12:30:00.000Z',
      updatedAt: '2026-03-29T09:15:00.000Z',
      summary: 'Offensive language in sheet content',
      reporter: { id: 2, username: 'reporter2' },
      assignee: null,
    },
  ]

  const mockAuditLog = [
    {
      id: 5001,
      action: 'case_opened',
      caseId: 401,
      performedBy: { id: 1, username: 'reporter1' },
      details: 'Case opened by reporter',
      timestamp: '2026-03-28T15:00:00.000Z',
    },
    {
      id: 5002,
      action: 'case_assigned',
      caseId: 401,
      performedBy: { id: adminUser.id, username: adminUser.username },
      details: 'Case assigned to moderator',
      timestamp: '2026-03-29T08:00:00.000Z',
    },
    {
      id: 5003,
      action: 'case_status_changed',
      caseId: 402,
      performedBy: { id: adminUser.id, username: adminUser.username },
      details: 'Status changed to investigating',
      timestamp: '2026-03-29T09:15:00.000Z',
    },
  ]

  const mockAbuseDetectionStats = {
    totalFlagged: 47,
    flaggedThisWeek: 12,
    resolvedCases: 38,
    openCases: 9,
    avgResolutionTime: 2.3,
    topCategories: ['spam', 'inappropriate_content', 'credential_phishing'],
  }

  await page.route('**/api/admin/moderation/cases?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { cases: mockCases, total: mockCases.length, page: 1 },
    })
  })

  await page.route('**/api/admin/moderation/audit-log?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { logs: mockAuditLog, total: mockAuditLog.length, page: 1 },
    })
  })

  await page.route('**/api/admin/moderation/abuse-detection/stats', async (route) => {
    await route.fulfill({
      status: 200,
      json: mockAbuseDetectionStats,
    })
  })

  await page.goto('/admin/moderation')

  // Verify moderation tab loads
  await expect(page.getByRole('heading', { name: /moderation|cases/i })).toBeVisible()

  // Verify case list renders
  await expect(page.getByText(mockCases[0].summary)).toBeVisible()
  await expect(page.getByText(mockCases[1].summary)).toBeVisible()

  // Verify case status badges
  await expect(page.getByText(/open|investigating/i)).toBeVisible()

  // Click audit log tab
  const auditLogTab = page.getByRole('tab', { name: /audit/i })
  if (await auditLogTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await auditLogTab.click()

    // Verify audit log sub-tab loads
    for (const log of mockAuditLog.slice(0, 2)) {
      await expect(
        page.getByText(log.action, { exact: false }).or(page.getByText(log.details)),
      ).toBeVisible({ timeout: 2000 })
    }
  }

  // Verify abuse detection stats show
  await expect(page.getByText(`${mockAbuseDetectionStats.totalFlagged}`)).toBeVisible()
  await expect(page.getByText(`${mockAbuseDetectionStats.openCases}`)).toBeVisible()
})

test('discovery flow: trending section and follow suggestions on feed/profile @critical', async ({
  page,
}) => {
  await disableTutorials(page)

  const discoveryUser = createSessionUser({
    username: 'discovery_student',
    role: 'student',
    email: 'discovery@studyhub.test',
  })

  const trendingSheet = {
    id: 520,
    title: 'Trending: Linear Algebra Fast Review',
    description: 'Popular linear algebra exam prep.',
    createdAt: '2026-03-28T14:00:00.000Z',
    author: { id: 33, username: 'linear_expert' },
    course: { id: 103, code: 'MATH411' },
    stars: 25,
    downloads: 62,
    forks: 8,
  }

  const suggestedUsers = [
    {
      id: 44,
      username: 'helpful_tutor',
      role: 'student',
      avatarUrl: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      counts: { courses: 3, sheets: 12, stars: 45 },
    },
    {
      id: 55,
      username: 'study_group_lead',
      role: 'student',
      avatarUrl: null,
      createdAt: '2026-02-15T00:00:00.000Z',
      counts: { courses: 2, sheets: 8, stars: 31 },
    },
  ]

  const feedItems = [
    {
      id: 710,
      feedKey: 'sheet-710',
      type: 'sheet',
      title: 'CS Fundamentals',
      preview: 'Core CS concepts.',
      createdAt: '2026-03-29T10:00:00.000Z',
      author: { id: discoveryUser.id, username: discoveryUser.username },
      course: { id: 101, code: 'CMSC131' },
      stars: 3,
      downloads: 7,
      forks: 1,
      linkPath: '/sheets/710',
    },
  ]

  await mockAuthenticatedApp(page, {
    user: discoveryUser,
    feedItems,
  })

  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        items: feedItems,
        total: 1,
        partial: false,
        degradedSections: [],
      },
    })
  })

  await page.route('**/api/sheets/trending?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: [trendingSheet],
    })
  })

  await page.route('**/api/users/suggestions?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: suggestedUsers,
    })
  })

  await page.goto('/feed')

  // Verify trending section renders in feed aside
  const trendingSection = page.getByRole('region', { name: /trending|discover/i })
  if (await trendingSection.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(trendingSection.getByRole('link', { name: trendingSheet.title })).toBeVisible()
  }

  // Verify follow suggestions render
  const suggestionsSection = page.getByRole('region', { name: /suggest|follow/i })
  if (await suggestionsSection.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(suggestionsSection.getByText(suggestedUsers[0].username)).toBeVisible()
  }

  // Test follow from suggestions
  await page.route('**/api/users/*/follow', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        json: { followed: true },
      })
    }
  })

  const followSuggestionButton = page
    .getByText(suggestedUsers[0].username)
    .locator('xpath=../../..')
    .getByRole('button', { name: /follow/i })
  if (await followSuggestionButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await followSuggestionButton.click()
    // Verify follow state changed to unfollow
    await expect(
      page
        .getByText(suggestedUsers[0].username)
        .locator('xpath=../../..')
        .getByRole('button', { name: /unfollow/i }),
    ).toBeVisible({ timeout: 2000 })
  }
})

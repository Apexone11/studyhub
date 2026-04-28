export function createSessionUser(overrides = {}) {
  const user = {
    id: 42,
    username: 'regression_admin',
    role: 'admin',
    email: 'regression_admin@studyhub.test',
    emailVerified: true,
    twoFaEnabled: true,
    avatarUrl: null,
    createdAt: '2026-03-16T12:00:00.000Z',
    enrollments: [
      {
        id: 900,
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
    ],
    counts: { courses: 1, sheets: 2, stars: 3 },
    csrfToken: 'csrf-token',
    ...overrides,
  }

  if (!user._count) {
    user._count = {
      enrollments: Array.isArray(user.enrollments) ? user.enrollments.length : 0,
      studySheets: user.counts?.sheets ?? 0,
    }
  }

  return user
}

export async function mockAuthenticatedApp(page, overrides = {}) {
  const user = createSessionUser(overrides.user)
  const sheet = {
    id: 501,
    title: 'Algorithms Midterm Review',
    description: 'A concise set of notes for the first algorithms midterm.',
    content: 'Dynamic programming, graphs, and asymptotic analysis.',
    createdAt: '2026-03-16T12:00:00.000Z',
    updatedAt: '2026-03-16T12:00:00.000Z',
    userId: user.id,
    stars: 12,
    downloads: 34,
    forks: 3,
    starred: false,
    commentCount: 1,
    reactions: { likes: 4, dislikes: 0, userReaction: null },
    course: user.enrollments[0].course,
    author: { id: user.id, username: user.username },
    incomingContributions: [],
    outgoingContributions: [],
    contentFormat: 'markdown',
    status: 'published',
    hasAttachment: false,
    attachmentName: null,
    attachmentType: null,
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
      scanUpdatedAt: null,
      scanAcknowledgedAt: null,
      hasOriginalVersion: false,
      hasWorkingVersion: false,
      originalSourceName: null,
    },
    ...overrides.sheet,
  }
  const settingsUser = overrides.settingsUser || {
    ...user,
    _count: {
      enrollments: Array.isArray(user.enrollments) ? user.enrollments.length : 0,
      studySheets: user.counts?.sheets ?? 0,
    },
  }
  const notes = overrides.notes || [
    {
      id: 801,
      title: 'Midterm checklist',
      content: '# Midterm checklist\n\n- Review recursion\n- Practice tree traversals',
      private: true,
      courseId: sheet.course.id,
      course: { id: sheet.course.id, code: sheet.course.code },
      updatedAt: '2026-03-16T12:08:00.000Z',
    },
  ]

  const feedItems = overrides.feedItems || [
    {
      id: 700,
      feedKey: 'sheet-501',
      type: 'sheet',
      title: sheet.title,
      description: sheet.description,
      preview: sheet.description,
      createdAt: sheet.createdAt,
      author: { id: user.id, username: user.username },
      course: { id: sheet.course.id, code: sheet.course.code },
      stars: sheet.stars,
      downloads: sheet.downloads,
      forks: sheet.forks,
      starred: false,
      commentCount: 1,
      reactions: { likes: 4, dislikes: 0, userReaction: null },
      linkPath: `/sheets/${sheet.id}`,
    },
    {
      id: 701,
      feedKey: 'announcement-701',
      type: 'announcement',
      title: 'Exam Week Hours',
      body: 'The library group rooms stay open until 2am during finals week.',
      createdAt: '2026-03-16T11:00:00.000Z',
      author: { id: 1, username: 'studyhub' },
    },
  ]

  // Catch-all registered FIRST → lowest priority in Playwright's LIFO matching.
  // Any unmocked API request returns empty success to prevent network hangs.
  //
  // Defensive shape (Task #56 second half): components routinely do
  // `data.X.slice()` after a truthy guard like `data?.X || []`. Pre-fix,
  // the catch-all returned `{}` for every GET — `{}` is truthy, so the
  // `|| []` short-circuit didn't fire and `.slice()` crashed on
  // `undefined`. The fix returns either `[]` or a safe object shape per
  // URL heuristic so common list/object render patterns no longer
  // throw. Specs that need real data still register explicit mocks
  // below; those override the catch-all (Playwright LIFO matching).
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method !== 'GET') {
      await route.fulfill({ status: 200, json: { ok: true } })
      return
    }
    const path = new URL(route.request().url()).pathname
    // Single-resource paths end in `/<id>` or `/me/<thing>`. Default to {}.
    // Collection paths default to [] so `.slice() / .map() / .length`
    // patterns don't crash. Object-shaped collection endpoints (e.g.,
    // `{ items, total }` paged responses) must mock explicitly below.
    const looksLikeCollection =
      /\/(suggestions|recommendations|trending|popular|recent|leaderboard|achievements|badges|tags|courses|sheets|notes|messages|conversations|groups|members|sessions|discussions|exams|materials|videos|books|shelves|bookmarks|donations|payments|reports|appeals|reactions|comments|stars|forks|contributions|invitations|invites|referrals|rewards|reviews|posts|announcements|hashtags|status)$/.test(
        path,
      ) ||
      /\/me\/(courses|sheets|notes|exams|stars|follows|followers|following|invites|referrals|achievements|reports)$/.test(
        path,
      )
    await route.fulfill({ status: 200, json: looksLikeCollection ? [] : {} })
  })

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, json: user })
  })
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })
  await page.route('**/api/feed?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: { items: feedItems, total: feedItems.length, partial: false, degradedSections: [] },
    })
  })
  await page.route('**/api/sheets/leaderboard?type=*', async (route) => {
    await route.fulfill({ status: 200, json: [sheet] })
  })
  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
          courses: [user.enrollments[0].course],
        },
      ],
    })
  })
  await page.route('**/api/courses/popular', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: user.enrollments[0].course.id,
          code: user.enrollments[0].course.code,
          name: user.enrollments[0].course.name,
          school: user.enrollments[0].course.school,
          sheetCount: 1,
        },
      ],
    })
  })
  await page.route('**/api/sheets?*', async (route) => {
    await route.fulfill({ status: 200, json: { sheets: [sheet], total: 1 } })
  })
  await page.route(`**/api/sheets/${sheet.id}/comments?*`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        comments: [
          {
            id: 1001,
            content: 'This summary is exactly what I needed.',
            createdAt: '2026-03-16T12:05:00.000Z',
            author: { id: 17, username: 'classmate' },
          },
        ],
        total: 1,
      },
    })
  })
  await page.route(`**/api/sheets/${sheet.id}`, async (route) => {
    await route.fulfill({ status: 200, json: sheet })
  })
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() || {}
      const createdNote = {
        id: 999,
        title: payload.title || 'Untitled Note',
        content: payload.content || '',
        private: payload.private ?? true,
        courseId: payload.courseId || sheet.course.id,
        course: { id: sheet.course.id, code: sheet.course.code },
        updatedAt: '2026-03-16T12:15:00.000Z',
      }
      await route.fulfill({ status: 200, json: createdNote })
      return
    }

    await route.fulfill({ status: 200, json: notes })
  })
  await page.route('**/api/notes/*', async (route) => {
    const payload = route.request().postDataJSON?.() || {}
    const noteId = Number(route.request().url().split('/').pop())
    const currentNote = notes.find((note) => note.id === noteId) || notes[0]

    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, json: { deleted: true } })
      return
    }

    const updatedNote = {
      ...currentNote,
      ...payload,
      id: noteId,
      updatedAt: '2026-03-16T12:16:00.000Z',
    }
    await route.fulfill({ status: 200, json: updatedNote })
  })
  await page.route('**/api/settings/me', async (route) => {
    await route.fulfill({ status: 200, json: settingsUser })
  })
  await page.route('**/api/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        hero: {
          username: user.username,
          createdAt: user.createdAt,
          emailVerified: true,
        },
        stats: { courseCount: 1, sheetCount: 2, starCount: 3 },
        courses: user.enrollments.map((enrollment) => enrollment.course),
        recentSheets: [sheet],
      },
    })
  })
  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        totalUsers: 24,
        totalSheets: 55,
        totalComments: 18,
        flaggedRequests: 1,
        totalStars: 89,
        totalNotes: 14,
        totalFollows: 9,
        totalReactions: 22,
      },
    })
  })
  await page.route('**/api/admin/users?page=*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        users: [
          {
            id: user.id,
            username: user.username,
            role: 'admin',
            email: user.email,
            createdAt: user.createdAt,
            _count: { studySheets: 2 },
          },
        ],
        total: 1,
        page: 1,
      },
    })
  })
  await page.route('**/api/admin/sheets?page=*', async (route) => {
    await route.fulfill({ status: 200, json: { sheets: [sheet], total: 1, page: 1 } })
  })
  await page.route('**/api/admin/announcements?page=*', async (route) => {
    await route.fulfill({ status: 200, json: { announcements: [], total: 0, page: 1 } })
  })
  await page.route('**/api/admin/deletion-reasons?page=*', async (route) => {
    await route.fulfill({ status: 200, json: { reasons: [], total: 0, page: 1 } })
  })

  // Widget endpoints loaded on most authenticated pages. Pre-fix, these
  // hit the catch-all, returned `{}`, and crashed `.slice()` calls in
  // FollowSuggestions / UpcomingExamsCard / AiSuggestionCard. Returning
  // empty success-shaped payloads keeps the components mounted but
  // hidden (each one early-returns null on empty data).
  await page.route('**/api/users/me/follow-suggestions', async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })
  await page.route('**/api/exams/upcoming**', async (route) => {
    await route.fulfill({ status: 200, json: { exams: [] } })
  })
  await page.route('**/api/ai/suggestions**', async (route) => {
    await route.fulfill({ status: 200, json: { suggestions: [], partial: false } })
  })
  await page.route('**/api/feed/trending**', async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })
  await page.route('**/api/announcements**', async (route) => {
    await route.fulfill({ status: 200, json: { announcements: [], total: 0, page: 1 } })
  })
  await page.route('**/api/study-groups**', async (route) => {
    await route.fulfill({ status: 200, json: { groups: [], total: 0, page: 1 } })
  })
  await page.route('**/api/messages/conversations**', async (route) => {
    await route.fulfill({ status: 200, json: { conversations: [], total: 0 } })
  })
  await page.route('**/api/library/popular**', async (route) => {
    await route.fulfill({ status: 200, json: { books: [], total: 0 } })
  })
  await page.route('**/api/platform-stats', async (route) => {
    await route.fulfill({
      status: 200,
      json: { totalUsers: 0, totalSheets: 0, totalCourses: 0, totalSchools: 0 },
    })
  })

  return { user, sheet, notes, settingsUser }
}

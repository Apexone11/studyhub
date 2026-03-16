const autocannon = require('autocannon')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function extractCookie(response) {
  const rawCookie = response.headers.get('set-cookie')
  return rawCookie ? rawCookie.split(';')[0] : ''
}

function extractCsrfToken(payload) {
  return payload?.user?.csrfToken || payload?.csrfToken || ''
}

function syncSessionState(previousCookie, response, payload, csrfTokenByCookie) {
  const nextCookie = extractCookie(response) || previousCookie || ''
  const csrfToken = extractCsrfToken(payload)

  if (previousCookie && previousCookie !== nextCookie) {
    csrfTokenByCookie.delete(previousCookie)
  }
  if (nextCookie && csrfToken) {
    csrfTokenByCookie.set(nextCookie, csrfToken)
  }

  return {
    cookie: nextCookie,
    csrfToken: csrfToken || csrfTokenByCookie.get(nextCookie) || '',
  }
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options)
  const body = await parseBody(response)
  return { response, body }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Retry until the backend is ready.
    }

    await delay(500)
  }

  throw new Error(`Server did not start in time at ${url}.`)
}

function assertStatus(response, body, expectedStatuses, label) {
  if (expectedStatuses.includes(response.status)) return
  throw new Error(`${label} failed with ${response.status}: ${JSON.stringify(body)}`)
}

async function getCatalog(baseUrl) {
  const { response, body } = await apiRequest(`${baseUrl}/api/courses/schools`)
  assertStatus(response, body, [200], 'schools-catalog')
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('schools-catalog returned an empty payload.')
  }
  return body
}

async function loginSession(baseUrl, username, password, label, csrfTokenByCookie) {
  const { response, body } = await apiRequest(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (response.status !== 200) {
    return { ok: false, response, body }
  }

  if (body?.requires2fa) {
    throw new Error(`${label} requires 2-step verification. Use a dedicated non-2FA load-test account.`)
  }

  const session = syncSessionState('', response, body, csrfTokenByCookie)
  if (!session.cookie) {
    throw new Error(`${label} login succeeded but no session cookie was returned.`)
  }

  return { ok: true, ...session, body }
}

async function registerLoadUser(baseUrl, catalog, username, password, csrfTokenByCookie) {
  const school = catalog[0]
  const courseIds = (school.courses || []).slice(0, 2).map((course) => course.id)

  const { response, body } = await apiRequest(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      schoolId: school.id,
      courseIds,
      customCourses: [],
    }),
  })

  assertStatus(response, body, [201], 'register-load-user')

  const session = syncSessionState('', response, body, csrfTokenByCookie)
  if (!session.cookie) {
    throw new Error('Load-test registration succeeded but no session cookie was returned.')
  }

  return { ...session, school, courseIds }
}

async function ensureStudentSession(baseUrl, catalog, csrfTokenByCookie) {
  const username = process.env.LOAD_TEST_USERNAME || 'loadtest_student'
  const password = process.env.LOAD_TEST_PASSWORD || 'LoadTest123!'

  const loginResult = await loginSession(baseUrl, username, password, 'Load-test student', csrfTokenByCookie)
  if (loginResult.ok) {
    return {
      cookie: loginResult.cookie,
      csrfToken: loginResult.csrfToken,
      username,
      password,
      created: false,
    }
  }

  if (loginResult.response.status !== 401) {
    throw new Error(`Could not log in load-test student: ${JSON.stringify(loginResult.body)}`)
  }

  try {
    const registration = await registerLoadUser(baseUrl, catalog, username, password, csrfTokenByCookie)
    return {
      cookie: registration.cookie,
      csrfToken: registration.csrfToken,
      username,
      password,
      created: true,
    }
  } catch (error) {
    if (String(error.message || '').includes('409')) {
      throw new Error(
        'The dedicated load-test account already exists but the configured password does not work. ' +
        'Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD to a known non-2FA student account.'
      )
    }
    throw error
  }
}

async function ensureAdminSession(baseUrl, csrfTokenByCookie) {
  const username = process.env.ADMIN_USERNAME || 'studyhub_owner'
  const password = process.env.ADMIN_PASSWORD || 'AdminPass123'

  const loginResult = await loginSession(baseUrl, username, password, 'Admin account', csrfTokenByCookie)
  if (!loginResult.ok) {
    throw new Error(`Could not log in admin account: ${JSON.stringify(loginResult.body)}`)
  }

  return { cookie: loginResult.cookie, csrfToken: loginResult.csrfToken, username }
}

async function ensureSheetFixtures(baseUrl, studentCookie, catalog) {
  const desiredSheetCount = toPositiveInt(process.env.LOAD_TEST_SHEETS, 12)
  const school = catalog[0]
  const fallbackCourseId = school?.courses?.[0]?.id
  if (!fallbackCourseId) {
    throw new Error('Could not find a course to seed load-test sheets.')
  }

  const { response, body } = await apiRequest(`${baseUrl}/api/sheets?mine=1&limit=50`, {
    headers: { cookie: studentCookie },
  })
  assertStatus(response, body, [200], 'load-test-sheet-index')

  const sheets = Array.isArray(body?.sheets) ? [...body.sheets] : []
  const existingTitles = new Set(sheets.map((sheet) => sheet.title))

  for (let index = 1; index <= desiredSheetCount; index += 1) {
    const title = `Load Test Sheet ${String(index).padStart(2, '0')}`
    if (existingTitles.has(title)) continue

    const { response: createResponse, body: createdSheet } = await apiRequest(`${baseUrl}/api/sheets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: studentCookie,
      },
      body: JSON.stringify({
        title,
        description: 'Synthetic fixture for launch traffic testing.',
        content: `# ${title}\n\nThis fixture exists to benchmark the Version 1 read path.\n\n- Fixture: ${index}\n- Purpose: load testing\n- Audience: launch readiness\n`,
        courseId: fallbackCourseId,
      }),
    })
    assertStatus(createResponse, createdSheet, [201], `create-${title}`)
    sheets.push(createdSheet)
    existingTitles.add(title)
  }

  const hotSheet = sheets.find((sheet) => sheet.title === 'Load Test Sheet 01') || sheets[0]
  if (!hotSheet) {
    throw new Error('No load-test sheet is available.')
  }

  return { hotSheet, sheetCount: sheets.length }
}

async function ensureEngagementFixtures(baseUrl, hotSheetId, studentCookie, adminCookie) {
  const commentState = await apiRequest(`${baseUrl}/api/sheets/${hotSheetId}/comments`)
  assertStatus(commentState.response, commentState.body, [200], 'hot-sheet-comments')

  if ((commentState.body?.total || 0) === 0) {
    const commentResult = await apiRequest(`${baseUrl}/api/sheets/${hotSheetId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify({ content: 'Admin load-test seed comment.' }),
    })
    assertStatus(commentResult.response, commentResult.body, [201], 'seed-hot-sheet-comment')
  }

  const studentNotifications = await apiRequest(`${baseUrl}/api/notifications?limit=5`, {
    headers: { cookie: studentCookie },
  })
  assertStatus(studentNotifications.response, studentNotifications.body, [200], 'student-notifications-check')

  if ((studentNotifications.body?.total || 0) === 0) {
    const adminSheetView = await apiRequest(`${baseUrl}/api/sheets/${hotSheetId}`, {
      headers: { cookie: adminCookie },
    })
    assertStatus(adminSheetView.response, adminSheetView.body, [200], 'admin-hot-sheet-view')

    if (!adminSheetView.body?.starred) {
      const starResult = await apiRequest(`${baseUrl}/api/sheets/${hotSheetId}/star`, {
        method: 'POST',
        headers: { cookie: adminCookie },
      })
      assertStatus(starResult.response, starResult.body, [200], 'seed-hot-sheet-star')
    }
  }

  const refreshedNotifications = await apiRequest(`${baseUrl}/api/notifications?limit=5`, {
    headers: { cookie: studentCookie },
  })
  assertStatus(refreshedNotifications.response, refreshedNotifications.body, [200], 'student-notifications-refresh')

  return {
    notificationCount: refreshedNotifications.body?.total || 0,
    unreadCount: refreshedNotifications.body?.unreadCount || 0,
  }
}

function runScenario({ name, url, method = 'GET', headers = {}, duration, connections }) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        title: name,
        url,
        method,
        headers,
        connections,
        duration,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve({
          name,
          url,
          method,
          connections,
          duration,
          requestsPerSecond: Number(result.requests.average.toFixed(2)),
          totalRequests: result.requests.total,
          avgLatencyMs: Number(result.latency.average.toFixed(2)),
          p99LatencyMs: result.latency.p99,
          maxLatencyMs: result.latency.max,
          throughputBytesPerSecond: Number(result.throughput.average.toFixed(2)),
          non2xx: result.non2xx,
          errors: result.errors,
          timeouts: result.timeouts,
          resets: result.resets,
          statusCodeStats: result.statusCodeStats,
        })
      }
    )
  })
}

async function runWave(wave) {
  const startedAt = Date.now()
  const results = await Promise.all(wave.scenarios.map(runScenario))
  const totalRequestsPerSecond = Number(
    results.reduce((sum, result) => sum + result.requestsPerSecond, 0).toFixed(2)
  )
  const totalRequests = results.reduce((sum, result) => sum + result.totalRequests, 0)
  const worstP99LatencyMs = Math.max(...results.map((result) => result.p99LatencyMs))
  const totalFailures = results.reduce(
    (sum, result) => sum + result.non2xx + result.errors + result.timeouts + result.resets,
    0
  )

  return {
    name: wave.name,
    durationSeconds: wave.scenarios[0]?.duration || 0,
    totalRequestsPerSecond,
    totalRequests,
    worstP99LatencyMs,
    totalFailures,
    elapsedMs: Date.now() - startedAt,
    scenarios: results,
  }
}

function scaledConnections(baseConnections, scale) {
  return Math.max(1, Math.round(baseConnections * scale))
}

async function main() {
  const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:4000'
  const durationSeconds = toPositiveInt(process.env.LOAD_TEST_DURATION, 10)
  const connectionScale = toPositiveNumber(process.env.LOAD_TEST_SCALE, 1)
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
  const csrfTokenByCookie = new Map()
  const nativeFetch = global.fetch.bind(global)

  global.fetch = async (input, init = {}) => {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(input instanceof Request ? input.headers : init.headers)
    const cookie = headers.get('cookie') || ''
    const csrfToken = csrfTokenByCookie.get(cookie)

    if (!safeMethods.has(method)) {
      if (csrfToken && !headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', csrfToken)
      }
      if (!headers.has('x-requested-with')) {
        headers.set('x-requested-with', 'XMLHttpRequest')
      }
    }

    const nextInit = { ...init, headers }
    if (input instanceof Request) {
      return nativeFetch(new Request(input, nextInit))
    }
    return nativeFetch(input, nextInit)
  }

  await waitForServer(`${baseUrl}/`)

  const catalog = await getCatalog(baseUrl)
  const student = await ensureStudentSession(baseUrl, catalog, csrfTokenByCookie)
  const admin = await ensureAdminSession(baseUrl, csrfTokenByCookie)
  const fixture = await ensureSheetFixtures(baseUrl, student.cookie, catalog)
  const engagement = await ensureEngagementFixtures(
    baseUrl,
    fixture.hotSheet.id,
    student.cookie,
    admin.cookie
  )

  console.log(`Load-test student account ${student.created ? '(created now)' : '(reused)'}`)
  console.log(`Hot sheet: #${fixture.hotSheet.id} "${fixture.hotSheet.title}"`)
  console.log(`Fixture sheets available: ${fixture.sheetCount}`)
  console.log(`Student notifications available: ${engagement.notificationCount}`)
  console.log(`Running load test against ${baseUrl} for ${durationSeconds}s with scale ${connectionScale}x`)

  const waves = [
    {
      name: 'public-read-mix',
      scenarios: [
        {
          name: 'public-sheets-index',
          url: `${baseUrl}/api/sheets?limit=20`,
          connections: scaledConnections(30, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'public-hot-sheet',
          url: `${baseUrl}/api/sheets/${fixture.hotSheet.id}`,
          connections: scaledConnections(20, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'public-hot-sheet-comments',
          url: `${baseUrl}/api/sheets/${fixture.hotSheet.id}/comments`,
          connections: scaledConnections(10, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'public-announcements',
          url: `${baseUrl}/api/announcements`,
          connections: scaledConnections(15, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'public-leaderboard',
          url: `${baseUrl}/api/sheets/leaderboard?type=stars`,
          connections: scaledConnections(10, connectionScale),
          duration: durationSeconds,
        },
      ],
    },
    {
      name: 'student-polling-mix',
      scenarios: [
        {
          name: 'student-auth-me',
          url: `${baseUrl}/api/auth/me`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(10, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'student-feed-refresh',
          url: `${baseUrl}/api/sheets?limit=5`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(15, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'student-notifications',
          url: `${baseUrl}/api/notifications?limit=15`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(10, connectionScale),
          duration: durationSeconds,
        },
      ],
    },
    {
      name: 'admin-polling-mix',
      scenarios: [
        {
          name: 'admin-stats',
          url: `${baseUrl}/api/admin/stats`,
          headers: { cookie: admin.cookie },
          connections: scaledConnections(5, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'admin-users-page',
          url: `${baseUrl}/api/admin/users?page=1`,
          headers: { cookie: admin.cookie },
          connections: scaledConnections(5, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'admin-sheets-page',
          url: `${baseUrl}/api/admin/sheets?page=1`,
          headers: { cookie: admin.cookie },
          connections: scaledConnections(5, connectionScale),
          duration: durationSeconds,
        },
      ],
    },
    {
      name: 'stretch-read-and-download',
      scenarios: [
        {
          name: 'stretch-sheets-index',
          url: `${baseUrl}/api/sheets?limit=20`,
          connections: scaledConnections(60, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'stretch-hot-sheet',
          url: `${baseUrl}/api/sheets/${fixture.hotSheet.id}`,
          connections: scaledConnections(40, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'download-counter-burst',
          url: `${baseUrl}/api/sheets/${fixture.hotSheet.id}/download`,
          method: 'POST',
          headers: {
            cookie: student.cookie,
            'x-csrf-token': student.csrfToken,
            'x-requested-with': 'XMLHttpRequest',
          },
          connections: scaledConnections(8, connectionScale),
          duration: durationSeconds,
        },
      ],
    },
  ]

  const waveResults = []

  for (const wave of waves) {
    console.log(`\n== ${wave.name} ==`)
    const result = await runWave(wave)
    waveResults.push(result)

    for (const scenario of result.scenarios) {
      console.log(
        `${scenario.name}: ${scenario.requestsPerSecond} req/s avg, ` +
        `p99 ${scenario.p99LatencyMs}ms, failures ${scenario.non2xx + scenario.errors + scenario.timeouts + scenario.resets}`
      )
    }
  }

  const report = {
    baseUrl,
    durationSeconds,
    connectionScale,
    fixture: {
      studentAccountState: student.created ? 'created-now' : 'reused',
      sheetCount: fixture.sheetCount,
      hotSheetId: fixture.hotSheet.id,
      hotSheetTitle: fixture.hotSheet.title,
      notificationCount: engagement.notificationCount,
      unreadCount: engagement.unreadCount,
    },
    waves: waveResults,
  }

  console.log('\nFinal load-test report:')
  console.log(JSON.stringify(report, null, 2))

  const totalFailures = waveResults.reduce((sum, wave) => sum + wave.totalFailures, 0)
  if (totalFailures > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

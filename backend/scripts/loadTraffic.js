const fs = require('node:fs/promises')
const path = require('node:path')
const autocannon = require('autocannon')
const { waitForCapturedVerificationCode } = require('../src/lib/emailCapture')

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

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

function createSeededRandom(seedInput) {
  let seed = (seedInput >>> 0) || 1
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne(items, random) {
  if (!Array.isArray(items) || items.length === 0) return null
  const index = Math.floor(random() * items.length)
  return items[index]
}

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Xq5kAAAAASUVORK5CYII='

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

async function apiRequestWithRetry(
  url,
  options = {},
  { expectedStatuses = [200], label = 'request', retryOn429 = true, retries = 6, retryDelayMs = 1200 } = {}
) {
  let lastResponse = null
  let lastBody = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { response, body } = await apiRequest(url, options)
    lastResponse = response
    lastBody = body

    if (expectedStatuses.includes(response.status)) {
      return { response, body, attempt }
    }

    const shouldRetry = retryOn429 && response.status === 429 && attempt < retries
    if (!shouldRetry) {
      assertStatus(response, body, expectedStatuses, label)
    }

    await delay(retryDelayMs)
  }

  assertStatus(lastResponse, lastBody, expectedStatuses, label)
  return { response: lastResponse, body: lastBody, attempt: retries }
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
  const { body } = await apiRequestWithRetry(`${baseUrl}/api/courses/schools`, {}, {
    expectedStatuses: [200],
    label: 'schools-catalog',
    retries: 10,
    retryDelayMs: 1000,
  })
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('schools-catalog returned an empty payload.')
  }
  return body
}

async function loginSession(baseUrl, username, password, label, csrfTokenByCookie) {
  const { response, body } = await apiRequestWithRetry(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, {
    expectedStatuses: [200, 401],
    label: `${label}-login`,
    retries: 8,
    retryDelayMs: 800,
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
  const email = String(process.env.LOAD_TEST_EMAIL || `${username}@studyhub.test`).trim().toLowerCase()
  const captureDirectory = process.env.EMAIL_CAPTURE_DIR

  if (!captureDirectory) {
    throw new Error(
      'The load-test account does not exist yet and EMAIL_CAPTURE_DIR is not set. ' +
      'Set EMAIL_CAPTURE_DIR so the script can complete the verified-email registration flow automatically.'
    )
  }

  const registrationStartedAt = Date.now()

  const { response: startResponse, body: startBody } = await apiRequest(`${baseUrl}/api/auth/register/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      confirmPassword: password,
      termsAccepted: true,
    }),
  })

  assertStatus(startResponse, startBody, [201], 'register-load-user-start')

  const verificationCode = await waitForCapturedVerificationCode({
    directory: captureDirectory,
    toEmail: email,
    afterTimeMs: registrationStartedAt,
    timeoutMs: toPositiveInt(process.env.LOAD_TEST_EMAIL_TIMEOUT_MS, 15000),
  })

  const { response: verifyResponse, body: verifyBody } = await apiRequest(`${baseUrl}/api/auth/register/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      verificationToken: startBody.verificationToken,
      code: verificationCode,
    }),
  })

  assertStatus(verifyResponse, verifyBody, [200], 'register-load-user-verify')

  const { response, body } = await apiRequest(`${baseUrl}/api/auth/register/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      verificationToken: startBody.verificationToken,
      schoolId: school.id,
      courseIds,
      customCourses: [],
    }),
  })

  assertStatus(response, body, [201], 'register-load-user-complete')

  const session = syncSessionState('', response, body, csrfTokenByCookie)
  if (!session.cookie) {
    throw new Error('Load-test registration succeeded but no session cookie was returned.')
  }

  return { ...session, school, courseIds, email }
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

async function ensureOptionalSession(baseUrl, username, password, csrfTokenByCookie) {
  const loginResult = await loginSession(baseUrl, username, password, username, csrfTokenByCookie)
  if (!loginResult.ok) return null
  return {
    cookie: loginResult.cookie,
    csrfToken: loginResult.csrfToken,
    username,
  }
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

async function ensureFeedFixtures(baseUrl, studentCookie, courseId) {
  const { response, body } = await apiRequest(`${baseUrl}/api/feed?limit=24`, {
    headers: { cookie: studentCookie },
  })
  assertStatus(response, body, [200], 'load-test-feed-index')

  const postIds = (Array.isArray(body?.items) ? body.items : [])
    .filter((item) => item?.type === 'post' && Number.isInteger(item?.id))
    .map((item) => item.id)

  if (postIds.length >= 2) {
    return { postIds }
  }

  for (let index = postIds.length; index < 2; index += 1) {
    const { response: createResponse, body: createdPost } = await apiRequest(`${baseUrl}/api/feed/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: studentCookie,
      },
      body: JSON.stringify({
        content: `Synthetic load fixture post ${index + 1}`,
        courseId,
        allowDownloads: true,
      }),
    })
    assertStatus(createResponse, createdPost, [201], `seed-feed-post-${index + 1}`)
    if (Number.isInteger(createdPost?.id)) {
      postIds.push(createdPost.id)
    }
  }

  return { postIds }
}

async function runSyntheticMixedActions({
  baseUrl,
  durationSeconds,
  seed,
  actors,
  courseId,
  sheetIds,
  postIds,
  allowRateLimited = true,
}) {
  const workerCount = toPositiveInt(process.env.LOAD_TEST_MIXED_WORKERS, 6)
  const durationMs = durationSeconds * 1000
  const startedAt = Date.now()
  const tinyPngBuffer = Buffer.from(TINY_PNG_BASE64, 'base64')
  const stats = {
    seed,
    workerCount,
    durationSeconds,
    totalActions: 0,
    failures: 0,
    throttled: 0,
    byAction: {},
    failureSamples: [],
  }
  let syntheticPostCounter = 0

  function markAction(name, status, detail = '') {
    stats.totalActions += 1
    stats.byAction[name] = stats.byAction[name] || { ok: 0, throttled: 0, failed: 0 }
    if (status === 'ok') {
      stats.byAction[name].ok += 1
      return
    }
    if (status === 'throttled') {
      stats.byAction[name].throttled += 1
      stats.throttled += 1
      return
    }

    stats.byAction[name].failed += 1
    stats.failures += 1
    if (stats.failureSamples.length < 8) {
      stats.failureSamples.push(`${name}: ${detail}`)
    }
  }

  async function runAction(name, operation) {
    try {
      await operation()
      markAction(name, 'ok')
    } catch (error) {
      const detail = error?.message || String(error)
      if (allowRateLimited && /failed with 429/i.test(detail)) {
        markAction(name, 'throttled')
        return
      }
      markAction(name, 'failed', detail)
    }
  }

  const actionDefinitions = [
    {
      name: 'read-feed',
      run: async ({ actor }) => {
        const { response, body } = await apiRequest(`${baseUrl}/api/feed?limit=16`, {
          headers: { cookie: actor.cookie },
        })
        assertStatus(response, body, [200], 'synthetic-read-feed')
      },
    },
    {
      name: 'search-sheets',
      run: async ({ actor, random }) => {
        const query = random() > 0.5 ? 'load' : 'study'
        const { response, body } = await apiRequest(`${baseUrl}/api/sheets?limit=12&search=${query}`, {
          headers: { cookie: actor.cookie },
        })
        assertStatus(response, body, [200], 'synthetic-search-sheets')
      },
    },
    {
      name: 'star-sheet',
      run: async ({ actor, random }) => {
        const sheetId = pickOne(sheetIds, random)
        if (!sheetId) return
        const { response, body } = await apiRequest(`${baseUrl}/api/sheets/${sheetId}/star`, {
          method: 'POST',
          headers: { cookie: actor.cookie },
        })
        assertStatus(response, body, [200], 'synthetic-star-sheet')
      },
    },
    {
      name: 'sheet-reaction',
      run: async ({ actor, random }) => {
        const sheetId = pickOne(sheetIds, random)
        if (!sheetId) return
        const type = pickOne(['like', 'dislike', null], random)
        const { response, body } = await apiRequest(`${baseUrl}/api/sheets/${sheetId}/react`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({ type }),
        })
        assertStatus(response, body, [200], 'synthetic-sheet-react')
      },
    },
    {
      name: 'sheet-comment',
      run: async ({ actor, random }) => {
        const sheetId = pickOne(sheetIds, random)
        if (!sheetId) return
        const { response, body } = await apiRequest(`${baseUrl}/api/sheets/${sheetId}/comments`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({
            content: `Synthetic sheet comment ${Math.floor(random() * 10_000)}`,
          }),
        })
        assertStatus(response, body, [201], 'synthetic-sheet-comment')
      },
    },
    {
      name: 'sheet-download-counter',
      run: async ({ actor, random }) => {
        const sheetId = pickOne(sheetIds, random)
        if (!sheetId) return
        const { response, body } = await apiRequest(`${baseUrl}/api/sheets/${sheetId}/download`, {
          method: 'POST',
          headers: { cookie: actor.cookie },
        })
        assertStatus(response, body, [200], 'synthetic-sheet-download-counter')
      },
    },
    {
      name: 'create-post',
      run: async ({ actor }) => {
        syntheticPostCounter += 1
        const { response, body } = await apiRequest(`${baseUrl}/api/feed/posts`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({
            content: `Synthetic mixed action post #${syntheticPostCounter}`,
            courseId,
          }),
        })
        assertStatus(response, body, [201], 'synthetic-create-post')
        if (Number.isInteger(body?.id)) {
          postIds.push(body.id)
        }
      },
    },
    {
      name: 'post-comment',
      run: async ({ actor, random }) => {
        const postId = pickOne(postIds, random)
        if (!postId) return
        const { response, body } = await apiRequest(`${baseUrl}/api/feed/posts/${postId}/comments`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({
            content: `Synthetic post comment ${Math.floor(random() * 10_000)}`,
          }),
        })
        assertStatus(response, body, [201], 'synthetic-post-comment')
      },
    },
    {
      name: 'post-reaction',
      run: async ({ actor, random }) => {
        const postId = pickOne(postIds, random)
        if (!postId) return
        const type = pickOne(['like', 'dislike', null], random)
        const { response, body } = await apiRequest(`${baseUrl}/api/feed/posts/${postId}/react`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({ type }),
        })
        assertStatus(response, body, [200], 'synthetic-post-react')
      },
    },
    {
      name: 'upload-post-attachment',
      run: async ({ actor, random }) => {
        syntheticPostCounter += 1
        const createResult = await apiRequest(`${baseUrl}/api/feed/posts`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: actor.cookie,
          },
          body: JSON.stringify({
            content: `Synthetic attachment post #${syntheticPostCounter}`,
            courseId,
          }),
        })
        assertStatus(createResult.response, createResult.body, [201], 'synthetic-create-post-attachment')
        if (!Number.isInteger(createResult.body?.id)) return
        postIds.push(createResult.body.id)

        const formData = new FormData()
        formData.append(
          'attachment',
          new Blob([tinyPngBuffer], { type: 'image/png' }),
          `synthetic-${Date.now()}-${Math.floor(random() * 10_000)}.png`
        )

        const uploadResult = await apiRequest(`${baseUrl}/api/upload/post-attachment/${createResult.body.id}`, {
          method: 'POST',
          headers: { cookie: actor.cookie },
          body: formData,
        })
        assertStatus(uploadResult.response, uploadResult.body, [200], 'synthetic-upload-post-attachment')
      },
    },
  ]

  const workers = Array.from({ length: workerCount }, (_, index) => (async () => {
    const random = createSeededRandom(seed + (index + 1) * 7919)
    const stopAt = startedAt + durationMs

    while (Date.now() < stopAt) {
      const actor = pickOne(actors, random)
      const action = pickOne(actionDefinitions, random)
      if (!actor || !action) break
      await runAction(action.name, () => action.run({ actor, random }))
      await delay(35 + Math.floor(random() * 185))
    }
  })())

  await Promise.all(workers)
  return {
    ...stats,
    elapsedMs: Date.now() - startedAt,
    postPoolSize: postIds.length,
  }
}

function runScenario({ name, url, method = 'GET', headers = {}, duration, connections, allowRateLimited = true }) {
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

        const throttled429 = result.statusCodeStats?.['429']?.count || 0
        const rawFailures = result.non2xx + result.errors + result.timeouts + result.resets
        const effectiveFailures = allowRateLimited
          ? Math.max(0, rawFailures - throttled429)
          : rawFailures

        resolve({
          name,
          url,
          method,
          connections,
          duration,
          requestsPerSecond: Number(result.requests.average.toFixed(2)),
          totalRequests: result.requests.total,
          avgLatencyMs: Number(result.latency.average.toFixed(2)),
          p95LatencyMs: result.latency.p95,
          p99LatencyMs: result.latency.p99,
          maxLatencyMs: result.latency.max,
          throughputBytesPerSecond: Number(result.throughput.average.toFixed(2)),
          non2xx: result.non2xx,
          throttled429,
          errors: result.errors,
          timeouts: result.timeouts,
          resets: result.resets,
          effectiveFailures,
          statusCodeStats: result.statusCodeStats,
        })
      }
    )
  })
}

async function writeReportIfRequested(report) {
  const outputFile = String(process.env.LOAD_TEST_OUTPUT_FILE || '').trim()
  if (!outputFile) return

  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function runWave(wave, allowRateLimited) {
  const startedAt = Date.now()
  const results = await Promise.all(
    wave.scenarios.map((scenario) => runScenario({ ...scenario, allowRateLimited }))
  )
  const totalRequestsPerSecond = Number(
    results.reduce((sum, result) => sum + result.requestsPerSecond, 0).toFixed(2)
  )
  const totalRequests = results.reduce((sum, result) => sum + result.totalRequests, 0)
  const worstP99LatencyMs = Math.max(...results.map((result) => result.p99LatencyMs))
  const totalFailures = results.reduce((sum, result) => sum + result.effectiveFailures, 0)
  const totalThrottled = results.reduce((sum, result) => sum + result.throttled429, 0)

  return {
    name: wave.name,
    durationSeconds: wave.scenarios[0]?.duration || 0,
    totalRequestsPerSecond,
    totalRequests,
    worstP99LatencyMs,
    totalFailures,
    totalThrottled,
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
  const mixedActionDurationSeconds = toPositiveInt(process.env.LOAD_TEST_MIXED_DURATION, durationSeconds)
  const connectionScale = toPositiveNumber(process.env.LOAD_TEST_SCALE, 1)
  const mixedActionSeed = toInteger(process.env.LOAD_TEST_SEED, 20260317)
  const allowRateLimited = String(process.env.LOAD_TEST_ALLOW_429 || 'true').trim().toLowerCase() !== 'false'
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
  const betaStudent = await ensureOptionalSession(
    baseUrl,
    process.env.BETA_STUDENT_USERNAME || 'beta_student1',
    process.env.BETA_STUDENT_PASSWORD || 'BetaStudent123!',
    csrfTokenByCookie,
  )
  const fixture = await ensureSheetFixtures(baseUrl, student.cookie, catalog)
  const engagement = await ensureEngagementFixtures(
    baseUrl,
    fixture.hotSheet.id,
    student.cookie,
    admin.cookie
  )
  const feedFixture = await ensureFeedFixtures(
    baseUrl,
    student.cookie,
    fixture.hotSheet.courseId || catalog?.[0]?.courses?.[0]?.id,
  )

  const mixedActors = [
    { name: student.username, cookie: student.cookie },
    { name: admin.username, cookie: admin.cookie },
  ]
  if (betaStudent) {
    mixedActors.push({ name: betaStudent.username, cookie: betaStudent.cookie })
  }

  const mixedActionSummary = await runSyntheticMixedActions({
    baseUrl,
    durationSeconds: mixedActionDurationSeconds,
    seed: mixedActionSeed,
    actors: mixedActors,
    courseId: fixture.hotSheet.courseId || catalog?.[0]?.courses?.[0]?.id,
    sheetIds: [fixture.hotSheet.id],
    postIds: [...feedFixture.postIds],
    allowRateLimited,
  })

  console.log(`Load-test student account ${student.created ? '(created now)' : '(reused)'}`)
  console.log(`Hot sheet: #${fixture.hotSheet.id} "${fixture.hotSheet.title}"`)
  console.log(`Fixture sheets available: ${fixture.sheetCount}`)
  console.log(`Student notifications available: ${engagement.notificationCount}`)
  console.log(
    `Synthetic mixed actions: ${mixedActionSummary.totalActions} actions, ` +
    `${mixedActionSummary.failures} failures, ${mixedActionSummary.throttled} throttled, seed ${mixedActionSummary.seed}`,
  )
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
          name: 'student-feed',
          url: `${baseUrl}/api/feed?limit=12`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(15, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'student-dashboard-summary',
          url: `${baseUrl}/api/dashboard/summary`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(12, connectionScale),
          duration: durationSeconds,
        },
        {
          name: 'student-sheet-detail',
          url: `${baseUrl}/api/sheets/${fixture.hotSheet.id}`,
          headers: { cookie: student.cookie },
          connections: scaledConnections(10, connectionScale),
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
          name: 'admin-overview',
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
    const result = await runWave(wave, allowRateLimited)
    waveResults.push(result)

    for (const scenario of result.scenarios) {
      console.log(
        `${scenario.name}: ${scenario.requestsPerSecond} req/s avg, ` +
        `p99 ${scenario.p99LatencyMs}ms, failures ${scenario.effectiveFailures}, throttled ${scenario.throttled429}`
      )
    }
  }

  const report = {
    baseUrl,
    durationSeconds,
    connectionScale,
    allowRateLimited,
    fixture: {
      studentAccountState: student.created ? 'created-now' : 'reused',
      sheetCount: fixture.sheetCount,
      hotSheetId: fixture.hotSheet.id,
      hotSheetTitle: fixture.hotSheet.title,
      notificationCount: engagement.notificationCount,
      unreadCount: engagement.unreadCount,
    },
    mixedActionSummary,
    waves: waveResults,
  }

  const performanceBudgets = {
    'student-dashboard-summary': toPositiveNumber(process.env.LOAD_BUDGET_DASHBOARD_MS, 300),
    'student-feed': toPositiveNumber(process.env.LOAD_BUDGET_FEED_MS, 600),
    'admin-overview': toPositiveNumber(process.env.LOAD_BUDGET_ADMIN_MS, 500),
  }

  const budgetFailures = waveResults
    .flatMap((wave) => wave.scenarios)
    .filter((scenario) => {
      const budgetMs = performanceBudgets[scenario.name]
      return budgetMs && scenario.p95LatencyMs > budgetMs
    })
    .map((scenario) => ({
      scenario: scenario.name,
      budgetMs: performanceBudgets[scenario.name],
      actualP95Ms: scenario.p95LatencyMs,
    }))

  report.budgetFailures = budgetFailures

  console.log('\nFinal load-test report:')
  console.log(JSON.stringify(report, null, 2))

  await writeReportIfRequested(report)

  const totalFailures = waveResults.reduce((sum, wave) => sum + wave.totalFailures, 0)
  if (totalFailures > 0 || budgetFailures.length > 0) {
    process.exitCode = 1
  }

  if (mixedActionSummary.failures > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

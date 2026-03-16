const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractCookie(response) {
  const rawCookie = response.headers.get('set-cookie')
  return rawCookie ? rawCookie.split(';')[0] : ''
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Retry until the child backend is ready.
    }

    await delay(500)
  }

  throw new Error(`Server did not start in time at ${url}.`)
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const backendDir = repoRoot
  const port = process.env.SMOKE_PORT || '4010'
  const baseUrl = `http://127.0.0.1:${port}`
  const outputLog = path.join(repoRoot, '..', 'backend-smoke.out.log')
  const errorLog = path.join(repoRoot, '..', 'backend-smoke.err.log')

  try {
    fs.unlinkSync(outputLog)
  } catch {}

  try {
    fs.unlinkSync(errorLog)
  } catch {}

  const child = spawn('node', ['src/index.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: port,
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => fs.appendFileSync(outputLog, chunk))
  child.stderr.on('data', (chunk) => fs.appendFileSync(errorLog, chunk))

  try {
    await waitForServer(`${baseUrl}/`)

    const results = []

    async function check(name, action) {
      try {
        const value = await action()
        results.push({ name, ok: true, value })
      } catch (error) {
        results.push({ name, ok: false, value: error.message })
      }
    }

    await check('root-health', async () => {
      const response = await fetch(`${baseUrl}/`)
      return `${response.status} ${await response.text()}`
    })

    let catalog = []
    await check('schools-catalog', async () => {
      const response = await fetch(`${baseUrl}/api/courses/schools`)
      const data = await response.json()
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Catalog is empty.')
      }
      catalog = data
      return `${response.status} schools=${data.length} first=${data[0].short}`
    })

    await check('announcements-public', async () => {
      const response = await fetch(`${baseUrl}/api/announcements`)
      const data = await response.json()
      if (!Array.isArray(data)) {
        throw new Error('Announcements payload was not an array.')
      }
      return `${response.status} count=${data.length}`
    })

    await check('sheets-public', async () => {
      const response = await fetch(`${baseUrl}/api/sheets`)
      const data = await response.json()
      if (!data || !Array.isArray(data.sheets)) {
        throw new Error('Sheets payload was malformed.')
      }
      return `${response.status} total=${data.total}`
    })

    const school = catalog[0]
    const courseIds = (school?.courses || []).slice(0, 2).map((course) => course.id)

    let studentCookie = ''
    let createdSheetId = null
    let adminCookie = ''

    await check('register-student', async () => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'newstudent1',
          password: 'Password1A',
          schoolId: school?.id || null,
          courseIds,
          customCourses: [],
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      studentCookie = extractCookie(response)
      return `${response.status} role=${data.user.role}`
    })

    await check('auth-me-student', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} ${data.username}/${data.role}`
    })

    await check('login-fake-user', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'nobody_here', password: 'Password1A' }),
      })
      const data = await response.json()
      if (response.status !== 401) {
        throw new Error(`Expected 401, got ${response.status}: ${JSON.stringify(data)}`)
      }
      return data.error
    })

    await check('login-admin', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: process.env.ADMIN_USERNAME || 'studyhub_owner',
          password: process.env.ADMIN_PASSWORD || 'AdminPass123',
        }),
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      adminCookie = extractCookie(response)
      if (!adminCookie) {
        throw new Error('Login did not return a session cookie.')
      }
      return `${response.status} role=${data.user.role}`
    })

    await check('create-sheet-student', async () => {
      const response = await fetch(`${baseUrl}/api/sheets`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({
          title: 'Smoke Test Sheet',
          description: 'Created during backend smoke test.',
          content: '# Smoke Test\n\nThis verifies the create-sheet route.',
          courseId: courseIds[0],
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      createdSheetId = data.id
      return `${response.status} sheetId=${data.id}`
    })

    await check('get-sheet-single', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} title=${data.title}`
    })

    await check('leaderboard-stars', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/leaderboard?type=stars`)
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data)) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} entries=${data.length}`
    })

    await check('auth-me-admin', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} ${data.username}/${data.role}`
    })

    await check('admin-stats', async () => {
      const response = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} users=${data.totalUsers} sheets=${data.totalSheets}`
    })

    await check('comment-sheet-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/comments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ content: 'Admin comment from smoke test.' }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} commentId=${data.id}`
    })

    await check('star-sheet-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/star`, {
        method: 'POST',
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} starred=${data.starred} stars=${data.stars}`
    })

    await check('react-sheet-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/react`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ type: 'like' }),
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} likes=${data.likes}`
    })

    await check('download-sheet-public', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/download`, {
        method: 'POST',
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} downloads=${data.downloads}`
    })

    await check('create-announcement-admin', async () => {
      const response = await fetch(`${baseUrl}/api/announcements`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({
          title: 'Smoke Test Announcement',
          body: 'Created during automated backend verification.',
          pinned: true,
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} announcementId=${data.id}`
    })

    await check('announcements-public-after-create', async () => {
      const response = await fetch(`${baseUrl}/api/announcements`)
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data) || data.length === 0) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} count=${data.length}`
    })

    await check('user-profile-public', async () => {
      const response = await fetch(`${baseUrl}/api/users/newstudent1`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} sheets=${data.sheetCount}`
    })

    await check('follow-student-admin', async () => {
      const response = await fetch(`${baseUrl}/api/users/newstudent1/follow`, {
        method: 'POST',
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} following=${data.following}`
    })

    await check('request-course-student', async () => {
      const response = await fetch(`${baseUrl}/api/courses/request`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({
          schoolId: school.id,
          name: 'Quantum Basket Weaving',
          code: 'QBW101',
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} flagged=${data.request.flagged}`
    })

    await check('notes-index', async () => {
      const response = await fetch(`${baseUrl}/api/notes`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data)) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} count=${data.length}`
    })

    await check('notifications-index', async () => {
      const response = await fetch(`${baseUrl}/api/notifications?limit=15`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data.notifications)) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} total=${data.total}`
    })

    await check('notifications-student', async () => {
      const response = await fetch(`${baseUrl}/api/notifications?limit=15`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data.notifications)) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} total=${data.total} unread=${data.unreadCount}`
    })

    console.log(JSON.stringify(results, null, 2))
  } finally {
    child.kill('SIGTERM')
    await delay(800)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

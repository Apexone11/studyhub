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

function extractSixDigitCode(text) {
  const match = String(text || '').match(/\b(\d{6})\b/)
  if (!match) {
    throw new Error('Could not find a 6-digit code in the captured email.')
  }

  return match[1]
}

function uploadUrlToLocalPath(uploadRootDir, uploadUrl) {
  if (!uploadUrl || !String(uploadUrl).startsWith('/uploads/')) {
    throw new Error(`Unsupported upload URL: ${uploadUrl}`)
  }

  return path.join(uploadRootDir, String(uploadUrl).replace('/uploads/', ''))
}

async function waitForCapturedEmail(captureDir, kind, recipient) {
  const normalizedRecipient = String(recipient || '').toLowerCase()

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (fs.existsSync(captureDir)) {
      const matchingFile = fs.readdirSync(captureDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.join(captureDir, file))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
        .find((filePath) => {
          try {
            const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
            return payload.kind === kind && String(payload.to || '').toLowerCase() === normalizedRecipient
          } catch {
            return false
          }
        })

      if (matchingFile) {
        return JSON.parse(fs.readFileSync(matchingFile, 'utf8'))
      }
    }

    await delay(250)
  }

  throw new Error(`No captured ${kind} email was found for ${recipient}.`)
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
  const adminUsername = process.env.ADMIN_USERNAME || 'studyhub_owner'
  const outputLog = path.join(repoRoot, '..', 'backend-smoke.out.log')
  const errorLog = path.join(repoRoot, '..', 'backend-smoke.err.log')
  const emailCaptureDir = path.join(repoRoot, '..', '.tmp-email-capture')
  const uploadRootDir = path.join(repoRoot, '..', 'tmp-uploads-smoke')
  const smokeId = Date.now().toString(36).slice(-8)
  const studentUsername = `smoke_${smokeId}`
  const studentPassword = 'Password1A'
  const studentEmail = `${studentUsername}@example.com`

  try {
    fs.unlinkSync(outputLog)
  } catch {}

  try {
    fs.unlinkSync(errorLog)
  } catch {}

  try {
    fs.rmSync(emailCaptureDir, { recursive: true, force: true })
  } catch {}

  try {
    fs.rmSync(uploadRootDir, { recursive: true, force: true })
  } catch {}

  const child = spawn('node', ['src/index.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: port,
      NODE_ENV: process.env.NODE_ENV || 'production',
      EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT || 'json',
      EMAIL_CAPTURE_DIR: process.env.EMAIL_CAPTURE_DIR || emailCaptureDir,
      UPLOADS_DIR: process.env.UPLOADS_DIR || uploadRootDir,
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

    function requireCatalog() {
      if (!catalog.length) {
        throw new Error('Prerequisite failed: schools-catalog did not return any schools.')
      }
      return catalog[0]
    }

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

    let studentCookie = ''
    let createdSheetId = null
    let forkedSheetId = null
    let contributionId = null
    let feedPostId = null
    let lockedPostId = null
    let adminCookie = ''
    let emailVerificationCode = ''
    let twoFactorCode = ''
    let sheetAttachmentPath = ''
    let lockedPostAttachmentPath = ''

    await check('register-student', async () => {
      const school = requireCatalog()
      const courseIds = (school.courses || []).slice(0, 2).map((course) => course.id)
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: studentUsername,
          password: studentPassword,
          schoolId: school.id,
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

    await check('update-student-email', async () => {
      const response = await fetch(`${baseUrl}/api/settings/email`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({
          email: studentEmail,
          password: studentPassword,
        }),
      })
      const data = await response.json()
      if (response.status !== 200 || !data.verificationRequired) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} verificationRequired=${data.verificationRequired}`
    })

    await check('capture-email-verification', async () => {
      const capturedEmail = await waitForCapturedEmail(emailCaptureDir, 'email-verification', studentEmail)
      emailVerificationCode = extractSixDigitCode(`${capturedEmail.text}\n${capturedEmail.html}`)
      return `code=${emailVerificationCode}`
    })

    await check('verify-student-email', async () => {
      const response = await fetch(`${baseUrl}/api/settings/email/verify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({ code: emailVerificationCode }),
      })
      const data = await response.json()
      if (response.status !== 200 || data.user?.emailVerified !== true) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} emailVerified=${data.user.emailVerified}`
    })

    await check('enable-student-2fa', async () => {
      const response = await fetch(`${baseUrl}/api/settings/2fa/enable`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({ password: studentPassword }),
      })
      const data = await response.json()
      if (response.status !== 200 || data.twoFaEnabled !== true) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} twoFaEnabled=${data.twoFaEnabled}`
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

    await check('login-student-2fa-start', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: studentUsername,
          password: studentPassword,
        }),
      })
      const data = await response.json()
      if (response.status !== 200 || !data.requires2fa) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} hint=${data.deliveryHint || 'none'}`
    })

    await check('capture-2fa-email', async () => {
      const capturedEmail = await waitForCapturedEmail(emailCaptureDir, 'two-factor', studentEmail)
      twoFactorCode = extractSixDigitCode(`${capturedEmail.text}\n${capturedEmail.html}`)
      return `code=${twoFactorCode}`
    })

    await check('verify-student-2fa', async () => {
      const response = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: studentUsername,
          code: twoFactorCode,
        }),
      })
      const data = await response.json()
      if (response.status !== 200 || !data.user?.twoFaEnabled) {
        throw new Error(JSON.stringify(data))
      }
      studentCookie = extractCookie(response) || studentCookie
      return `${response.status} twoFaEnabled=${data.user.twoFaEnabled}`
    })

    await check('forgot-password-verified-email', async () => {
      const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: studentUsername }),
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      const capturedEmail = await waitForCapturedEmail(emailCaptureDir, 'password-reset', studentEmail)
      return `${response.status} subject=${capturedEmail.subject}`
    })

    await check('login-admin', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername,
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
      const school = requireCatalog()
      const courseIds = (school.courses || []).slice(0, 2).map((course) => course.id)
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

    await check('upload-sheet-attachment-student', async () => {
      const formData = new FormData()
      formData.append('attachment', new Blob(['%PDF-1.4 sheet smoke test'], { type: 'application/pdf' }), 'smoke-sheet.pdf')

      const response = await fetch(`${baseUrl}/api/upload/attachment/${createdSheetId}`, {
        method: 'POST',
        headers: { cookie: studentCookie },
        body: formData,
      })
      const data = await response.json()
      if (response.status !== 200 || !data.attachmentUrl) {
        throw new Error(JSON.stringify(data))
      }

      sheetAttachmentPath = uploadUrlToLocalPath(uploadRootDir, data.attachmentUrl)
      if (!sheetAttachmentPath.startsWith(uploadRootDir)) {
        throw new Error(`Attachment was stored outside the configured upload root: ${sheetAttachmentPath}`)
      }
      if (!fs.existsSync(sheetAttachmentPath)) {
        throw new Error(`Attachment file was not created at ${sheetAttachmentPath}`)
      }

      return `${response.status} attachment=${path.basename(sheetAttachmentPath)}`
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

    await check('download-sheet-attachment', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/attachment`)
      if (response.status !== 200) {
        throw new Error(await response.text())
      }

      const contentDisposition = response.headers.get('content-disposition') || ''
      if (!contentDisposition.toLowerCase().includes('attachment')) {
        throw new Error(`Unexpected content-disposition header: ${contentDisposition}`)
      }

      const attachmentBytes = Buffer.from(await response.arrayBuffer())
      if (attachmentBytes.length === 0) {
        throw new Error('Downloaded attachment was empty.')
      }

      return `${response.status} bytes=${attachmentBytes.length}`
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

    await check('create-feed-post-student', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({
          content: `Smoke test post for @${adminUsername}`,
          allowDownloads: true,
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      feedPostId = data.id
      return `${response.status} postId=${feedPostId}`
    })

    await check('feed-index-student', async () => {
      const response = await fetch(`${baseUrl}/api/feed?limit=10`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data.items)) {
        throw new Error(JSON.stringify(data))
      }
      const hasCreatedPost = data.items.some((item) => item.type === 'post' && item.id === feedPostId)
      if (!hasCreatedPost) {
        throw new Error('Created feed post was not returned in the feed index.')
      }
      return `${response.status} items=${data.items.length}`
    })

    await check('admin-mention-notification', async () => {
      const response = await fetch(`${baseUrl}/api/notifications?limit=20`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data.notifications)) {
        throw new Error(JSON.stringify(data))
      }
      const mention = data.notifications.find((notif) => notif.type === 'mention' && notif.linkPath === `/feed?post=${feedPostId}`)
      if (!mention) {
        throw new Error('Could not find the expected mention notification for the admin user.')
      }
      return `notificationId=${mention.id}`
    })

    await check('create-locked-post-student', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({
          content: 'Locked attachment post.',
          allowDownloads: false,
        }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      lockedPostId = data.id
      return `${response.status} postId=${lockedPostId}`
    })

    await check('upload-locked-post-attachment', async () => {
      const formData = new FormData()
      formData.append('attachment', new Blob(['%PDF-1.4 smoke test'], { type: 'application/pdf' }), 'locked-post.pdf')
      const response = await fetch(`${baseUrl}/api/upload/post-attachment/${lockedPostId}`, {
        method: 'POST',
        headers: { cookie: studentCookie },
        body: formData,
      })
      const data = await response.json()
      if (response.status !== 200 || !data.attachmentName) {
        throw new Error(JSON.stringify(data))
      }
      lockedPostAttachmentPath = uploadUrlToLocalPath(uploadRootDir, data.attachmentUrl)
      if (!fs.existsSync(lockedPostAttachmentPath)) {
        throw new Error(`Locked post attachment file was not created at ${lockedPostAttachmentPath}`)
      }
      return `${response.status} attachment=${data.attachmentName}`
    })

    await check('locked-post-attachment-blocked', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts/${lockedPostId}/attachment`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 403) {
        throw new Error(`Expected 403, got ${response.status}: ${JSON.stringify(data)}`)
      }
      return data.error
    })

    await check('delete-locked-post-student', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts/${lockedPostId}`, {
        method: 'DELETE',
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return data.message
    })

    await check('locked-post-attachment-cleaned-up', async () => {
      if (fs.existsSync(lockedPostAttachmentPath)) {
        throw new Error(`Locked post attachment still exists at ${lockedPostAttachmentPath}`)
      }
      return 'attachment removed'
    })

    await check('comment-feed-post-admin', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts/${feedPostId}/comments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ content: `Admin reply to @${studentUsername} on the feed post.` }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} commentId=${data.id}`
    })

    await check('react-feed-post-admin', async () => {
      const response = await fetch(`${baseUrl}/api/feed/posts/${feedPostId}/react`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ type: 'like' }),
      })
      const data = await response.json()
      if (response.status !== 200 || typeof data.likes !== 'number') {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} likes=${data.likes}`
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

    await check('fork-sheet-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/fork`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ title: 'Smoke Fork Sheet' }),
      })
      const data = await response.json()
      if (response.status !== 201) {
        throw new Error(JSON.stringify(data))
      }
      forkedSheetId = data.id
      return `${response.status} forkId=${forkedSheetId}`
    })

    await check('edit-fork-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${forkedSheetId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({
          content: '# Smoke Fork Update\n\nFork edited before contribution.',
          description: 'Fork updated during smoke test.',
          allowDownloads: false,
        }),
      })
      const data = await response.json()
      if (response.status !== 200 || data.allowDownloads !== false) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} allowDownloads=${data.allowDownloads}`
    })

    await check('submit-contribution-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${forkedSheetId}/contributions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ message: 'Improved the fork before contributing back.' }),
      })
      const data = await response.json()
      if (response.status !== 201 || !data.contribution?.id) {
        throw new Error(JSON.stringify(data))
      }
      contributionId = data.contribution.id
      return `${response.status} contributionId=${contributionId}`
    })

    await check('incoming-contribution-student', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || !Array.isArray(data.incomingContributions)) {
        throw new Error(JSON.stringify(data))
      }
      const match = data.incomingContributions.find((contribution) => contribution.id === contributionId)
      if (!match) {
        throw new Error('Expected incoming contribution was not returned on the original sheet.')
      }
      return `incoming=${data.incomingContributions.length}`
    })

    await check('accept-contribution-student', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({ action: 'accept' }),
      })
      const data = await response.json()
      if (response.status !== 200 || data.contribution?.status !== 'accepted') {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} status=${data.contribution.status}`
    })

    await check('download-sheet-public', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/download`)
      const data = await response.json()
      if (response.status !== 403) {
        throw new Error(`Expected 403, got ${response.status}: ${JSON.stringify(data)}`)
      }
      return data.error
    })

    await check('sheet-after-accepted-contribution', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}`, {
        headers: { cookie: studentCookie },
      })
      const data = await response.json()
      if (response.status !== 200 || data.allowDownloads !== false || !String(data.content || '').includes('Smoke Fork Update')) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} allowDownloads=${data.allowDownloads}`
    })

    await check('remove-sheet-attachment-student', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: studentCookie,
        },
        body: JSON.stringify({ removeAttachment: true }),
      })
      const data = await response.json()
      if (response.status !== 200 || data.hasAttachment !== false) {
        throw new Error(JSON.stringify(data))
      }
      if (!fs.existsSync(sheetAttachmentPath)) {
        throw new Error('Shared attachment was removed even though the fork still references it.')
      }
      return `${response.status} hasAttachment=${data.hasAttachment}`
    })

    await check('sheet-attachment-removed-from-original', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${createdSheetId}/attachment`)
      const data = await response.json()
      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}: ${JSON.stringify(data)}`)
      }
      return data.error
    })

    await check('delete-fork-admin', async () => {
      const response = await fetch(`${baseUrl}/api/sheets/${forkedSheetId}`, {
        method: 'DELETE',
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return data.message
    })

    await check('sheet-attachment-cleaned-up-after-last-reference', async () => {
      if (fs.existsSync(sheetAttachmentPath)) {
        throw new Error(`Sheet attachment still exists at ${sheetAttachmentPath}`)
      }
      return 'attachment removed'
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
      const response = await fetch(`${baseUrl}/api/users/${studentUsername}`, {
        headers: { cookie: adminCookie },
      })
      const data = await response.json()
      if (response.status !== 200) {
        throw new Error(JSON.stringify(data))
      }
      return `${response.status} sheets=${data.sheetCount}`
    })

    await check('follow-student-admin', async () => {
      const response = await fetch(`${baseUrl}/api/users/${studentUsername}/follow`, {
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
      const school = requireCatalog()
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
      const hasPostNotification = data.notifications.some((notification) => notification.linkPath === `/feed?post=${feedPostId}`)
      if (!hasPostNotification) {
        throw new Error('Expected a feed notification with a feed linkPath for the student user.')
      }
      return `${response.status} total=${data.total} unread=${data.unreadCount}`
    })

    await check('live-burst-feed-read-model', async () => {
      const responses = await Promise.all([
        ...Array.from({ length: 3 }, () => fetch(`${baseUrl}/api/auth/me`, {
          headers: { cookie: studentCookie },
        })),
        ...Array.from({ length: 3 }, () => fetch(`${baseUrl}/api/feed?limit=8`, {
          headers: { cookie: studentCookie },
        })),
        ...Array.from({ length: 3 }, () => fetch(`${baseUrl}/api/sheets?limit=5`, {
          headers: { cookie: studentCookie },
        })),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/sheets/leaderboard?type=stars`)),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/sheets/leaderboard?type=downloads`)),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/sheets/leaderboard?type=contributors`)),
      ])

      const payloads = await Promise.all(responses.map(async (response, index) => {
        if (!response.ok) {
          throw new Error(`Feed burst request ${index + 1} failed with ${response.status}.`)
        }
        return response.json()
      }))

      for (const payload of payloads.slice(0, 3)) {
        if (!payload?.username) {
          throw new Error('Feed burst auth payload was malformed.')
        }
      }
      for (const payload of payloads.slice(3, 6)) {
        if (!Array.isArray(payload?.items)) {
          throw new Error('Feed burst feed payload was malformed.')
        }
      }
      for (const payload of payloads.slice(6, 9)) {
        if (!Array.isArray(payload?.sheets)) {
          throw new Error('Feed burst sheets payload was malformed.')
        }
      }
      for (const payload of payloads.slice(9)) {
        if (!Array.isArray(payload)) {
          throw new Error('Feed burst leaderboard payload was malformed.')
        }
      }

      return `requests=${responses.length}`
    })

    await check('live-burst-admin-read-model', async () => {
      const responses = await Promise.all([
        ...Array.from({ length: 3 }, () => fetch(`${baseUrl}/api/admin/stats`, {
          headers: { cookie: adminCookie },
        })),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/admin/users?page=1`, {
          headers: { cookie: adminCookie },
        })),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/admin/sheets?page=1`, {
          headers: { cookie: adminCookie },
        })),
        ...Array.from({ length: 2 }, () => fetch(`${baseUrl}/api/admin/announcements?page=1`, {
          headers: { cookie: adminCookie },
        })),
      ])

      const payloads = await Promise.all(responses.map(async (response, index) => {
        if (!response.ok) {
          throw new Error(`Admin burst request ${index + 1} failed with ${response.status}.`)
        }
        return response.json()
      }))

      for (const payload of payloads.slice(0, 3)) {
        if (typeof payload?.totalUsers !== 'number') {
          throw new Error('Admin burst stats payload was malformed.')
        }
      }
      for (const payload of payloads.slice(3, 5)) {
        if (!Array.isArray(payload?.users)) {
          throw new Error('Admin burst users payload was malformed.')
        }
      }
      for (const payload of payloads.slice(5, 7)) {
        if (!Array.isArray(payload?.sheets)) {
          throw new Error('Admin burst sheets payload was malformed.')
        }
      }
      for (const payload of payloads.slice(7)) {
        if (!Array.isArray(payload?.announcements)) {
          throw new Error('Admin burst announcements payload was malformed.')
        }
      }

      return `requests=${responses.length}`
    })

    await check('live-burst-comments-and-notifications', async () => {
      const responses = await Promise.all([
        ...Array.from({ length: 4 }, () => fetch(`${baseUrl}/api/sheets/${createdSheetId}/comments`)),
        ...Array.from({ length: 4 }, () => fetch(`${baseUrl}/api/feed/posts/${feedPostId}/comments`, {
          headers: { cookie: studentCookie },
        })),
        ...Array.from({ length: 4 }, () => fetch(`${baseUrl}/api/notifications?limit=15`, {
          headers: { cookie: studentCookie },
        })),
        ...Array.from({ length: 4 }, () => fetch(`${baseUrl}/api/announcements`)),
      ])

      const payloads = await Promise.all(responses.map(async (response, index) => {
        if (!response.ok) {
          throw new Error(`Live burst request ${index + 1} failed with ${response.status}.`)
        }
        return response.json()
      }))

      for (const payload of payloads.slice(0, 4)) {
        if (!Array.isArray(payload?.comments)) {
          throw new Error('Comments burst payload was malformed.')
        }
      }
      for (const payload of payloads.slice(4, 8)) {
        if (!Array.isArray(payload?.comments)) {
          throw new Error('Feed post comments burst payload was malformed.')
        }
      }
      for (const payload of payloads.slice(8, 12)) {
        if (!Array.isArray(payload?.notifications)) {
          throw new Error('Notifications burst payload was malformed.')
        }
      }
      for (const payload of payloads.slice(12)) {
        if (!Array.isArray(payload)) {
          throw new Error('Announcements burst payload was malformed.')
        }
      }

      return `requests=${responses.length}`
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

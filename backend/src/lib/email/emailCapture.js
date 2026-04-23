const fs = require('node:fs/promises')
const path = require('node:path')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractVerificationCode(message = {}) {
  const haystack = [message.text, message.html].filter(Boolean).join('\n')
  const match = haystack.match(/\b(\d{6})\b/)
  return match ? match[1] : ''
}

function recipientMatches(message, toEmail) {
  if (!toEmail) return true
  const normalizedRecipient = String(toEmail).trim().toLowerCase()
  return String(message.to || '')
    .trim()
    .toLowerCase()
    .includes(normalizedRecipient)
}

function subjectMatches(message, subjectIncludes) {
  if (!subjectIncludes) return true
  const subjects = Array.isArray(subjectIncludes) ? subjectIncludes : [subjectIncludes]
  const normalizedSubject = String(message.subject || '').toLowerCase()
  return subjects.every((value) => normalizedSubject.includes(String(value).toLowerCase()))
}

async function readCapturedEmails(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .reverse()

  const messages = []

  for (const fileName of files) {
    try {
      const filePath = path.join(directory, fileName)
      const raw = await fs.readFile(filePath, 'utf8')
      messages.push({
        fileName,
        createdAtMs: Number.parseInt(fileName, 10) || 0,
        ...JSON.parse(raw),
      })
    } catch {
      // Skip malformed capture files.
    }
  }

  return messages
}

async function findLatestCapturedEmail({ directory, toEmail, subjectIncludes, afterTimeMs = 0 }) {
  const messages = await readCapturedEmails(directory)
  return (
    messages.find(
      (message) =>
        message.createdAtMs >= afterTimeMs &&
        recipientMatches(message, toEmail) &&
        subjectMatches(message, subjectIncludes),
    ) || null
  )
}

async function waitForCapturedVerificationCode({
  directory,
  toEmail,
  subjectIncludes = 'Verify your StudyHub email',
  afterTimeMs = 0,
  timeoutMs = 15000,
  pollIntervalMs = 250,
}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const message = await findLatestCapturedEmail({
      directory,
      toEmail,
      subjectIncludes,
      afterTimeMs,
    })

    const code = extractVerificationCode(message)
    if (code) return code

    await delay(pollIntervalMs)
  }

  throw new Error(`Timed out waiting for a captured verification code for ${toEmail}.`)
}

module.exports = {
  extractVerificationCode,
  findLatestCapturedEmail,
  readCapturedEmails,
  waitForCapturedVerificationCode,
}

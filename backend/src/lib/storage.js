const fs = require('node:fs')
const path = require('node:path')
const { captureError } = require('../monitoring/sentry')

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads')
const UPLOADS_URL_PREFIX = '/uploads'

function resolveUploadsDir(candidate) {
  if (!candidate) return DEFAULT_UPLOADS_DIR
  return path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.resolve(BACKEND_ROOT, candidate)
}

const UPLOADS_DIR = resolveUploadsDir(process.env.UPLOADS_DIR)
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
const ATTACHMENTS_DIR = path.join(UPLOADS_DIR, 'attachments')

function ensureUploadDirectories() {
  for (const directory of [UPLOADS_DIR, AVATARS_DIR, ATTACHMENTS_DIR]) {
    fs.mkdirSync(directory, { recursive: true })
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK)
  }
}

function validateUploadStorage() {
  const allowEphemeralUploads = process.env.ALLOW_EPHEMERAL_UPLOADS === 'true'

  if (process.env.NODE_ENV === 'production' && !process.env.UPLOADS_DIR && !allowEphemeralUploads) {
    throw new Error(
      'UPLOADS_DIR must point to persistent storage in production. Set UPLOADS_DIR to a mounted volume path such as /data/uploads, or explicitly set ALLOW_EPHEMERAL_UPLOADS=true for non-persistent environments.'
    )
  }

  ensureUploadDirectories()

  const storageMode = process.env.UPLOADS_DIR
    ? 'configured'
    : allowEphemeralUploads
      ? 'ephemeral-opt-in'
      : 'default-local'

  console.log(`Upload storage ready at ${UPLOADS_DIR} (${storageMode}).`)
}

function buildUploadUrl(kind, fileName) {
  return `${UPLOADS_URL_PREFIX}/${kind}/${fileName}`
}

function buildAvatarUrl(fileName) {
  return buildUploadUrl('avatars', fileName)
}

function buildAttachmentUrl(fileName) {
  return buildUploadUrl('attachments', fileName)
}

function resolveManagedUploadPath(uploadUrl) {
  const normalizedUrl = String(uploadUrl || '')
  const prefixes = [
    { prefix: `${UPLOADS_URL_PREFIX}/avatars/`, directory: AVATARS_DIR },
    { prefix: `${UPLOADS_URL_PREFIX}/attachments/`, directory: ATTACHMENTS_DIR },
  ]

  for (const entry of prefixes) {
    if (!normalizedUrl.startsWith(entry.prefix)) continue

    const fileName = normalizedUrl.slice(entry.prefix.length)
    if (!fileName) return null

    const resolved = path.resolve(entry.directory, fileName)
    const expectedRoot = `${path.resolve(entry.directory)}${path.sep}`
    if (resolved !== path.resolve(entry.directory) && !resolved.startsWith(expectedRoot)) {
      return null
    }

    return resolved
  }

  return null
}

function resolveAvatarPath(avatarUrl) {
  if (!String(avatarUrl || '').startsWith(`${UPLOADS_URL_PREFIX}/avatars/`)) return null
  return resolveManagedUploadPath(avatarUrl)
}

function resolveAttachmentPath(attachmentUrl) {
  if (!String(attachmentUrl || '').startsWith(`${UPLOADS_URL_PREFIX}/attachments/`)) return null
  return resolveManagedUploadPath(attachmentUrl)
}

function safeUnlinkFile(filePath) {
  if (!filePath) return false

  try {
    if (!fs.existsSync(filePath)) return false
    fs.unlinkSync(filePath)
    return true
  } catch (error) {
    captureError(error, { source: 'safeUnlinkFile', filePath })
    return false
  }
}

async function deleteAttachmentIfUnused(prisma, attachmentUrl) {
  const resolvedPath = resolveAttachmentPath(attachmentUrl)
  if (!resolvedPath) return false

  const [sheetRefs, postRefs] = await Promise.all([
    prisma.studySheet.count({ where: { attachmentUrl } }),
    prisma.feedPost.count({ where: { attachmentUrl } }),
  ])

  if (sheetRefs > 0 || postRefs > 0) return false
  return safeUnlinkFile(resolvedPath)
}

async function deleteAvatarIfUnused(prisma, avatarUrl) {
  const resolvedPath = resolveAvatarPath(avatarUrl)
  if (!resolvedPath) return false

  const refs = await prisma.user.count({ where: { avatarUrl } })
  if (refs > 0) return false

  return safeUnlinkFile(resolvedPath)
}

async function cleanupAttachmentIfUnused(prisma, attachmentUrl, context = {}) {
  try {
    return await deleteAttachmentIfUnused(prisma, attachmentUrl)
  } catch (error) {
    captureError(error, {
      source: 'cleanupAttachmentIfUnused',
      attachmentUrl,
      ...context,
    })
    return false
  }
}

async function cleanupAvatarIfUnused(prisma, avatarUrl, context = {}) {
  try {
    return await deleteAvatarIfUnused(prisma, avatarUrl)
  } catch (error) {
    captureError(error, {
      source: 'cleanupAvatarIfUnused',
      avatarUrl,
      ...context,
    })
    return false
  }
}

module.exports = {
  ATTACHMENTS_DIR,
  AVATARS_DIR,
  UPLOADS_DIR,
  buildAttachmentUrl,
  buildAvatarUrl,
  cleanupAttachmentIfUnused,
  cleanupAvatarIfUnused,
  ensureUploadDirectories,
  resolveAttachmentPath,
  resolveAvatarPath,
  resolveManagedUploadPath,
  safeUnlinkFile,
  validateUploadStorage,
}

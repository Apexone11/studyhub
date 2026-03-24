const fs = require('node:fs')
const path = require('node:path')
const { captureError } = require('../monitoring/sentry')

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads')
const RAILWAY_VOLUME_ROOT = '/data'
const UPLOADS_URL_PREFIX = '/uploads'
const PRIVATE_ATTACHMENT_PREFIX = 'attachment://'

function detectPersistentUploadsDir() {
  if (process.platform === 'win32') return null
  if (process.env.NODE_ENV !== 'production') return null

  try {
    if (!fs.existsSync(RAILWAY_VOLUME_ROOT)) return null
    const stats = fs.statSync(RAILWAY_VOLUME_ROOT)
    if (!stats.isDirectory()) return null
    return path.join(RAILWAY_VOLUME_ROOT, 'uploads')
  } catch {
    return null
  }
}

function resolveUploadsDir(candidate) {
  if (!candidate) return DEFAULT_UPLOADS_DIR
  return path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.resolve(BACKEND_ROOT, candidate)
}

const autoDetectedUploadsDir = detectPersistentUploadsDir()
const UPLOADS_DIR = resolveUploadsDir(process.env.UPLOADS_DIR || autoDetectedUploadsDir)
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars')
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers')
const ATTACHMENTS_DIR = path.join(UPLOADS_DIR, 'attachments')

function ensureUploadDirectories() {
  for (const directory of [UPLOADS_DIR, AVATARS_DIR, COVERS_DIR, ATTACHMENTS_DIR]) {
    fs.mkdirSync(directory, { recursive: true })
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK)
  }
}

function validateUploadStorage() {
  const allowEphemeralUploads = process.env.ALLOW_EPHEMERAL_UPLOADS === 'true'
  const hasPersistentUploadsDir = Boolean(process.env.UPLOADS_DIR || autoDetectedUploadsDir)

  if (process.env.NODE_ENV === 'production' && !hasPersistentUploadsDir && !allowEphemeralUploads) {
    throw new Error(
      'UPLOADS_DIR must point to persistent storage in production. On Railway, attach a volume mounted at /data or set UPLOADS_DIR to a mounted volume path such as /data/uploads. For temporary non-persistent environments only, set ALLOW_EPHEMERAL_UPLOADS=true.'
    )
  }

  ensureUploadDirectories()

  const storageMode = process.env.UPLOADS_DIR
    ? 'configured'
    : autoDetectedUploadsDir
      ? 'auto-detected-persistent'
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

function buildCoverUrl(fileName) {
  return buildUploadUrl('covers', fileName)
}

function buildAttachmentUrl(fileName) {
  return `${PRIVATE_ATTACHMENT_PREFIX}${fileName}`
}

function isPathWithinRoot(candidatePath, rootDirectory) {
  const resolvedCandidate = path.resolve(candidatePath)
  const resolvedRoot = path.resolve(rootDirectory)
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  )
}

function isManagedLeafFileName(fileName) {
  const normalized = String(fileName || '')
  if (!normalized || normalized.includes('\0')) return false
  return normalized === path.basename(normalized)
}

function resolveManagedUploadPath(uploadUrl) {
  const normalizedUrl = String(uploadUrl || '')
  const prefixes = [
    { prefix: `${UPLOADS_URL_PREFIX}/avatars/`, directory: AVATARS_DIR },
    { prefix: `${UPLOADS_URL_PREFIX}/covers/`, directory: COVERS_DIR },
    { prefix: `${UPLOADS_URL_PREFIX}/attachments/`, directory: ATTACHMENTS_DIR },
    { prefix: PRIVATE_ATTACHMENT_PREFIX, directory: ATTACHMENTS_DIR },
  ]

  for (const entry of prefixes) {
    if (!normalizedUrl.startsWith(entry.prefix)) continue

    const fileName = normalizedUrl.slice(entry.prefix.length)
    if (!isManagedLeafFileName(fileName)) return null

    const resolved = path.resolve(entry.directory, fileName)
    if (!isPathWithinRoot(resolved, entry.directory) || resolved === path.resolve(entry.directory)) {
      return null
    }

    return resolved
  }

  return null
}

function resolveCoverPath(coverUrl) {
  if (!String(coverUrl || '').startsWith(`${UPLOADS_URL_PREFIX}/covers/`)) return null
  return resolveManagedUploadPath(coverUrl)
}

function resolveAvatarPath(avatarUrl) {
  if (!String(avatarUrl || '').startsWith(`${UPLOADS_URL_PREFIX}/avatars/`)) return null
  return resolveManagedUploadPath(avatarUrl)
}

function resolveAttachmentPath(attachmentUrl) {
  const normalizedUrl = String(attachmentUrl || '')
  if (
    !normalizedUrl.startsWith(`${UPLOADS_URL_PREFIX}/attachments/`)
    && !normalizedUrl.startsWith(PRIVATE_ATTACHMENT_PREFIX)
  ) {
    return null
  }
  return resolveManagedUploadPath(attachmentUrl)
}

function resolveManagedFilePath(filePath) {
  if (!filePath) return null

  const resolved = path.resolve(String(filePath))
  const managedRoots = [AVATARS_DIR, COVERS_DIR, ATTACHMENTS_DIR]
  const isManagedPath = managedRoots.some(
    (rootDirectory) => isPathWithinRoot(resolved, rootDirectory) && resolved !== path.resolve(rootDirectory)
  )
  if (!isManagedPath) {
    return null
  }

  if (!isManagedLeafFileName(path.basename(resolved))) return null
  return resolved
}

function safeUnlinkFile(filePath) {
  const resolvedPath = resolveManagedFilePath(filePath)
  if (!resolvedPath) return false

  try {
    if (!fs.existsSync(resolvedPath)) return false
    fs.unlinkSync(resolvedPath)
    return true
  } catch (error) {
    captureError(error, { source: 'safeUnlinkFile', filePath: resolvedPath })
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

async function deleteCoverIfUnused(prisma, coverUrl) {
  const resolvedPath = resolveCoverPath(coverUrl)
  if (!resolvedPath) return false

  const refs = await prisma.user.count({ where: { coverImageUrl: coverUrl } })
  if (refs > 0) return false

  return safeUnlinkFile(resolvedPath)
}

async function cleanupCoverIfUnused(prisma, coverUrl, context = {}) {
  try {
    return await deleteCoverIfUnused(prisma, coverUrl)
  } catch (error) {
    captureError(error, {
      source: 'cleanupCoverIfUnused',
      coverUrl,
      ...context,
    })
    return false
  }
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
  COVERS_DIR,
  PRIVATE_ATTACHMENT_PREFIX,
  UPLOADS_DIR,
  buildAttachmentUrl,
  buildAvatarUrl,
  buildCoverUrl,
  cleanupAttachmentIfUnused,
  cleanupAvatarIfUnused,
  cleanupCoverIfUnused,
  ensureUploadDirectories,
  resolveAttachmentPath,
  resolveAvatarPath,
  resolveCoverPath,
  resolveManagedUploadPath,
  safeUnlinkFile,
  validateUploadStorage,
}

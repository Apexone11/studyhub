const fs = require('node:fs')
const path = require('node:path')

let sharp = null

try {
  sharp = require('sharp')
} catch {
  sharp = null
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.xml',
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.log',
  '.ini',
  '.env',
])

const MIME_BY_EXTENSION = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.avif', 'image/avif'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.markdown', 'text/markdown; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.yaml', 'text/yaml; charset=utf-8'],
  ['.yml', 'text/yaml; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.jsx', 'application/javascript; charset=utf-8'],
  ['.ts', 'application/typescript; charset=utf-8'],
  ['.tsx', 'application/typescript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.log', 'text/plain; charset=utf-8'],
  ['.ini', 'text/plain; charset=utf-8'],
  ['.env', 'text/plain; charset=utf-8'],
])

const PREVIEW_IMAGE_MAX_SOURCE_BYTES = 1_250_000
const PREVIEW_IMAGE_MAX_DIMENSION = 1600
const PREVIEW_IMAGE_QUALITY = 72

function extensionOf(value) {
  return path.extname(String(value || '')).toLowerCase()
}

function inferPreviewMimeType(localPath, attachmentName = '', attachmentType = '') {
  const normalizedType = String(attachmentType || '').toLowerCase()
  const extension = extensionOf(attachmentName) || extensionOf(localPath)

  if (normalizedType === 'pdf') return 'application/pdf'
  if (normalizedType === 'image' && IMAGE_EXTENSIONS.has(extension)) {
    return MIME_BY_EXTENSION.get(extension) || 'image/jpeg'
  }

  if (MIME_BY_EXTENSION.has(extension)) {
    return MIME_BY_EXTENSION.get(extension)
  }

  if (IMAGE_EXTENSIONS.has(extension)) return 'image/jpeg'
  if (TEXT_EXTENSIONS.has(extension)) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

function previewKindForMime(mimeType = '') {
  const normalized = String(mimeType).toLowerCase()

  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('application/pdf')) return 'pdf'
  if (
    normalized.startsWith('text/') ||
    normalized.includes('json') ||
    normalized.includes('xml') ||
    normalized.includes('javascript') ||
    normalized.includes('typescript') ||
    normalized.includes('yaml')
  ) {
    return 'text'
  }
  return 'document'
}

function safeInlineName(name, fallback = 'attachment') {
  const sourceName = String(name || fallback)
  const ext = extensionOf(sourceName)
  const base =
    path
      .basename(sourceName, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 96) || fallback
  return `${base}${ext}`.toLowerCase()
}

async function trySendCompressedImagePreview(res, localPath) {
  if (!sharp) return false

  const sourceStats = fs.statSync(localPath)
  if (sourceStats.size <= PREVIEW_IMAGE_MAX_SOURCE_BYTES) return false

  const transformed = await sharp(localPath, { failOn: 'none' })
    .rotate()
    .resize({
      width: PREVIEW_IMAGE_MAX_DIMENSION,
      height: PREVIEW_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: PREVIEW_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer()

  if (!transformed || transformed.length >= sourceStats.size) return false

  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Content-Length', String(transformed.length))
  res.setHeader('X-StudyHub-Preview-Compressed', '1')
  res.send(transformed)
  return true
}

async function sendAttachmentPreview({ res, localPath, attachmentName, attachmentType }) {
  const mimeType = inferPreviewMimeType(localPath, attachmentName, attachmentType)
  const previewKind = previewKindForMime(mimeType)

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=120')
  res.setHeader('X-StudyHub-Preview-Kind', previewKind)
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${safeInlineName(attachmentName || path.basename(localPath))}"`,
  )

  if (previewKind === 'image') {
    try {
      const sentCompressed = await trySendCompressedImagePreview(res, localPath)
      if (sentCompressed) return
    } catch {
      // Fall back to the original file stream when transform fails.
    }
  }

  res.setHeader('Content-Type', mimeType)
  const stream = fs.createReadStream(localPath)
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not render attachment preview.' })
      return
    }
    res.destroy()
  })
  stream.pipe(res)
}

module.exports = {
  inferPreviewMimeType,
  previewKindForMime,
  sendAttachmentPreview,
}

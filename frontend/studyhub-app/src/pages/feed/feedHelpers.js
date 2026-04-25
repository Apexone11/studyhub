import { API } from '../../config'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'csv',
  'xml',
  'html',
  'htm',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'log',
  'ini',
  'env',
])

function attachmentExtension(name = '') {
  const dotIndex = String(name).lastIndexOf('.')
  if (dotIndex < 0) return ''
  return String(name)
    .slice(dotIndex + 1)
    .toLowerCase()
}

export function attachmentPreviewKind(item) {
  const rawType = String(item?.attachmentType || '').toLowerCase()
  const extension = attachmentExtension(item?.attachmentName)

  if (rawType === 'pdf' || extension === 'pdf') return 'pdf'
  if (rawType === 'image' || rawType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension))
    return 'image'
  if (
    TEXT_EXTENSIONS.has(extension) ||
    rawType.startsWith('text/') ||
    rawType.includes('json') ||
    rawType.includes('xml')
  ) {
    return 'text'
  }
  return 'document'
}

export function attachmentEndpoints(item) {
  if (!item?.hasAttachment) return null

  if (item.type === 'post') {
    return {
      previewUrl: `${API}/api/feed/posts/${item.id}/attachment/preview`,
      downloadUrl: `${API}/api/feed/posts/${item.id}/attachment`,
      fullPreviewPath: `/preview/feed-post/${item.id}`,
    }
  }

  if (item.type === 'sheet') {
    return {
      previewUrl: `${API}/api/sheets/${item.id}/attachment/preview`,
      downloadUrl: `${API}/api/sheets/${item.id}/attachment`,
      fullPreviewPath: `/preview/sheet/${item.id}`,
    }
  }

  return null
}

export function canUserDeletePost(user, item) {
  if (!item || item.type !== 'post' || !user) return false
  return user.role === 'admin' || user.id === item.author?.id
}

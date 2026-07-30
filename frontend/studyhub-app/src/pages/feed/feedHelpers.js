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

/**
 * Normalize a feed item into a non-empty attachment list.
 *
 * Posts created before multi-attachment support (and any cached payload
 * that predates the serializer change) only carry the legacy single
 * attachment fields, so synthesize a one-item list from those. Entries
 * with `id: null` are legacy and must use the legacy URLs.
 */
export function postAttachments(item) {
  if (!item) return []
  if (Array.isArray(item.attachments) && item.attachments.length > 0) {
    return item.attachments
  }
  if (item.hasAttachment) {
    return [
      {
        id: null,
        name: item.attachmentName || 'Attachment',
        type: item.attachmentType || 'file',
        sizeBytes: 0,
        position: 0,
      },
    ]
  }
  return []
}

/** Preview/download URLs for one attachment of a post. */
export function attachmentUrlsFor(postId, attachment) {
  if (Number.isInteger(attachment?.id)) {
    return {
      previewUrl: `${API}/api/feed/posts/${postId}/attachment/${attachment.id}/preview`,
      downloadUrl: `${API}/api/feed/posts/${postId}/attachment/${attachment.id}/download`,
    }
  }
  return {
    previewUrl: `${API}/api/feed/posts/${postId}/attachment/preview`,
    downloadUrl: `${API}/api/feed/posts/${postId}/attachment`,
  }
}

/** Same classification as attachmentPreviewKind, keyed off one attachment. */
export function kindForAttachment(attachment) {
  return attachmentPreviewKind({
    attachmentType: attachment?.type,
    attachmentName: attachment?.name,
  })
}

export function canUserDeletePost(user, item) {
  if (!item || item.type !== 'post' || !user) return false
  return user.role === 'admin' || user.id === item.author?.id
}

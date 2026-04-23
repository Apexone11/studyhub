const MAX_COMMENT_GIF_ATTACHMENTS = 1

function normalizeCommentGifAttachments(rawAttachments) {
  const attachments = Array.isArray(rawAttachments) ? rawAttachments : []

  if (attachments.length > MAX_COMMENT_GIF_ATTACHMENTS) {
    return { error: 'Only one GIF can be attached to a comment.' }
  }

  const normalized = []

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') {
      return { error: 'Comment attachment is invalid.' }
    }

    const url = typeof attachment.url === 'string' ? attachment.url.trim() : ''
    const type = typeof attachment.type === 'string' ? attachment.type.trim().toLowerCase() : ''
    const name = typeof attachment.name === 'string' ? attachment.name.trim().slice(0, 120) : 'GIF'

    if (!url) {
      return { error: 'Comment GIF URL is required.' }
    }

    if (type !== 'gif') {
      return { error: 'Comments only support GIF attachments.' }
    }

    let parsedUrl

    try {
      parsedUrl = new URL(url)
    } catch {
      return { error: 'Comment GIF URL is invalid.' }
    }

    if (parsedUrl.protocol !== 'https:') {
      return { error: 'Comment GIF URL must use HTTPS.' }
    }

    normalized.push({
      url: parsedUrl.toString(),
      type: 'gif',
      name: name || 'GIF',
    })
  }

  return { attachments: normalized }
}

module.exports = {
  MAX_COMMENT_GIF_ATTACHMENTS,
  normalizeCommentGifAttachments,
}

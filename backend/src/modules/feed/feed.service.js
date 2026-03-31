const path = require('node:path')

function settleSection(label, loader) {
  const startedAt = Date.now()

  return Promise.resolve()
    .then(() => loader())
    .then((data) => ({ ok: true, label, data, durationMs: Date.now() - startedAt }))
    .catch((error) => ({ ok: false, label, error, durationMs: Date.now() - startedAt }))
}

/**
 * Strip HTML tags and decode common entities to produce a plain-text summary.
 * Sheets often store full HTML documents as their `content`, so this ensures
 * the feed preview shows readable text rather than raw markup.
 */
function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')      // remove <style> blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')     // remove <script> blocks
    .replace(/<[^>]*>/g, ' ')                       // strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function summarizeText(text = '', max = 180) {
  const plain = stripHtml(text)
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  if (plain.length <= max) return plain
  return `${plain.slice(0, Math.max(0, max - 3))}...`
}

function safeDownloadName(name) {
  const ext = path.extname(String(name || 'attachment')) || '.bin'
  const base = path.basename(String(name || 'attachment'), ext)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'attachment'
  return `${base}${ext}`.toLowerCase()
}

function reactionSummary(rows, idKey, idValue, currentRows, currentKey) {
  const likes = rows.find((row) => row[idKey] === idValue && row.type === 'like')?._count?._all || 0
  const dislikes = rows.find((row) => row[idKey] === idValue && row.type === 'dislike')?._count?._all || 0
  const userReaction = currentRows.find((row) => row[currentKey] === idValue)?.type || null
  return { likes, dislikes, userReaction }
}

function formatAnnouncement(item) {
  return {
    id: item.id,
    feedKey: `announcement-${item.id}`,
    type: 'announcement',
    pinned: item.pinned,
    createdAt: item.createdAt,
    title: item.title,
    body: item.body,
    author: item.author ? { id: item.author.id, username: item.author.username, avatarUrl: item.author.avatarUrl || null } : null,
  }
}

function formatSheet(item, starredIds, commentCounts, reactionRows, currentReactions) {
  return {
    id: item.id,
    feedKey: `sheet-${item.id}`,
    type: 'sheet',
    createdAt: item.createdAt,
    title: item.title,
    description: summarizeText(item.description || '', 190),
    preview: summarizeText(item.content, 190),
    author: item.author ? { id: item.author.id, username: item.author.username, avatarUrl: item.author.avatarUrl || null } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    stars: item.stars || 0,
    forks: item.forks || 0,
    downloads: item.downloads || 0,
    commentCount: commentCounts.get(item.id) || 0,
    starred: starredIds.has(item.id),
    reactions: reactionSummary(reactionRows, 'sheetId', item.id, currentReactions, 'sheetId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
    attachmentType: item.attachmentType || null,
    allowDownloads: item.allowDownloads !== false,
    forkSource: item.forkSource
      ? {
          id: item.forkSource.id,
          title: item.forkSource.title,
          author: item.forkSource.author
            ? { id: item.forkSource.author.id, username: item.forkSource.author.username }
            : null,
        }
      : null,
    linkPath: `/sheets/${item.id}`,
  }
}

function formatPost(item, commentCounts, reactionRows, currentReactions) {
  return {
    id: item.id,
    feedKey: `post-${item.id}`,
    type: 'post',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    content: item.content,
    preview: summarizeText(item.content, 220),
    author: item.author ? { id: item.author.id, username: item.author.username, avatarUrl: item.author.avatarUrl || null } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    commentCount: commentCounts.get(item.id) || 0,
    reactions: reactionSummary(reactionRows, 'postId', item.id, currentReactions, 'postId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
    attachmentType: item.attachmentType || null,
    allowDownloads: item.allowDownloads !== false,
    moderationStatus: item.moderationStatus || 'clean',
    linkPath: `/feed?post=${item.id}`,
  }
}

function formatNote(item, commentCounts) {
  return {
    id: item.id,
    feedKey: `note-${item.id}`,
    type: 'note',
    createdAt: item.createdAt,
    title: item.title,
    preview: summarizeText(item.content, 190),
    author: item.author ? { id: item.author.id, username: item.author.username, avatarUrl: item.author.avatarUrl || null } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    commentCount: commentCounts.get(item.id) || 0,
    moderationStatus: item.moderationStatus || 'clean',
    linkPath: `/notes/${item.id}`,
  }
}

function formatFeedPostDetail(item, commentCount, reactionRows, currentReactions) {
  return {
    id: item.id,
    type: 'post',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    content: item.content,
    author: item.author ? { id: item.author.id, username: item.author.username, avatarUrl: item.author.avatarUrl || null } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    commentCount,
    reactions: reactionSummary(reactionRows, 'postId', item.id, currentReactions, 'postId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
    attachmentType: item.attachmentType || null,
    allowDownloads: item.allowDownloads !== false,
    moderationStatus: item.moderationStatus || 'clean',
  }
}

module.exports = {
  settleSection,
  stripHtml,
  summarizeText,
  safeDownloadName,
  reactionSummary,
  formatAnnouncement,
  formatSheet,
  formatPost,
  formatNote,
  formatFeedPostDetail,
}

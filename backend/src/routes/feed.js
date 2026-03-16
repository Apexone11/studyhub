const express = require('express')
const rateLimit = require('express-rate-limit')
const fs = require('node:fs')
const path = require('node:path')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { createNotification } = require('../lib/notify')
const { notifyMentionedUsers } = require('../lib/mentions')
const prisma = require('../lib/prisma')
const { cleanupAttachmentIfUnused, resolveAttachmentPath } = require('../lib/storage')

const router = express.Router()

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const feedReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Too many feed requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const feedWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many feed updates. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const attachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many attachment downloads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.use(requireAuth)
router.use(feedReadLimiter)

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function summarizeText(text = '', max = 180) {
  const plain = String(text)
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
    author: item.author ? { id: item.author.id, username: item.author.username } : null,
  }
}

function formatSheet(item, starredIds, commentCounts, reactionRows, currentReactions) {
  return {
    id: item.id,
    feedKey: `sheet-${item.id}`,
    type: 'sheet',
    createdAt: item.createdAt,
    title: item.title,
    description: item.description || '',
    preview: summarizeText(item.content, 190),
    author: item.author ? { id: item.author.id, username: item.author.username } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    stars: item.stars || 0,
    forks: item.forks || 0,
    downloads: item.downloads || 0,
    commentCount: commentCounts.get(item.id) || 0,
    starred: starredIds.has(item.id),
    reactions: reactionSummary(reactionRows, 'sheetId', item.id, currentReactions, 'sheetId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
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
    author: item.author ? { id: item.author.id, username: item.author.username } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    commentCount: commentCounts.get(item.id) || 0,
    reactions: reactionSummary(reactionRows, 'postId', item.id, currentReactions, 'postId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
    attachmentType: item.attachmentType || null,
    allowDownloads: item.allowDownloads !== false,
    linkPath: `/feed?post=${item.id}`,
  }
}

function formatFeedPostDetail(item, commentCount, reactionRows, currentReactions) {
  return {
    id: item.id,
    type: 'post',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    content: item.content,
    author: item.author ? { id: item.author.id, username: item.author.username } : null,
    course: item.course ? { id: item.course.id, code: item.course.code } : null,
    commentCount,
    reactions: reactionSummary(reactionRows, 'postId', item.id, currentReactions, 'postId'),
    hasAttachment: Boolean(item.attachmentUrl),
    attachmentName: item.attachmentName || null,
    attachmentType: item.attachmentType || null,
    allowDownloads: item.allowDownloads !== false,
  }
}

router.get('/', async (req, res) => {
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)
  const take = limit + offset + 8
  const announcementTake = Math.min(6, Math.max(2, Math.ceil((limit + offset) / 3)))
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

  const sheetWhere = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : undefined
  const postWhere = search
    ? { content: { contains: search, mode: 'insensitive' } }
    : undefined
  const announcementWhere = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ],
      }
    : undefined

  try {
    const [announcements, sheets, posts] = await Promise.all([
      prisma.announcement.findMany({
        where: announcementWhere,
        include: { author: { select: { id: true, username: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: announcementTake,
      }),
      prisma.studySheet.findMany({
        where: sheetWhere,
        include: {
          author: { select: { id: true, username: true } },
          course: { select: { id: true, code: true } },
          forkSource: {
            select: {
              id: true,
              title: true,
              author: { select: { id: true, username: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.feedPost.findMany({
        where: postWhere,
        include: {
          author: { select: { id: true, username: true } },
          course: { select: { id: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ])

    const sheetIds = sheets.map((sheet) => sheet.id)
    const postIds = posts.map((post) => post.id)

    const [
      starredRows,
      sheetCommentRows,
      postCommentRows,
      sheetReactionRows,
      postReactionRows,
      currentSheetReactions,
      currentPostReactions,
    ] = await Promise.all([
      sheetIds.length > 0
        ? prisma.starredSheet.findMany({
            where: { userId: req.user.userId, sheetId: { in: sheetIds } },
            select: { sheetId: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.comment.groupBy({
            by: ['sheetId'],
            where: { sheetId: { in: sheetIds } },
            _count: { _all: true },
          })
        : [],
      postIds.length > 0
        ? prisma.feedPostComment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds } },
            _count: { _all: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.reaction.groupBy({
            by: ['sheetId', 'type'],
            where: { sheetId: { in: sheetIds } },
            _count: { _all: true },
          })
        : [],
      postIds.length > 0
        ? prisma.feedPostReaction.groupBy({
            by: ['postId', 'type'],
            where: { postId: { in: postIds } },
            _count: { _all: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.reaction.findMany({
            where: { userId: req.user.userId, sheetId: { in: sheetIds } },
            select: { sheetId: true, type: true },
          })
        : [],
      postIds.length > 0
        ? prisma.feedPostReaction.findMany({
            where: { userId: req.user.userId, postId: { in: postIds } },
            select: { postId: true, type: true },
          })
        : [],
    ])

    const starredIds = new Set(starredRows.map((row) => row.sheetId))
    const sheetCommentCounts = new Map(sheetCommentRows.map((row) => [row.sheetId, row._count._all]))
    const postCommentCounts = new Map(postCommentRows.map((row) => [row.postId, row._count._all]))

    const items = [
      ...announcements.map(formatAnnouncement),
      ...posts.map((post) => formatPost(post, postCommentCounts, postReactionRows, currentPostReactions)),
      ...sheets.map((sheet) => formatSheet(sheet, starredIds, sheetCommentCounts, sheetReactionRows, currentSheetReactions)),
    ]
      .sort((left, right) => {
        if (left.type === 'announcement' && right.type === 'announcement') {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
        } else if (left.type === 'announcement' && left.pinned) {
          return -1
        } else if (right.type === 'announcement' && right.pinned) {
          return 1
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })

    res.json({
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts', feedWriteLimiter, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  const courseId = req.body.courseId ? Number.parseInt(req.body.courseId, 10) : null
  const allowDownloads = req.body.allowDownloads !== false

  if (!content) return res.status(400).json({ error: 'Post content is required.' })
  if (content.length > 2000) {
    return res.status(400).json({ error: 'Post content must be 2000 characters or fewer.' })
  }

  try {
    const post = await prisma.feedPost.create({
      data: {
        content,
        userId: req.user.userId,
        courseId: courseId || null,
        allowDownloads,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { select: { id: true, code: true } },
      },
    })

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      message: `${req.user.username} mentioned you in a post.`,
      linkPath: `/feed?post=${post.id}`,
    })

    res.status(201).json(formatFeedPostDetail(post, 0, [], []))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/posts/:id', async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, username: true } },
        course: { select: { id: true, code: true } },
      },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const [commentCount, reactionRows, currentReactions] = await Promise.all([
      prisma.feedPostComment.count({ where: { postId } }),
      prisma.feedPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId },
        _count: { _all: true },
      }),
      prisma.feedPostReaction.findMany({
        where: { userId: req.user.userId, postId },
        select: { postId: true, type: true },
      }),
    ])

    res.json(formatFeedPostDetail(post, commentCount, reactionRows, currentReactions))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/posts/:id/attachment', attachmentDownloadLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (!post.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!post.allowDownloads) {
      return res.status(403).json({ error: 'Downloads are disabled for this post.' })
    }

    const localPath = resolveAttachmentPath(post.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    res.download(localPath, safeDownloadName(post.attachmentName || path.basename(localPath)))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/posts/:id/comments', async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)

  try {
    const [comments, total] = await Promise.all([
      prisma.feedPostComment.findMany({
        where: { postId },
        include: { author: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.feedPostComment.count({ where: { postId } }),
    ])

    res.json({ comments, total, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts/:id/comments', commentLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true, username: true } } },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const comment = await prisma.feedPostComment.create({
      data: { content, postId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } },
    })

    await createNotification(prisma, {
      userId: post.userId,
      type: 'comment',
      message: `${req.user.username} commented on your post.`,
      actorId: req.user.userId,
      linkPath: `/feed?post=${postId}`,
    })

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      excludeUserIds: [post.userId],
      message: `${req.user.username} mentioned you in a comment on a post.`,
      linkPath: `/feed?post=${postId}`,
    })

    res.status(201).json(comment)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts/:id/react', reactLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  const { type } = req.body || {}

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { id: true },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const existing = await prisma.feedPostReaction.findUnique({
      where: { userId_postId: { userId: req.user.userId, postId } },
    })

    if (!type || (existing && existing.type === type)) {
      if (existing) {
        await prisma.feedPostReaction.delete({
          where: { userId_postId: { userId: req.user.userId, postId } },
        })
      }
    } else if (existing) {
      await prisma.feedPostReaction.update({
        where: { userId_postId: { userId: req.user.userId, postId } },
        data: { type },
      })
    } else {
      await prisma.feedPostReaction.create({
        data: { userId: req.user.userId, postId, type },
      })
    }

    const [reactionRows, currentReactions] = await Promise.all([
      prisma.feedPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId },
        _count: { _all: true },
      }),
      prisma.feedPostReaction.findMany({
        where: { userId: req.user.userId, postId },
        select: { postId: true, type: true },
      }),
    ])

    res.json(reactionSummary(reactionRows, 'postId', postId, currentReactions, 'postId'))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/posts/:id/comments/:commentId', feedWriteLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)

  try {
    const comment = await prisma.feedPostComment.findUnique({ where: { id: commentId } })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })
    if (comment.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your comment.' })
    }

    await prisma.feedPostComment.delete({ where: { id: commentId } })
    res.json({ message: 'Comment deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/posts/:id', feedWriteLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, attachmentUrl: true },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (post.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your post.' })
    }

    await prisma.feedPost.delete({ where: { id: postId } })
    await cleanupAttachmentIfUnused(prisma, post.attachmentUrl, {
      route: req.originalUrl,
      postId,
    })
    res.json({ message: 'Post deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router

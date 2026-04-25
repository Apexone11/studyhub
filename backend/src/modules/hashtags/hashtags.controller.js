const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const MAX_HASHTAG_LENGTH = 40
const HASHTAG_REGEX = /^[a-z0-9_]{1,40}$/
const MAX_FOLLOWS_PER_USER = 50

function normalizeName(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase().replace(/^#/, '')
  if (!trimmed || trimmed.length > MAX_HASHTAG_LENGTH) return null
  if (!HASHTAG_REGEX.test(trimmed)) return null
  return trimmed
}

/** GET /api/hashtags/me — hashtags the current user follows. */
async function listMyFollows(req, res) {
  try {
    const follows = await prisma.hashtagFollow.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: { hashtag: { select: { id: true, name: true } } },
    })
    return res.json({
      hashtags: follows.map((f) => ({
        id: f.hashtag.id,
        name: f.hashtag.name,
        followedAt: f.createdAt,
      })),
    })
  } catch (err) {
    captureError(err, { where: 'listMyFollows' })
    return sendError(res, 500, 'Failed to load topic follows', ERROR_CODES.INTERNAL)
  }
}

/** POST /api/hashtags/follow — body: { name }. Creates hashtag if missing. */
async function followHashtag(req, res) {
  const name = normalizeName(req.body?.name)
  if (!name) {
    return sendError(
      res,
      400,
      'name must be 1-40 chars, a-z/0-9/underscore only',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  try {
    const existingFollowCount = await prisma.hashtagFollow.count({
      where: { userId: req.user.userId },
    })
    if (existingFollowCount >= MAX_FOLLOWS_PER_USER) {
      return sendError(
        res,
        409,
        `You can follow at most ${MAX_FOLLOWS_PER_USER} topics. Unfollow one to continue.`,
        ERROR_CODES.CONFLICT,
      )
    }

    const hashtag = await prisma.hashtag.upsert({
      where: { name },
      create: { name },
      update: {},
      select: { id: true, name: true },
    })

    await prisma.hashtagFollow.upsert({
      where: { userId_hashtagId: { userId: req.user.userId, hashtagId: hashtag.id } },
      create: { userId: req.user.userId, hashtagId: hashtag.id },
      update: {},
    })

    return res.status(201).json({ hashtag })
  } catch (err) {
    captureError(err, { where: 'followHashtag' })
    return sendError(res, 500, 'Failed to follow topic', ERROR_CODES.INTERNAL)
  }
}

/** DELETE /api/hashtags/:name/follow */
async function unfollowHashtag(req, res) {
  const name = normalizeName(req.params.name)
  if (!name) {
    return sendError(res, 400, 'Invalid topic name', ERROR_CODES.BAD_REQUEST)
  }
  try {
    const hashtag = await prisma.hashtag.findUnique({
      where: { name },
      select: { id: true },
    })
    if (!hashtag) return res.json({ ok: true })
    await prisma.hashtagFollow.deleteMany({
      where: { userId: req.user.userId, hashtagId: hashtag.id },
    })
    return res.json({ ok: true })
  } catch (err) {
    captureError(err, { where: 'unfollowHashtag' })
    return sendError(res, 500, 'Failed to unfollow topic', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  listMyFollows,
  followHashtag,
  unfollowHashtag,
  normalizeName,
  MAX_FOLLOWS_PER_USER,
  MAX_HASHTAG_LENGTH,
}

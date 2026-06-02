/**
 * explore.controller.js — thin HTTP layer for the G2-3 Explore tab.
 * Wires req.query → explore.service with bounded limits + viewer context.
 */
const { parseBoundedInt } = require('../../core/http/validate')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const exploreService = require('./explore.service')

function viewer(req) {
  return { userId: req.user?.userId, role: req.user?.role }
}

function topicParam(req) {
  const t = typeof req.query.topic === 'string' ? req.query.topic.trim().toLowerCase() : ''
  return t || null
}

async function listSheets(req, res) {
  try {
    const sheets = await exploreService.listSheets({
      topic: topicParam(req),
      limit: parseBoundedInt(req.query.limit, 20, 50),
      viewerId: req.user?.userId,
    })
    return res.json({ sheets })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load explore sheets.', ERROR_CODES.INTERNAL)
  }
}

async function trending(req, res) {
  try {
    const sheets = await exploreService.trendingSheets({
      limit: parseBoundedInt(req.query.limit, 12, 30),
      viewerId: req.user?.userId,
    })
    return res.json({ sheets })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load trending.', ERROR_CODES.INTERNAL)
  }
}

async function listNotes(req, res) {
  try {
    const notes = await exploreService.listNotes({
      topic: topicParam(req),
      limit: parseBoundedInt(req.query.limit, 20, 50),
      viewerId: req.user?.userId,
    })
    return res.json({ notes })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load explore notes.', ERROR_CODES.INTERNAL)
  }
}

async function listStudyGroups(req, res) {
  try {
    const groups = await exploreService.listStudyGroups({
      topic: topicParam(req),
      limit: parseBoundedInt(req.query.limit, 20, 50),
      viewerId: req.user?.userId,
    })
    return res.json({ groups })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load explore groups.', ERROR_CODES.INTERNAL)
  }
}

async function listTopics(req, res) {
  try {
    const topics = await exploreService.listTopics(viewer(req))
    return res.json({ topics })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not load topics.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { listSheets, trending, listNotes, listStudyGroups, listTopics }

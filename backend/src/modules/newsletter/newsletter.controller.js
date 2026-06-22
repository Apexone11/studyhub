/**
 * newsletter.controller.js — thin HTTP layer over newsletter.service.
 * Validation (A12 numeric ids, A13 enum allowlists) happens here before any
 * value reaches Prisma.
 */
const service = require('./newsletter.service')
const { getPublicAppUrl } = require('../../lib/email/emailTransport')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const {
  CATEGORIES,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_BODY_LENGTH,
} = require('./newsletter.constants')

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 400, 'Invalid newsletter id.', ERROR_CODES.BAD_REQUEST)
    return null
  }
  return id
}

// Shared body validation for create/update. `partial` allows omitted fields
// (update); create requires title + body.
function validateBody(body, { partial }) {
  const out = {}
  const has = (k) => body[k] !== undefined && body[k] !== null

  if (!partial || has('title')) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return { error: 'Title is required.' }
    if (title.length > MAX_TITLE_LENGTH) return { error: 'Title is too long.' }
    out.title = title
  }
  if (!partial || has('bodyHtml')) {
    const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml : ''
    if (!partial && !bodyHtml.trim()) return { error: 'Body is required.' }
    if (bodyHtml.length > MAX_BODY_LENGTH) return { error: 'Body is too long.' }
    out.bodyHtml = bodyHtml
  }
  if (has('summary')) {
    const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
    if (summary.length > MAX_SUMMARY_LENGTH) return { error: 'Summary is too long.' }
    out.summary = summary
  } else if (!partial) {
    out.summary = ''
  }
  if (!partial || has('category')) {
    const category = body.category || 'announcement'
    if (!CATEGORIES.includes(category)) return { error: 'Invalid category.' }
    out.category = category
  }
  if (has('isPublic')) {
    if (typeof body.isPublic !== 'boolean') return { error: 'isPublic must be a boolean.' }
    out.isPublic = body.isPublic
  }
  return { value: out }
}

// ── public ─────────────────────────────────────────────────────

async function listPublic(req, res) {
  try {
    const result = await service.listPublished({ page: req.query.page, limit: req.query.limit })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function getBySlugPublic(req, res) {
  try {
    const issue = await service.getPublicBySlug(String(req.params.slug || ''))
    if (!issue) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    res.json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// GET /unsubscribe?token=... — human click / List-Unsubscribe GET fallback.
// Processes then redirects to the frontend confirmation page.
async function getUnsubscribe(req, res) {
  try {
    const result = await service.unsubscribeByToken(String(req.query.token || ''))
    const status = result.ok ? 'ok' : 'invalid'
    return res.redirect(`${getPublicAppUrl()}/unsubscribe?status=${status}`)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.redirect(`${getPublicAppUrl()}/unsubscribe?status=error`)
  }
}

// POST /unsubscribe — frontend confirm + RFC 8058 one-click. Token from body
// or query. Always 200 on a valid token; 400 otherwise.
async function postUnsubscribe(req, res) {
  try {
    const token = String((req.body && req.body.token) || req.query.token || '')
    const result = await service.unsubscribeByToken(token)
    if (!result.ok) return sendError(res, 400, 'Invalid unsubscribe link.', ERROR_CODES.BAD_REQUEST)
    res.json({ ok: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

// ── admin ──────────────────────────────────────────────────────

async function adminList(req, res) {
  try {
    const result = await service.listAdmin({ page: req.query.page, limit: req.query.limit })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function adminGet(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const issue = await service.getAdminById(id)
    if (!issue) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    res.json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function create(req, res) {
  const { error, value } = validateBody(req.body || {}, { partial: false })
  if (error) return sendError(res, 400, error, ERROR_CODES.VALIDATION)
  try {
    const issue = await service.createDraft({ ...value, authorId: req.user?.userId })
    res.status(201).json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function update(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  const { error, value } = validateBody(req.body || {}, { partial: true })
  if (error) return sendError(res, 400, error, ERROR_CODES.VALIDATION)
  try {
    const existing = await service.getAdminById(id)
    if (!existing) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    const issue = await service.updateDraft(id, value)
    res.json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function publish(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const issue = await service.publishNewsletter(id)
    if (!issue) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    res.json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function unpublish(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const issue = await service.unpublishNewsletter(id)
    if (!issue) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    res.json(issue)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function send(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const issue = await service.getAdminById(id)
    if (!issue) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    if (issue.status !== 'published') {
      return sendError(res, 400, 'Publish the update before sending.', ERROR_CODES.BAD_REQUEST)
    }
    service.sendNewsletter(id)
    res.status(202).json({ queued: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

async function remove(req, res) {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const existing = await service.getAdminById(id)
    if (!existing) return sendError(res, 404, 'Update not found.', ERROR_CODES.NOT_FOUND)
    await service.removeNewsletter(id)
    res.json({ ok: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  listPublic,
  getBySlugPublic,
  getUnsubscribe,
  postUnsubscribe,
  adminList,
  adminGet,
  create,
  update,
  publish,
  unpublish,
  send,
  remove,
}

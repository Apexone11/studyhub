/* ════════════════════════════════════════════════════════════════════════
 * auth.username.controller.js — Username-availability lookup
 *
 * Used by the onboarding flow (post-Google role picker, in-form local
 * registration) to give the user real-time feedback on whether their
 * desired username is free BEFORE they hit submit. This closes the
 * "Google signup picks `john` but `john` is already taken so the
 * tempToken redemption fails after a 30s loading spinner" UX gap.
 *
 * Public endpoint — anyone can probe usernames. The risk is enumerating
 * the user list to harvest usernames, but every username is already
 * surfaced at /api/users/<username> profile lookups, so there's nothing
 * new being exposed. Rate-limited to keep automated scrapers honest.
 *
 * Response shape: { available: boolean, reason?: string }
 *   - available=true: username is free + valid → safe to claim.
 *   - available=false + reason='taken': someone owns it.
 *   - available=false + reason='invalid': fails the format regex.
 *   - available=false + reason='reserved': matches the reserved word list.
 * ════════════════════════════════════════════════════════════════════════ */

const express = require('express')
const prisma = require('../../lib/prisma')
const { readLimiter } = require('../../lib/rateLimiters')
const { USERNAME_REGEX } = require('./auth.constants')

// Reserved usernames that can NEVER be claimed even if free in the DB.
// Mirrors the convention used by GitHub / Twitter — system identifiers,
// admin paths, and common impersonation surfaces.
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'staff',
  'moderator',
  'mod',
  'system',
  'studyhub',
  'studyhub_owner',
  'root',
  'security',
  'noreply',
  'official',
  'api',
])

const router = express.Router()

router.get('/check-username', readLimiter, async (req, res) => {
  const raw = String(req.query.username || '').trim()

  if (!raw) {
    return res.json({ available: false, reason: 'invalid' })
  }

  const normalized = raw.toLowerCase()

  if (!USERNAME_REGEX.test(raw)) {
    return res.json({ available: false, reason: 'invalid' })
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return res.json({ available: false, reason: 'reserved' })
  }

  try {
    // Case-insensitive lookup so `John` and `john` collide. Prisma's
    // findUnique is case-sensitive on Postgres by default, so we use
    // findFirst with mode: 'insensitive'.
    const existing = await prisma.user.findFirst({
      where: { username: { equals: raw, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) {
      return res.json({ available: false, reason: 'taken' })
    }
    return res.json({ available: true })
  } catch {
    // On a DB hiccup we fail-OPEN to "available" rather than blocking
    // legitimate signups. The actual create endpoints have their own
    // unique-constraint check, so a stray race here just means the user
    // sees a generic error on submit instead of an inline "taken" badge.
    return res.json({ available: true })
  }
})

module.exports = router

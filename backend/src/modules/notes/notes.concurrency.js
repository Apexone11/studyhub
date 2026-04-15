/**
 * notes.concurrency.js — Pure-function helpers for Notes Hardening v2.
 *
 * Used by the notes PATCH handler to detect no-op writes, surface revision
 * conflicts, and throttle AUTO version snapshots. No DB or HTTP deps.
 */

const crypto = require('node:crypto')

const AUTO_VERSION_COOLDOWN_MS = 5 * 60 * 1000

function computeContentHash(content) {
  const input = content == null ? '' : content
  const hex = crypto.createHash('sha256').update(input, 'utf8').digest('hex')
  return `sha256:${hex}`
}

function isRevisionConflict(baseRevision, currentRevision) {
  return Number(baseRevision) < Number(currentRevision)
}

function shouldCreateAutoVersion({ lastAutoVersionAt, now = new Date() } = {}) {
  if (lastAutoVersionAt == null) return true
  const last = new Date(lastAutoVersionAt).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return current - last >= AUTO_VERSION_COOLDOWN_MS
}

module.exports = {
  computeContentHash,
  isRevisionConflict,
  shouldCreateAutoVersion,
  AUTO_VERSION_COOLDOWN: AUTO_VERSION_COOLDOWN_MS,
}

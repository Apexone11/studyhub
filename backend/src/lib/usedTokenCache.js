/**
 * In-memory TTL cache for one-use token identifiers.
 *
 * Used to enforce single-use semantics on stateless JWTs that must not be
 * replayable within their expiry window — most notably the Google signup
 * `tempToken` (15-minute JWT). Without this, an attacker who observes a
 * tempToken (log leak, network interception on a compromised hop, or a
 * shared-device race) could race the legitimate user to `/google/complete`
 * and create an account tied to the victim's Google identity.
 *
 * Trade-off: Redis was removed from this stack (see 2026-04-16 release log).
 * A process-local Map is sufficient for a single-instance Railway deployment
 * — the guard holds for the full lifetime of the process. If the app is ever
 * horizontally scaled, this must migrate to a shared store (Redis or a DB
 * table) so both instances see the same used-jti set.
 *
 * Public API:
 *   markTokenUsed(jti, ttlMs)  → throws if already marked, otherwise records
 *   isTokenUsed(jti)           → boolean, does not mutate
 *
 * Entries expire lazily on read and are proactively swept every 5 minutes.
 */

const usedTokens = new Map() // jti -> expiresAtMs

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

function sweep() {
  const now = Date.now()
  for (const [jti, expiresAt] of usedTokens) {
    if (expiresAt <= now) usedTokens.delete(jti)
  }
}

// Lazily start the sweeper on first use so test environments that never
// import this module don't leave a dangling timer.
let sweeperTimer = null
function ensureSweeper() {
  if (sweeperTimer) return
  sweeperTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
  if (sweeperTimer.unref) sweeperTimer.unref()
}

/**
 * Returns true if the jti has already been marked used and is still within
 * its TTL. Expired entries are treated as unused (and removed).
 */
function isTokenUsed(jti) {
  if (!jti) return false
  const expiresAt = usedTokens.get(jti)
  if (!expiresAt) return false
  if (expiresAt <= Date.now()) {
    usedTokens.delete(jti)
    return false
  }
  return true
}

/**
 * Marks the jti as used for the given TTL. Throws `TokenAlreadyUsedError` if
 * it was already marked within its TTL. Call this AFTER verifying the token
 * signature but BEFORE acting on its payload, so a replay is rejected.
 */
function markTokenUsed(jti, ttlMs) {
  if (!jti || typeof jti !== 'string') {
    throw new Error('markTokenUsed requires a string jti')
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('markTokenUsed requires a positive ttlMs')
  }
  ensureSweeper()
  if (isTokenUsed(jti)) {
    const err = new Error('Token has already been used.')
    err.code = 'TOKEN_ALREADY_USED'
    throw err
  }
  usedTokens.set(jti, Date.now() + ttlMs)
}

/**
 * Test-only: clear the in-memory set. Never call from production code.
 */
function _resetForTests() {
  usedTokens.clear()
}

module.exports = {
  isTokenUsed,
  markTokenUsed,
  _resetForTests,
}

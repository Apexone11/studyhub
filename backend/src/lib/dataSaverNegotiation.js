/**
 * dataSaverNegotiation.js — server-side data-saver detection.
 *
 * Wave-12.11. Pairs with the frontend `useDataSaver` hook.
 *
 * Returns true when the current request should receive a lighter
 * response (smaller image variants, no thumbnail array, no SSE
 * streaming, etc.). Three signals, OR'd:
 *
 *   1. `Save-Data: on` request header (RFC 8478). Sent by Chrome on
 *      cellular when the user has Data Saver enabled, and by some
 *      mobile browsers on metered connections.
 *   2. `req.user.dataSaverMode === 'on'` — the user explicitly turned
 *      Data Saver on in Settings. Honored even if no header is set.
 *   3. `req.user.dataSaverMode === 'auto'` AND the header is on. The
 *      `auto` default means we follow the platform signal when the
 *      user hasn't expressed a preference either way.
 *
 * Explicit `dataSaverMode === 'off'` ALWAYS wins — the user said no.
 * This is the "I have wifi, give me the full experience" override even
 * if their browser is sending Save-Data for unrelated reasons.
 *
 * The helper is a synchronous read; no DB roundtrip. Routes that want
 * to honor data-saver should pull the user pref into req.user (or a
 * scoped lookup) BEFORE calling this — the existing requireAuth
 * middleware does not currently load dataSaverMode, so callers either:
 *   a) accept "header-only" detection (anonymous requests, public
 *      endpoints), or
 *   b) hydrate req.user.dataSaverMode themselves.
 *
 * Why no middleware sets it globally yet: the per-request Prisma read
 * cost adds up across every endpoint. Routes that benefit from
 * data-saver opt in explicitly. Settings tab is the canonical write.
 */

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isDataSaverRequest(req) {
  const userPref = req?.user?.dataSaverMode

  // Explicit "off" wins — never down-rev the response when the user
  // said they want the full version.
  if (userPref === 'off') return false

  // Explicit "on" wins — return the lighter response regardless of
  // header presence.
  if (userPref === 'on') return true

  // `auto` (or anonymous / unloaded pref) → honor the request header.
  const header = String(req?.headers?.['save-data'] || '')
    .trim()
    .toLowerCase()
  return header === 'on'
}

/**
 * Frontend may also pass an explicit `?lite=1` query param when its
 * hook detected client-side that data-saver is on (covers Safari,
 * which doesn't send Save-Data). Honored as a third signal.
 */
function isLiteQueryRequest(req) {
  return req?.query?.lite === '1' || req?.query?.lite === 'true'
}

/**
 * Convenience: returns true if ANY of the three signals fire.
 */
function shouldReturnLite(req) {
  return isDataSaverRequest(req) || isLiteQueryRequest(req)
}

module.exports = {
  isDataSaverRequest,
  isLiteQueryRequest,
  shouldReturnLite,
}

/**
 * debugLog — tiny helper for gating verbose dev logs.
 *
 * Use `dlog` / `dwarn` for "I want to see this locally, not in prod"
 * messages. Keep `console.error` for actual failures; those pipe to
 * Sentry and the production log pipeline and are not gated here.
 *
 * Enabled in:
 *   - Any non-production NODE_ENV (dev, test, staging-like)
 *   - Production when DEBUG_LOG=true is set explicitly (for on-call
 *     triage without a redeploy)
 */

const ENABLED = process.env.NODE_ENV !== 'production' || process.env.DEBUG_LOG === 'true'

function dlog(...args) {
  // Using console.warn because the project's ESLint config only allows
  // console.error / console.warn; debug output is still useful in dev.
  if (ENABLED) console.warn('[debug]', ...args)
}

function dwarn(...args) {
  if (ENABLED) console.warn('[debug]', ...args)
}

module.exports = { dlog, dwarn, ENABLED }

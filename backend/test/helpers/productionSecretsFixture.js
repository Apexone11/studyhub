/**
 * productionSecretsFixture.js — single source of truth for satisfying
 * `secretValidator.validateSecrets()` from any test that needs to spin
 * up the app in `NODE_ENV=production` mode.
 *
 * Why this exists:
 *   - secretValidator.js fails closed in production when REQUIRED +
 *     REQUIRED_IN_PRODUCTION env vars are missing (CLAUDE.md A9).
 *   - On Windows dev these come from `backend/.env`. On CI Linux runners
 *     `.env` isn't shipped, so any test that re-requires `src/index.js`
 *     under `NODE_ENV=production` would hit `process.exit(1)` at module
 *     load time.
 *   - Inlining "set 5 env vars then restore 5 env vars" in every test
 *     drifts the moment a new required secret is added.
 *
 * Pattern: read the canonical REQUIRED + REQUIRED_IN_PRODUCTION lists
 * from secretValidator.js directly, auto-generate a dummy that satisfies
 * each spec's `minLength` + `pattern` constraints, and return a restore
 * function the test can call in `finally`.
 *
 * Usage:
 *   const restore = applyProductionSecretsFixture()
 *   try {
 *     // ... test that re-requires src/index.js with NODE_ENV=production ...
 *   } finally {
 *     restore()
 *   }
 */
const { REQUIRED, REQUIRED_IN_PRODUCTION } = require('../../src/lib/secretValidator')

/**
 * Build a dummy value that satisfies a secret spec. For specs with a
 * regex pattern, returns a value that matches the pattern (assumed to be
 * a fixed-length hex string when present — matches every current
 * production-required key). Otherwise returns a string of the required
 * length composed of a deterministic filler character.
 */
function buildDummy(secret, fillerChar) {
  const minLen = secret.minLength || 16
  if (secret.pattern && /^\^\[0-9a-fA-F\]\{\d+\}\$$/.test(secret.pattern.source)) {
    // Hex pattern like /^[0-9a-fA-F]{64}$/ — produce a hex-only string
    // of the exact length the regex expects.
    const lengthMatch = secret.pattern.source.match(/\{(\d+)\}/)
    const len = lengthMatch ? Number.parseInt(lengthMatch[1], 10) : minLen
    return 'a'.repeat(len)
  }
  if (secret.key === 'DATABASE_URL') {
    // DATABASE_URL just needs to be a plausibly-shaped URL string.
    return 'postgresql://test@localhost:5432/test'
  }
  if (secret.key === 'FRONTEND_URL') {
    return 'http://localhost:5173'
  }
  // Generic filler — letters chosen per-key so different secrets don't
  // accidentally collide in a snapshot diff.
  return fillerChar.repeat(Math.max(minLen, 16))
}

/**
 * Apply dummy values for every REQUIRED + REQUIRED_IN_PRODUCTION secret
 * that's missing or below its minimum length. Also flips NODE_ENV to
 * 'production'. Returns a function that restores every overridden env
 * var to its pre-fixture state.
 */
function applyProductionSecretsFixture(overrides = {}) {
  const prev = {}
  const restoreOnce = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(prev, key)) return // first-write wins
    prev[key] = value
  }

  restoreOnce('NODE_ENV', process.env.NODE_ENV)
  process.env.NODE_ENV = 'production'

  const fillerByKey = {}
  let fillerIndex = 0
  const nextFiller = () => String.fromCharCode('a'.charCodeAt(0) + (fillerIndex++ % 26))

  const apply = (specs) => {
    for (const spec of specs) {
      const current = process.env[spec.key]
      const tooShort = spec.minLength && (!current || current.length < spec.minLength)
      const wrongPattern = spec.pattern && current && !spec.pattern.test(current)
      if (current && !tooShort && !wrongPattern) continue
      restoreOnce(spec.key, current)
      const filler = fillerByKey[spec.key] || (fillerByKey[spec.key] = nextFiller())
      process.env[spec.key] = buildDummy(spec, filler)
    }
  }

  apply(REQUIRED)
  apply(REQUIRED_IN_PRODUCTION)

  // Caller overrides take priority over the auto-generated dummies.
  for (const [key, value] of Object.entries(overrides)) {
    restoreOnce(key, process.env[key])
    process.env[key] = value
  }

  return function restore() {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

module.exports = {
  applyProductionSecretsFixture,
  // Re-exported for test introspection.
  _buildDummy: buildDummy,
}

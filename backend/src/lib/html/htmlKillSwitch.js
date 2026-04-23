/**
 * HTML uploads kill-switch — Option C (env var baseline + admin DB toggle).
 *
 * Priority order:
 *   1. Environment variable STUDYHUB_HTML_UPLOADS
 *      - "disabled" → always blocked, regardless of DB
 *      - "enabled"  → always allowed, regardless of DB
 *      - unset / empty → defer to DB flag
 *   2. FeatureFlag row named "html_uploads"
 *      - enabled: true  → HTML uploads allowed
 *      - enabled: false → HTML uploads blocked
 *      - row missing    → defaults to ENABLED (preserves current behavior)
 *
 * This gives defense-in-depth: if the admin panel is down, the env var
 * still protects you; in normal operation admins can react instantly
 * without a deploy.
 */

const prisma = require('../prisma')

const FLAG_NAME = 'html_uploads'

/**
 * Read the env-var layer. Returns 'disabled' | 'enabled' | null.
 */
function readEnvOverride() {
  const raw = String(process.env.STUDYHUB_HTML_UPLOADS || '')
    .trim()
    .toLowerCase()
  if (raw === 'disabled') return 'disabled'
  if (raw === 'enabled') return 'enabled'
  return null
}

/**
 * Check whether HTML uploads are currently enabled.
 * Reads env var first; falls back to the FeatureFlag table.
 *
 * @returns {Promise<{ enabled: boolean, source: 'env' | 'db' | 'default' }>}
 */
async function isHtmlUploadsEnabled() {
  const envOverride = readEnvOverride()

  if (envOverride === 'disabled') {
    return { enabled: false, source: 'env' }
  }

  if (envOverride === 'enabled') {
    return { enabled: true, source: 'env' }
  }

  // Env var not set — check database flag
  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { name: FLAG_NAME },
      select: { enabled: true },
    })

    if (!flag) {
      // No row yet — default to enabled (preserves current behavior)
      return { enabled: true, source: 'default' }
    }

    return { enabled: flag.enabled, source: 'db' }
  } catch {
    // DB error — fail open to preserve existing behavior.
    // Log this in production via Sentry if available.
    return { enabled: true, source: 'default' }
  }
}

/**
 * Set the DB-level kill-switch. Creates the row if it doesn't exist.
 *
 * @param {boolean} enabled - Whether HTML uploads should be enabled.
 * @param {object} [options]
 * @param {number} [options.adminUserId] - ID of the admin making the change.
 * @returns {Promise<{ enabled: boolean, source: 'env' | 'db', envOverride: string | null }>}
 */
async function setHtmlUploadsEnabled(enabled, options = {}) {
  const envOverride = readEnvOverride()
  const description = options.adminUserId
    ? `HTML uploads ${enabled ? 'enabled' : 'disabled'} by admin ${options.adminUserId}`
    : `HTML uploads ${enabled ? 'enabled' : 'disabled'}`

  await prisma.featureFlag.upsert({
    where: { name: FLAG_NAME },
    update: { enabled, description },
    create: { name: FLAG_NAME, enabled, description },
  })

  // If the env var overrides, report that clearly
  const effectiveEnabled =
    envOverride === 'disabled' ? false : envOverride === 'enabled' ? true : enabled

  return {
    enabled: effectiveEnabled,
    source: envOverride ? 'env' : 'db',
    envOverride,
    dbValue: enabled,
  }
}

module.exports = {
  FLAG_NAME,
  isHtmlUploadsEnabled,
  setHtmlUploadsEnabled,
  readEnvOverride,
}

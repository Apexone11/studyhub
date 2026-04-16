/**
 * secretValidator.js — Phase 5 startup secret validation.
 *
 * Runs once at boot time. Checks that all required environment variables
 * are set and prints a summary. Missing critical secrets cause a hard
 * exit in production; warnings are emitted for optional ones.
 *
 * Call validateSecrets() from index.js during startup.
 */

const REQUIRED = [
  { key: 'JWT_SECRET', minLength: 32, description: 'Auth token signing key' },
  { key: 'DATABASE_URL', minLength: 10, description: 'PostgreSQL connection string' },
]

const RECOMMENDED = [
  { key: 'ANTHROPIC_API_KEY', description: 'Claude AI API key' },
  { key: 'STRIPE_SECRET_KEY', description: 'Stripe payment processing' },
  { key: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signature verification' },
  { key: 'SENTRY_DSN', description: 'Error monitoring' },
  { key: 'FRONTEND_URL', description: 'Frontend origin for CORS + redirects' },
]

const OPTIONAL = [
  { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth' },
  { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth' },
  { key: 'KMS_KEY_ARN', description: 'AWS KMS PII vault encryption' },
  { key: 'FIELD_ENCRYPTION_KEY', description: 'Field-level encryption' },
  { key: 'CLAMAV_HOST', description: 'ClamAV antivirus scanner' },
  { key: 'R2_ACCOUNT_ID', description: 'Cloudflare R2 storage' },
]

function validateSecrets() {
  const isProduction = process.env.NODE_ENV === 'production'
  const missing = []
  const warnings = []

  for (const secret of REQUIRED) {
    const value = process.env[secret.key]
    if (!value || (secret.minLength && value.length < secret.minLength)) {
      missing.push(`${secret.key} — ${secret.description}`)
    }
  }

  for (const secret of RECOMMENDED) {
    if (!process.env[secret.key]) {
      warnings.push(`${secret.key} — ${secret.description}`)
    }
  }

  if (missing.length > 0) {
    console.error('[SECURITY] Missing required secrets:')
    for (const m of missing) console.error(`  - ${m}`)
    if (isProduction) {
      console.error('[SECURITY] Cannot start in production with missing required secrets. Exiting.')
      process.exit(1)
    }
  }

  if (warnings.length > 0) {
    console.warn('[SECURITY] Missing recommended secrets (features will be degraded):')
    for (const w of warnings) console.warn(`  - ${w}`)
  }

  const configured = REQUIRED.length + RECOMMENDED.length + OPTIONAL.length
  const set = [...REQUIRED, ...RECOMMENDED, ...OPTIONAL].filter((s) => process.env[s.key]).length

  console.warn(`[SECURITY] Secrets: ${set}/${configured} configured.`)
}

module.exports = { validateSecrets, REQUIRED, RECOMMENDED, OPTIONAL }

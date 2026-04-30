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

/* Required only when NODE_ENV === 'production'. Missing → hard exit at boot.
 * Promoted from OPTIONAL on 2026-04-30 after the security audit found that a
 * missing FIELD_ENCRYPTION_KEY in prod would cause encrypted PII columns to
 * silently fall back to plaintext. */
const REQUIRED_IN_PRODUCTION = [
  {
    key: 'FIELD_ENCRYPTION_KEY',
    // 64 hex chars = 32 raw bytes for AES-256, matching the runtime check
    // in lib/fieldEncryption.js. A shorter value would pass the boot check
    // but crash on the first encrypt/decrypt call.
    minLength: 64,
    pattern: /^[0-9a-fA-F]{64}$/,
    description:
      'Field-level encryption key for the PII vault. Must be a 64-char hex string (32 bytes).',
  },
]

const OPTIONAL = [
  { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth' },
  { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth' },
  { key: 'KMS_KEY_ARN', description: 'AWS KMS PII vault encryption' },
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

  if (isProduction) {
    for (const secret of REQUIRED_IN_PRODUCTION) {
      const value = process.env[secret.key]
      const wrongLength = secret.minLength && (!value || value.length < secret.minLength)
      const wrongPattern = secret.pattern && value && !secret.pattern.test(value)
      if (!value || wrongLength || wrongPattern) {
        missing.push(`${secret.key} — ${secret.description}`)
      }
    }
  } else {
    // In dev/test we surface as a warning so contributors know it exists.
    for (const secret of REQUIRED_IN_PRODUCTION) {
      if (!process.env[secret.key]) {
        warnings.push(`${secret.key} — ${secret.description} (required in production)`)
      }
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

  const configured =
    REQUIRED.length + REQUIRED_IN_PRODUCTION.length + RECOMMENDED.length + OPTIONAL.length
  const set = [...REQUIRED, ...REQUIRED_IN_PRODUCTION, ...RECOMMENDED, ...OPTIONAL].filter(
    (s) => process.env[s.key],
  ).length

  console.warn(`[SECURITY] Secrets: ${set}/${configured} configured.`)
}

module.exports = {
  validateSecrets,
  REQUIRED,
  REQUIRED_IN_PRODUCTION,
  RECOMMENDED,
  OPTIONAL,
}

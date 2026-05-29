/**
 * secretValidator.js — Phase 5 startup secret validation.
 *
 * Runs once at boot time. Checks that all required environment variables
 * are set and prints a summary. Missing critical secrets cause a hard
 * exit in production; warnings are emitted for optional ones.
 *
 * Call validateSecrets() from index.js during startup.
 */

const log = require('./logger')

const REQUIRED = [
  { key: 'JWT_SECRET', minLength: 32, description: 'Auth token signing key' },
  { key: 'DATABASE_URL', minLength: 10, description: 'PostgreSQL connection string' },
]

const RECOMMENDED = [
  { key: 'ANTHROPIC_API_KEY', description: 'Claude AI API key' },
  { key: 'STRIPE_SECRET_KEY', description: 'Stripe payment processing' },
  { key: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signature verification' },
  {
    key: 'RESEND_WEBHOOK_SECRET',
    description:
      'Resend webhook signing key (svix). Without it the strict-mode handler 503s on every webhook; ' +
      'with it the handler verifies signatures and stores delivery + suppression events. Added 2026-05-14.',
  },
  {
    key: 'RESEND_API_KEY',
    description:
      'Resend API key for outbound email delivery (lib/email/emailTransport.js). ' +
      'Missing in dev = email falls back to jsonTransport/SMTP; missing in prod = ' +
      'verification, reset, and admin notification mail silently no-ops.',
  },
  {
    key: 'EMAIL_USER',
    description:
      'SMTP username for the fallback nodemailer transport (lib/email/emailTransport.js). ' +
      'Only used when EMAIL_TRANSPORT is not resend; pair with EMAIL_PASS.',
  },
  {
    key: 'EMAIL_PASS',
    description:
      'SMTP password / app-password for the fallback nodemailer transport ' +
      '(lib/email/emailTransport.js). Pair with EMAIL_USER.',
  },
  { key: 'SENTRY_DSN', description: 'Error monitoring' },
  // FRONTEND_URL was previously listed here as RECOMMENDED only — promoted
  // to REQUIRED_IN_PRODUCTION (line ~87) wave-11 2026-05-14 so missing
  // values fail at boot rather than at the first Stripe checkout. The
  // RECOMMENDED entry is intentionally removed to avoid double-listing.
  {
    key: 'GIPHY_API_KEY',
    description:
      'GIPHY GIF search proxy (server-side); GIFs disabled when missing. ' +
      'Reads TENOR_API_KEY as a legacy fallback for the rename window — ' +
      'Tenor was sunset 2026-06-30, new deployments must use GIPHY_API_KEY.',
  },
  // Scholar v1 — see backend/src/modules/scholar/. All keys are server-side
  // only and never reach the browser; missing keys degrade gracefully.
  {
    key: 'SEMANTIC_SCHOLAR_API_KEY',
    description: 'Semantic Scholar Graph API key (raises throughput beyond ~1 req/sec).',
  },
  {
    key: 'OPENALEX_API_KEY',
    description: 'OpenAlex API key. Polite-pool removed Feb 13 2026; required for sustained use.',
  },
  {
    key: 'UNPAYWALL_EMAIL',
    description: 'Polite-pool email appended to every Unpaywall request.',
  },
  {
    key: 'SCHOLAR_PDF_MAX_BYTES_PER_PAPER',
    description: 'Per-paper OA-PDF cache size cap in bytes. Default 10485760 (10 MB).',
  },
  // Hub AI v2 document upload caps — defaults applied when unset.
  {
    key: 'AI_DOC_RETENTION_HOURS_DEFAULT',
    description: 'Default retention window for unpinned AI uploads (hours; default 24).',
  },
  { key: 'AI_DOC_MAX_BYTES_FREE', description: 'Free-tier doc upload byte cap (default 5 MB).' },
  {
    key: 'AI_DOC_MAX_BYTES_VERIFIED',
    description: 'Verified-tier doc upload byte cap (default 15 MB).',
  },
  { key: 'AI_DOC_MAX_BYTES_PRO', description: 'Pro-tier doc upload byte cap (default 30 MB).' },
  { key: 'AI_DOC_MAX_PAGES_FREE', description: 'Free-tier PDF page cap (default 40).' },
  { key: 'AI_DOC_MAX_PAGES_VERIFIED', description: 'Verified-tier PDF page cap (default 60).' },
  {
    key: 'AI_DOC_MAX_PAGES_PRO',
    description: 'Pro-tier PDF page cap (default 100; Anthropic hard ceiling).',
  },
  {
    key: 'AI_DAILY_SPEND_USD_CEILING',
    description: 'Daily Anthropic spend ceiling in USD (default 100).',
  },
  {
    key: 'GOOGLE_BOOKS_API_KEY',
    description: 'Google Books API key for library weekly corpus sync (raises anonymous quota).',
  },
]

/* Required only when NODE_ENV === 'production'. Missing → hard exit at boot.
 * Promoted from OPTIONAL on 2026-04-30 after the security audit found that a
 * missing FIELD_ENCRYPTION_KEY in prod would cause encrypted PII columns to
 * silently fall back to plaintext. */
const REQUIRED_IN_PRODUCTION = [
  {
    key: 'FRONTEND_URL',
    minLength: 8,
    description:
      'Frontend origin used for Stripe checkout success / cancel URLs, password-reset links, and email redirects. Promoted to REQUIRED_IN_PRODUCTION wave-11 2026-05-14 alongside the prod-throw in payments.service.getFrontendAppUrl().',
  },
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
  {
    // Provenance manifests are encrypted with a key derived from this
    // secret. Without it lib/provenance.js falls back to a public dev
    // key, which would silently downgrade integrity guarantees on
    // creator-audit-grade sheets. Promoted to REQUIRED_IN_PRODUCTION
    // alongside the prod-throw added in lib/provenance.js.
    //
    // 64 hex chars = 32 raw bytes. Pattern enforced so a short
    // alphanumeric placeholder can't pass the boot check; mirrors the
    // FIELD_ENCRYPTION_KEY validation directly above.
    key: 'PROVENANCE_SECRET',
    minLength: 64,
    pattern: /^[0-9a-fA-F]{64}$/,
    description:
      'Encryption key for creator-audit provenance manifests. 32-byte hex (64 hex chars).',
  },
  {
    // Cloudflare R2 bucket dedicated to Hub AI v2 document uploads.
    // PRIVATE bucket — users access via signed URLs only (master plan
    // L2-HIGH-4). Separate from R2_BUCKET_NAME so a misconfigured
    // public-image bucket can't accidentally serve user uploads.
    key: 'R2_BUCKET_AI_ATTACHMENTS',
    description: 'Private Cloudflare R2 bucket for Hub AI v2 document uploads.',
  },
  {
    // Wave-12.11 — daily mirror of /data/uploads (avatars, covers,
    // attachments, group media, etc.) to a dedicated R2 bucket so
    // user-uploaded photos survive a Railway volume crash. Promoted
    // from OPTIONAL after the wave-12.11 audit pass found a missing
    // env var would silently disable backups in production — the
    // startup warning fires at warn level which Sentry doesn't
    // capture by default. Without it, a volume failure permanently
    // loses every photo. Fail-loud at boot is the only safe default.
    key: 'R2_BUCKET_UPLOAD_BACKUP',
    description:
      'Private Cloudflare R2 bucket name for the daily volume-uploads mirror. Without it, ' +
      'Railway volume corruption permanently loses every user-uploaded photo. Recovery ' +
      'procedure: scripts/restoreVolumeFromR2.js + RUNBOOK_DB_RESTORE.md.',
  },
]

const OPTIONAL = [
  { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth' },
  { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth' },
  // Scholar v1.5 / future expansion — declared so the boot summary
  // counts them as "configured" when set.
  { key: 'CORE_API_KEY', description: 'CORE OA full-text search (Scholar v1.5).' },
  { key: 'PUBMED_EMAIL', description: 'PubMed eutils polite-pool email (Scholar v1.5).' },
  {
    key: 'CROSSREF_USER_AGENT',
    description:
      'Override CrossRef polite User-Agent (default StudyHub/2.2 mailto:support@getstudyhub.org).',
  },
  {
    key: 'R2_BUCKET_SCHOLAR_PAPERS',
    description: 'R2 bucket name for cached OA paper PDFs (defaults to R2_BUCKET_NAME).',
  },
  { key: 'KMS_KEY_ARN', description: 'AWS KMS PII vault encryption' },
  { key: 'CLAMAV_HOST', description: 'ClamAV antivirus scanner' },
  { key: 'LIBRARY_SYNC_ENABLED', description: 'Hub AI v2 library weekly sync kill-switch.' },
  { key: 'LIBRARY_SYNC_CONTACT_EMAIL', description: 'Hub AI v2 library polite-pool email header.' },
  { key: 'R2_ACCOUNT_ID', description: 'Cloudflare R2 storage' },
  { key: 'R2_ACCESS_KEY_ID', description: 'Cloudflare R2 access key' },
  { key: 'R2_SECRET_ACCESS_KEY', description: 'Cloudflare R2 secret key' },
  { key: 'R2_BUCKET_NAME', description: 'Cloudflare R2 bucket name' },
  { key: 'R2_PUBLIC_URL', description: 'Cloudflare R2 public CDN base URL' },
  { key: 'STRIPE_PRICE_ID_PRO', description: 'Stripe Pro monthly price ID' },
  { key: 'STRIPE_PRICE_ID_PRO_YEARLY', description: 'Stripe Pro yearly price ID' },
  { key: 'STRIPE_PRICE_ID_DONATION', description: 'Stripe donation price ID (legacy)' },
  { key: 'WEBAUTHN_RP_ID', description: 'WebAuthn relying-party ID' },
  { key: 'WEBAUTHN_ORIGIN', description: 'WebAuthn origin URL' },
  { key: 'GOOGLE_BOOKS_API_KEY', description: 'Google Books API key' },
  { key: 'CSP_REPORT_URI', description: 'CSP violation reporting endpoint' },
  {
    key: 'EMERGENCY_DISABLE_ADMIN_MFA',
    description:
      'Sealed-glass-break override. Set to "true" in Railway to disable admin MFA ' +
      'enforcement during an incident (e.g. founder lost their 2FA device). Every ' +
      'login that uses it emits auth.admin_mfa_emergency_disabled to Sentry. Unset ' +
      'as soon as the incident is resolved.',
  },
  // R2_BUCKET_UPLOAD_BACKUP moved to REQUIRED_IN_PRODUCTION (top of
  // this file) after the wave-12.11 audit — a missing value silently
  // disables backups in prod, which the warn-level startup log
  // doesn't surface in Sentry.
  {
    key: 'UPLOAD_BACKUP_INTERVAL_MS',
    description: 'Override the upload-volume → R2 backup cadence. Default 86400000 (24h).',
  },
  {
    key: 'UPLOAD_BACKUP_RATE_LIMIT_PER_SEC',
    description:
      'Cap on upload-backup mirror rate (objects/sec). Default 10. Lower if you ' +
      'see Railway egress spikes during the nightly pass.',
  },
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
    log.error({ event: 'secrets.missing_required', missing }, 'Missing required secrets')
    if (isProduction) {
      log.fatal(
        { event: 'secrets.production_exit' },
        'Cannot start in production with missing required secrets. Exiting.',
      )
      process.exit(1)
    }
  }

  if (warnings.length > 0) {
    log.warn(
      { event: 'secrets.missing_recommended', warnings },
      'Missing recommended secrets (features will be degraded)',
    )
  }

  const configured =
    REQUIRED.length + REQUIRED_IN_PRODUCTION.length + RECOMMENDED.length + OPTIONAL.length
  const set = [...REQUIRED, ...REQUIRED_IN_PRODUCTION, ...RECOMMENDED, ...OPTIONAL].filter(
    (s) => process.env[s.key],
  ).length

  log.info(
    { event: 'secrets.summary', configured: set, total: configured },
    `Secrets: ${set}/${configured} configured.`,
  )
}

module.exports = {
  validateSecrets,
  REQUIRED,
  REQUIRED_IN_PRODUCTION,
  RECOMMENDED,
  OPTIONAL,
}

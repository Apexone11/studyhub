/**
 * seedFeatureFlags.js — prod-safe provisioner for design_v2_* FeatureFlag rows.
 *
 * Standalone counterpart to `seedBetaUsers.js`. This script is safe
 * to run in any environment: no user data, no fake accounts, no
 * sensitive inserts. It only upserts the SHIPPED_DESIGN_V2_FLAGS rows
 * with `enabled: true`.
 *
 * Idempotent: running twice produces no diff. `upsert` preserves any
 * runtime changes an operator made to a row's description or rollout
 * percentage (we don't re-write those on updates).
 *
 * Contract (decision #20, CLAUDE.md §12): the client evaluates flags
 * fail-CLOSED. A shipped feature whose FeatureFlag row is missing in
 * prod will be invisible to users until this script runs. In-flight
 * flags intentionally have NO row so they stay off by default. When a
 * phase ships, its flag name moves into SHIPPED_DESIGN_V2_FLAGS and
 * the next deploy's `seed:flags` run adds the row.
 *
 * Usage (prod):
 *   DATABASE_URL=... DIRECT_URL=... node scripts/seedFeatureFlags.js
 *
 * Usage (local):
 *   npm --prefix backend run seed:flags
 *   — or automatically as part of `npm --prefix backend run seed:beta`.
 */
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

/**
 * Canonical list of design_v2_* flags that correspond to SHIPPED
 * features. Everything else intentionally has no row (fail-closed).
 *
 * When a new phase ships:
 *   1. Add its flag name here with a short `// Phase N — shipped YYYY-MM-DD` comment.
 *   2. Run `seed:flags` as part of the deploy that ships the phase.
 *   3. Remove the mirrored entry from `IN_FLIGHT_DESIGN_V2_FLAGS` in
 *      `seedBetaUsers.js` (documentation-only list — see note there).
 */
const SHIPPED_DESIGN_V2_FLAGS = [
  // Phase 1 — shipped 2026-04-23. Sectioned AppSidebar + welcome hero
  // + top-contributors widget on UserProfilePage.
  'design_v2_phase1_dashboard',
  // Phase 2 — shipped 2026-04-24. UpcomingExamsCard + /api/exams CRUD
  // + component-kit foundation.
  'design_v2_upcoming_exams',
  // Phase 3 — shipped 2026-04-28. Inline AiSuggestionCard on
  // UserProfilePage Overview + /api/ai/suggestions endpoints with
  // PII redaction + shared daily quota with Hub AI.
  'design_v2_ai_card',
  // Phase 4 — shipped 2026-04-27. Sheets browse refresh: Grid/List
  // toggle, previewText preview cards, cross-school search toggle,
  // filter pill selected state.
  'design_v2_sheets_grid',
  // Creator Audit — shipped 2026-04-30. Frontend consent modal +
  // /api/creator-audit + 5 audit primitives + soft-delete revocation
  // + acceptanceMethod provenance.
  //
  // PROD DEPLOY ORDER (non-negotiable; skipping step 3 surfaces the
  // consent modal to every existing user on their next publish):
  //   1. Deploy code with this list in place.
  //   2. `npx prisma migrate deploy` — applies the consent migrations
  //      including 20260430000001_add_consent_provenance_and_soft_delete.
  //   3. `npm --prefix backend run backfill:creator-consent -- --prod-confirm`
  //      — writes `acceptanceMethod='backfill'` rows for every
  //      existing user. Idempotent + re-runnable.
  //   4. `npm --prefix backend run seed:flags` — creates the
  //      FeatureFlag row that turns the gate on.
  //
  // If you forget step 3, the existing user base just sees the
  // consent modal on their next publish — disruptive, not
  // destructive. Run the backfill AFTER and they unblock on next
  // page load.
  'design_v2_creator_audit',
]

/**
 * Auth-flow feature flags. SHIPPED with `enabled: false` by default —
 * the backend already gates each flag with fail-CLOSED semantics, so a
 * non-existent row would also disable the feature, but we seed
 * explicit `enabled: false` rows here so the operator can flip them on
 * via the admin UI / Prisma Studio without first guessing the flag
 * name. Founder approval required to flip either to true.
 *
 *   flag_2fa_recovery_codes — exposes the regenerate / status / login-
 *     recovery endpoints + the Settings UI tab. Disabled by default;
 *     flip on in production once the founder has tested the flow on a
 *     non-admin account.
 *   flag_admin_mfa_required — when on, admins with `mfaRequired = true`
 *     are forced through 2FA on every login. Set the founder seat's
 *     mfaRequired column to true ONLY after this flag is on AND
 *     2FA has been verified working for the founder, otherwise the
 *     gate locks them out.
 */
const SHIPPED_AUTH_FLAGS_DISABLED_BY_DEFAULT = [
  'flag_2fa_recovery_codes',
  'flag_admin_mfa_required',
]

async function seedFeatureFlags(prisma) {
  const results = []
  for (const name of SHIPPED_DESIGN_V2_FLAGS) {
    const existing = await prisma.featureFlag.findUnique({ where: { name } })
    await prisma.featureFlag.upsert({
      where: { name },
      // Only create path sets enabled/description — update leaves
      // operator-made tweaks in place. If the row was flipped off for
      // incident response this keeps it off; flipping it back on is a
      // manual operator decision.
      update: {},
      create: {
        name,
        description: 'Design refresh v2 — SHIPPED. Seeded by scripts/seedFeatureFlags.js.',
        enabled: true,
        rolloutPercentage: 100,
      },
    })
    results.push({ name, existed: Boolean(existing), enabled: existing ? existing.enabled : true })
  }
  // Auth flags ship `enabled: false` by default (founder flips via
  // admin UI when ready). The same upsert-update-empty pattern means
  // this seed never overwrites a manual flip-on.
  for (const name of SHIPPED_AUTH_FLAGS_DISABLED_BY_DEFAULT) {
    const existing = await prisma.featureFlag.findUnique({ where: { name } })
    await prisma.featureFlag.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description:
          'Auth feature flag — SHIPPED but DISABLED by default. Founder flips via admin UI when ready.',
        enabled: false,
        rolloutPercentage: 0,
      },
    })
    results.push({
      name,
      existed: Boolean(existing),
      enabled: existing ? existing.enabled : false,
    })
  }
  return results
}

async function main() {
  const prisma = createPrismaClient()
  try {
    const results = await seedFeatureFlags(prisma)
    for (const r of results) {
      if (r.existed) {
        console.log(`[flags] kept ${r.name} (existing enabled=${r.enabled})`)
      } else {
        console.log(`[flags] seeded ${r.name} (enabled=true, rollout=100%)`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Only run as a CLI when invoked directly. When required from
// `seedBetaUsers.js` the `seedFeatureFlags` helper is imported and
// driven against the beta script's own prisma client.
if (require.main === module) {
  main().catch((err) => {
    console.error('[flags] seed failed:', err)
    process.exit(1)
  })
}

module.exports = { seedFeatureFlags, SHIPPED_DESIGN_V2_FLAGS }

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

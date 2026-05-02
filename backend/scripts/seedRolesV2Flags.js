/**
 * Seed the three Roles v2 feature flags (docs/internal/roles-and-permissions-plan.md §13).
 *
 * Safe to run multiple times — uses upsert. Per-flag behavior:
 *   - `forceEnabled: true` flags are reasserted to enabled=true, rollout=100%
 *     on every boot. Use for shipped infrastructure flags that must always be
 *     on — an accidental admin-UI flip-off self-heals on the next deploy.
 *     The backend env var `ROLES_V2_HONOR_ADMIN_TOGGLES=true` opts out (lets
 *     the admin UI's enabled state win for that boot, e.g. for incident-
 *     response kill-switching without a code change).
 *   - Other flags use upsert-without-overwrite (existing enabled state wins).
 *
 * The frontend is fail-closed, so production must run this seed before
 * relying on any of these flags.
 *
 * Usage (prod):
 *   DATABASE_URL=... DIRECT_URL=... node scripts/seedRolesV2Flags.js
 */
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const FLAGS = [
  {
    name: 'flag_roles_v2',
    description:
      'Master gate for Roles v2: Self-learner feed redesign, sidebar topics, and related UI.',
  },
  {
    name: 'flag_roles_v2_oauth_picker',
    description:
      'Google OAuth role picker at /signup/role. Force-enabled at boot — set ROLES_V2_HONOR_ADMIN_TOGGLES=true to allow admin-UI kill-switching without a redeploy.',
    forceEnabled: true,
  },
  {
    name: 'flag_roles_v2_revert_window',
    description: 'Settings RoleTile with 2-day revert flow. Toggle off for a read-only role tile.',
  },
]

function honorAdminToggles() {
  return /^(1|true|yes|on)$/i.test(String(process.env.ROLES_V2_HONOR_ADMIN_TOGGLES || '').trim())
}

async function seedRolesV2Flags(prisma) {
  const results = []
  const respectAdminFlips = honorAdminToggles()
  for (const flag of FLAGS) {
    const existing = await prisma.featureFlag.findUnique({ where: { name: flag.name } })
    const shouldForce = flag.forceEnabled && !respectAdminFlips
    await prisma.featureFlag.upsert({
      where: { name: flag.name },
      update: shouldForce
        ? { description: flag.description, enabled: true, rolloutPercentage: 100 }
        : { description: flag.description },
      create: {
        name: flag.name,
        description: flag.description,
        enabled: true,
        rolloutPercentage: 100,
      },
    })
    results.push({
      name: flag.name,
      existed: Boolean(existing),
      enabled: shouldForce ? true : existing ? existing.enabled : true,
      rolloutPercentage: shouldForce ? 100 : existing ? existing.rolloutPercentage : 100,
      forced: shouldForce,
    })
  }
  return results
}

async function main() {
  const prisma = createPrismaClient()
  try {
    const results = await seedRolesV2Flags(prisma)
    for (const r of results) {
      console.log(
        r.existed
          ? `[roles-v2] kept ${r.name} (enabled=${r.enabled}, rollout=${r.rolloutPercentage}%)`
          : `[roles-v2] seeded ${r.name} (enabled=true, rollout=100%)`,
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[roles-v2] seed failed:', err)
    process.exit(1)
  })
}

module.exports = { seedRolesV2Flags, FLAGS }

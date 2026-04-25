/**
 * Seed the three Roles v2 feature flags (docs/internal/roles-and-permissions-plan.md §13).
 *
 * Safe to run multiple times — uses upsert, so existing rows keep their
 * `enabled` state. New rows are created with `enabled: true` so rollout
 * matches the fail-open frontend default.
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
      'Google OAuth role picker at /signup/role. Toggle off to block new Google signups.',
  },
  {
    name: 'flag_roles_v2_revert_window',
    description: 'Settings RoleTile with 2-day revert flow. Toggle off for a read-only role tile.',
  },
]

const prisma = createPrismaClient()

async function main() {
  for (const flag of FLAGS) {
    const existing = await prisma.featureFlag.findUnique({ where: { name: flag.name } })
    await prisma.featureFlag.upsert({
      where: { name: flag.name },
      update: {
        description: flag.description,
      },
      create: {
        name: flag.name,
        description: flag.description,
        enabled: true,
        rolloutPercentage: 100,
      },
    })
    console.log(
      existing
        ? `[roles-v2] kept ${flag.name} (enabled=${existing.enabled}, rollout=${existing.rolloutPercentage}%)`
        : `[roles-v2] seeded ${flag.name} (enabled=true, rollout=100%)`,
    )
  }
}

main()
  .catch((err) => {
    console.error('[roles-v2] seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

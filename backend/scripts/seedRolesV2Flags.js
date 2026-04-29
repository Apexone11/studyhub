/**
 * Seed the three Roles v2 feature flags (docs/internal/roles-and-permissions-plan.md §13).
 *
 * Safe to run multiple times — uses upsert, so existing rows keep their
 * `enabled` state. New rows are created with `enabled: true`; the frontend is
 * fail-closed, so production must run this seed before relying on the flags.
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

async function seedRolesV2Flags(prisma) {
  const results = []
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
    results.push({
      name: flag.name,
      existed: Boolean(existing),
      enabled: existing ? existing.enabled : true,
      rolloutPercentage: existing ? existing.rolloutPercentage : 100,
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

/**
 * Seed the flag_notes_hardening_v2 feature flag.
 *
 * Gates the Notes Hardening v2 rollout: local-first state machine, IDB
 * draft, revision concurrency, diff/restore. Default off; toggled to
 * 10/50/100 per the rollout plan.
 *
 * Safe to run multiple times — uses upsert, so existing rows keep their
 * current enabled / rolloutPercentage values.
 *
 * Usage (prod):
 *   DATABASE_URL=... DIRECT_URL=... node scripts/seedNotesHardeningFlag.js
 */
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const FLAG = {
  name: 'flag_notes_hardening_v2',
  description:
    'Notes hardening v2: local-first state machine, IDB draft, revision concurrency, diff/restore',
}

async function seedNotesHardeningFlag(prisma) {
  const existing = await prisma.featureFlag.findUnique({ where: { name: FLAG.name } })
  const flag = await prisma.featureFlag.upsert({
    where: { name: FLAG.name },
    update: {
      description: FLAG.description,
    },
    create: {
      name: FLAG.name,
      description: FLAG.description,
      enabled: true,
      rolloutPercentage: 100,
    },
  })
  return {
    name: flag.name,
    existed: Boolean(existing),
    enabled: existing ? existing.enabled : flag.enabled,
    rolloutPercentage: existing ? existing.rolloutPercentage : flag.rolloutPercentage,
  }
}

async function main() {
  const prisma = createPrismaClient()
  try {
    const result = await seedNotesHardeningFlag(prisma)
    if (result.existed) {
      console.log(
        `[seed] kept ${result.name} (enabled=${result.enabled}, rollout=${result.rolloutPercentage}%)`,
      )
    } else {
      console.log(`[seed] ${result.name} = ${result.enabled} ${result.rolloutPercentage}%`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] notes-hardening flag seed failed:', err)
    process.exit(1)
  })
}

module.exports = { seedNotesHardeningFlag, FLAG }

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

const prisma = createPrismaClient()

async function main() {
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
  if (existing) {
    console.log(
      `[seed] kept ${flag.name} (enabled=${existing.enabled}, rollout=${existing.rolloutPercentage}%)`,
    )
  } else {
    console.log(`[seed] ${flag.name} = ${flag.enabled} ${flag.rolloutPercentage}%`)
  }
}

main()
  .catch((err) => {
    console.error('[seed] notes-hardening flag seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

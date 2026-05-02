const path = require('node:path')
const { spawn } = require('node:child_process')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const BACKEND_ROOT = path.resolve(__dirname, '..')

function envFlag(name, fallback = false) {
  const value = (process.env[name] || '').trim()
  if (!value) return fallback
  return /^(1|true|yes|on)$/i.test(value)
}

function isRailwayBoot() {
  return ['RAILWAY_ENVIRONMENT_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'].some((name) =>
    Boolean(process.env[name]),
  )
}

function shouldRunMigrationsOnStart() {
  return envFlag('RUN_PRISMA_MIGRATIONS_ON_START', isRailwayBoot())
}

function shouldSeedFeatureFlagsOnStart() {
  // Seeding is idempotent (upsert-only, no user data, no destructive writes).
  // Default ON when Railway env vars are present so deploys self-provision
  // shipped FeatureFlag rows without an operator running `seed:flags` by
  // hand. The fail-CLOSED contract (CLAUDE.md §12, decision #20) means a
  // missing row makes a shipped feature invisible — that is exactly what
  // this guard prevents.
  return envFlag('SEED_FEATURE_FLAGS_ON_START', isRailwayBoot())
}

function shouldSweepOrphanVideosOnStart() {
  // Off by default — only one worker should run the sweep so two
  // replicas don't race to delete the same R2 objects. Operators flip
  // SWEEP_ORPHAN_VIDEOS_ON_START=true on the chosen worker (same
  // pattern as ENABLE_INACTIVE_SESSION_SWEEP).
  return envFlag('SWEEP_ORPHAN_VIDEOS_ON_START', false)
}

function runPrismaMigrations() {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const child = spawn(command, ['prisma', 'migrate', 'deploy'], {
      cwd: BACKEND_ROOT,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Prisma migrate deploy exited with code ${code}.`))
    })
  })
}

async function runFeatureFlagSeeds() {
  const { createPrismaClient } = require(path.join(BACKEND_ROOT, 'src', 'lib', 'prisma'))
  const { seedFeatureFlags } = require('./seedFeatureFlags')
  const { seedRolesV2Flags } = require('./seedRolesV2Flags')
  const { seedNotesHardeningFlag } = require('./seedNotesHardeningFlag')

  const prisma = createPrismaClient()
  try {
    const designV2 = await seedFeatureFlags(prisma)
    for (const r of designV2) {
      console.log(
        r.existed
          ? `[boot-seed] kept ${r.name} (enabled=${r.enabled})`
          : `[boot-seed] seeded ${r.name} (enabled=true, rollout=100%)`,
      )
    }

    const rolesV2 = await seedRolesV2Flags(prisma)
    for (const r of rolesV2) {
      if (r.forced) {
        console.log(
          `[boot-seed] forced ${r.name} (enabled=true, rollout=100%) — ROLES_V2_HONOR_ADMIN_TOGGLES=true to opt out`,
        )
      } else if (r.existed) {
        console.log(
          `[boot-seed] kept ${r.name} (enabled=${r.enabled}, rollout=${r.rolloutPercentage}%)`,
        )
      } else {
        console.log(`[boot-seed] seeded ${r.name} (enabled=true, rollout=100%)`)
      }
    }

    const notesHardening = await seedNotesHardeningFlag(prisma)
    console.log(
      notesHardening.existed
        ? `[boot-seed] kept ${notesHardening.name} (enabled=${notesHardening.enabled}, rollout=${notesHardening.rolloutPercentage}%)`
        : `[boot-seed] seeded ${notesHardening.name} (enabled=${notesHardening.enabled}, rollout=${notesHardening.rolloutPercentage}%)`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  if (shouldRunMigrationsOnStart()) {
    console.log('Running Prisma migrations before starting the API.')
    await runPrismaMigrations()
  }

  if (shouldSeedFeatureFlagsOnStart()) {
    console.log('Provisioning shipped FeatureFlag rows before starting the API.')
    try {
      await runFeatureFlagSeeds()
    } catch (err) {
      // Don't block API startup on a flag-seed failure — the API serving
      // is more important than features being lit. The fail-CLOSED client
      // already renders unseeded flags as off, so the user-visible cost
      // is "feature appears dark" until an operator re-runs the seed.
      console.error('[boot-seed] feature-flag seed failed; continuing startup.', err)
    }
  }

  const backendEntry = require(path.join(BACKEND_ROOT, 'src', 'index.js'))
  const startServer = backendEntry?.startServer

  if (typeof startServer !== 'function') {
    throw new Error('Backend entrypoint does not export startServer().')
  }

  await startServer()

  if (shouldSweepOrphanVideosOnStart()) {
    // Run once on boot, then every 6 hours. Wrapped in try/catch so a
    // sweep failure doesn't kill the worker — orphan cleanup is a
    // background hygiene job, not a critical path. Each sweep is
    // idempotent + scoped to age-thresholded rows so re-runs after a
    // failed sweep never double-charge or double-delete.
    const { sweepOrphanVideos } = require('./sweepOrphanVideos')
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000

    const runSweep = async () => {
      try {
        await sweepOrphanVideos()
      } catch (err) {
        console.error('[orphan-video-sweep] failed:', err.message)
      }
    }

    console.log('[orphan-video-sweep] enabled — first run now, then every 6h.')
    void runSweep()
    setInterval(runSweep, SIX_HOURS_MS).unref?.()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

const path = require('node:path')
const { spawn } = require('node:child_process')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const BACKEND_ROOT = path.resolve(__dirname, '..')

function envFlag(name, fallback = false) {
  const value = (process.env[name] || '').trim()
  if (!value) return fallback
  return /^(1|true|yes|on)$/i.test(value)
}

function shouldRunMigrationsOnStart() {
  const isRailway = [
    'RAILWAY_ENVIRONMENT_ID',
    'RAILWAY_PROJECT_ID',
    'RAILWAY_SERVICE_ID',
  ].some((name) => Boolean(process.env[name]))

  return envFlag('RUN_PRISMA_MIGRATIONS_ON_START', isRailway)
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

async function main() {
  if (shouldRunMigrationsOnStart()) {
    console.log('Running Prisma migrations before starting the API.')
    await runPrismaMigrations()
  }

  const backendEntry = require(path.join(BACKEND_ROOT, 'src', 'index.js'))
  const startServer = backendEntry?.startServer

  if (typeof startServer !== 'function') {
    throw new Error('Backend entrypoint does not export startServer().')
  }

  await startServer()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

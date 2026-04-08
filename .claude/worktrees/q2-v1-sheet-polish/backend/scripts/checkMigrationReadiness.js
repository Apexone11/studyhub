const { spawnSync } = require('node:child_process')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function logStep(message) {
  console.log(`\n==> ${message}`)
}

const runSmoke = process.argv.includes('--with-smoke')
const runDeploy = process.argv.includes('--deploy')

if (runDeploy) {
  logStep('Applying Prisma migrations (prisma migrate deploy)')
  run(commandName('npx'), ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'])
  console.log('Prisma migrate deploy completed.')
}

logStep('Checking Prisma migration status')
run(commandName('npx'), ['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma'])
console.log('Migration status is clean.')

if (runSmoke) {
  logStep('Running route smoke checks')
  run(commandName('npm'), ['run', 'smoke:routes'])
  console.log('Route smoke checks passed.')
}

logStep('Migration readiness check complete')

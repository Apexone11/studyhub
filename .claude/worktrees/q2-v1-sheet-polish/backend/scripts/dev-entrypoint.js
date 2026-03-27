const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const packageLockPath = path.join(appRoot, 'package-lock.json')
const nodeModulesDir = path.join(appRoot, 'node_modules')
const stateDir = path.join(nodeModulesDir, '.studyhub')
const lockHashPath = path.join(stateDir, 'package-lock.sha256')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const requiredPackages = [
  'nodemon',
  'prisma',
  '@prisma/client',
]

function packageLockHash() {
  return createHash('sha256')
    .update(fs.readFileSync(packageLockPath))
    .digest('hex')
}

function hasRequiredPackages() {
  return requiredPackages.every((pkg) => fs.existsSync(path.join(nodeModulesDir, pkg, 'package.json')))
}

function needsInstall() {
  if (!fs.existsSync(packageLockPath)) return false
  if (!fs.existsSync(nodeModulesDir)) return true
  if (!hasRequiredPackages()) return true
  if (!fs.existsSync(lockHashPath)) return true

  const savedHash = fs.readFileSync(lockHashPath, 'utf8').trim()
  return savedHash !== packageLockHash()
}

function runOrExit(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (needsInstall()) {
  console.log('Refreshing backend dependencies for the Docker dev container...')
  runOrExit(npmCommand, ['ci', '--include=dev'])
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(lockHashPath, `${packageLockHash()}\n`, 'utf8')
}

runOrExit(npxCommand, ['prisma', 'generate'])
runOrExit(npxCommand, ['prisma', 'migrate', 'deploy'])
runOrExit(npmCommand, ['run', 'dev'])

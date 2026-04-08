const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const packageLockPath = path.join(appRoot, 'package-lock.json')
const nodeModulesDir = path.join(appRoot, 'node_modules')
const stateDir = path.join(appRoot, '.studyhub')
const lockHashPath = path.join(stateDir, 'package-lock.sha256')
const prismaSchemaPath = path.join(appRoot, 'prisma', 'schema.prisma')
const prismaSchemaHashPath = path.join(stateDir, 'prisma-schema.sha256')
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

function prismaSchemaHash() {
  return createHash('sha256')
    .update(fs.readFileSync(prismaSchemaPath))
    .digest('hex')
}

function hasRequiredPackages() {
  return requiredPackages.every((pkg) => fs.existsSync(path.join(nodeModulesDir, pkg, 'package.json')))
}

function needsInstall() {
  if (!fs.existsSync(packageLockPath)) return false
  if (!fs.existsSync(nodeModulesDir)) return true
  if (!hasRequiredPackages()) return true
  if (!fs.existsSync(lockHashPath)) return false

  const savedHash = fs.readFileSync(lockHashPath, 'utf8').trim()
  return savedHash !== packageLockHash()
}

function hasPrismaClient() {
  return fs.existsSync(path.join(nodeModulesDir, '@prisma', 'client', 'index.js'))
    && fs.existsSync(path.join(nodeModulesDir, '.prisma', 'client', 'index.js'))
}

function needsPrismaGenerate() {
  if (!fs.existsSync(prismaSchemaPath)) return false
  if (!hasPrismaClient()) return true
  if (!fs.existsSync(prismaSchemaHashPath)) return true

  const savedHash = fs.readFileSync(prismaSchemaHashPath, 'utf8').trim()
  return savedHash !== prismaSchemaHash()
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

const installRequired = needsInstall()
const prismaGenerateRequired = installRequired || needsPrismaGenerate()

if (installRequired) {
  process.stdout.write('Refreshing backend dependencies for the Docker dev container...\n')
  runOrExit(npmCommand, ['ci', '--include=dev'])
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(lockHashPath, `${packageLockHash()}\n`, 'utf8')
}

if (prismaGenerateRequired) {
  fs.mkdirSync(stateDir, { recursive: true })
  runOrExit(npxCommand, ['prisma', 'generate'])
  fs.writeFileSync(prismaSchemaHashPath, `${prismaSchemaHash()}\n`, 'utf8')
}

runOrExit(npxCommand, ['prisma', 'migrate', 'deploy'])
runOrExit(npmCommand, ['run', 'dev'])

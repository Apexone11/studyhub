/* global process */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const packageLockPath = path.join(appRoot, 'package-lock.json')
const nodeModulesDir = path.join(appRoot, 'node_modules')
const stateDir = path.join(nodeModulesDir, '.studyhub')
const lockHashPath = path.join(stateDir, 'package-lock.sha256')
const host = '0.0.0.0'
const port = String(process.env.PORT || 5173)
const requiredPackages = [
  'vite',
  '@vitejs/plugin-react',
  'rollup-plugin-visualizer',
]

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function packageLockHash() {
  return createHash('sha256')
    .update(readFileSync(packageLockPath))
    .digest('hex')
}

function hasRequiredPackages() {
  return requiredPackages.every((pkg) => existsSync(path.join(nodeModulesDir, pkg, 'package.json')))
}

function needsInstall() {
  if (!existsSync(packageLockPath)) return false
  if (!existsSync(nodeModulesDir)) return true
  if (!hasRequiredPackages()) return true
  if (!existsSync(lockHashPath)) return true

  const savedHash = readFileSync(lockHashPath, 'utf8').trim()
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
  console.log('Refreshing frontend dependencies for the Docker dev container...')
  runOrExit(npmCommand(), ['ci', '--include=dev', '--legacy-peer-deps'])
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(lockHashPath, `${packageLockHash()}\n`, 'utf8')
}

runOrExit(npmCommand(), ['run', 'dev', '--', '--host', host, '--port', port])

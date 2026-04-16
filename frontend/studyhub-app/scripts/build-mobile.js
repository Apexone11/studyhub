#!/usr/bin/env node
/* global process */
/**
 * Mobile build pipeline for the Capacitor Android shell.
 *
 * Steps:
 *   1. Build the Vite web bundle with the mobile env (`.env.mobile.production`)
 *      so the API base resolves to the Railway backend instead of localhost.
 *   2. Run `npx cap sync android` to copy `dist/` into the Android project
 *      and refresh any added Capacitor plugins.
 *
 * After this completes, the Android project is ready to be opened in Android
 * Studio or built via `npx cap run android` / `./gradlew assembleDebug`.
 *
 * This script never touches the production web deployment — the web bundle
 * built here is mobile-only and is not uploaded to Railway.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

function run(command, args, extraEnv = {}) {
  const prettyCmd = `${command} ${args.join(' ')}`
  console.log(`\n\u2192 ${prettyCmd}`)
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    console.error(`\nCommand failed (exit ${result.status}): ${prettyCmd}`)
    process.exit(result.status ?? 1)
  }
}

function main() {
  const envFile = path.join(projectRoot, '.env.mobile.production')
  if (!existsSync(envFile)) {
    console.error(
      `Missing ${envFile}. Copy the template from the committed .env.mobile.production and set VITE_GOOGLE_CLIENT_ID before running this script.`,
    )
    process.exit(1)
  }

  // Vite picks up `.env.<mode>.production` when run with `--mode mobile`.
  // The file is loaded before plugin resolution, so VITE_MOBILE_API_URL makes
  // it into the bundled config.js.
  run('npx', ['vite', 'build', '--mode', 'mobile'])
  run('npx', ['cap', 'sync', 'android'])

  console.log('\nMobile build complete.')
  console.log('Next: npx cap run android  (or open android/ in Android Studio)')
}

main()

/**
 * screenshotCleanup.js — Delete old PNGs from tests/screenshots/.
 *
 * Run standalone:  node tests/helpers/screenshotCleanup.js
 * Or import:       import { cleanScreenshots } from './helpers/screenshotCleanup'
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SCREENSHOTS_DIR = resolve(__dirname, '..', 'screenshots')

export function cleanScreenshots() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true })
    console.log('Created screenshots directory.')
    return
  }

  const pngs = readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'))
  for (const file of pngs) {
    rmSync(join(SCREENSHOTS_DIR, file), { force: true })
  }
  // Also remove stale gallery
  const gallery = join(SCREENSHOTS_DIR, 'gallery.html')
  if (existsSync(gallery)) rmSync(gallery, { force: true })

  console.log(`Cleaned ${pngs.length} old screenshot(s) from tests/screenshots/`)
}

// Run if invoked directly
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__dirname, 'screenshotCleanup.js')
if (isMain) {
  cleanScreenshots()
}

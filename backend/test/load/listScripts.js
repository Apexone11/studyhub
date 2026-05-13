/**
 * listScripts.js — `npm run load:all` entry point.
 *
 * Deliberately does NOT run the load scripts. The brief is explicit:
 * the first time someone runs them is a deliberate ops choice. This
 * script lists what's available and shows the invocation line for
 * each, so an operator can copy-paste the one they want.
 */

const path = require('node:path')
const fs = require('node:fs')

const here = __dirname
const entries = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.load.js'))
  .sort()

if (entries.length === 0) {
  process.stdout.write('No load scripts found in backend/test/load/.\n')
  process.exit(0)
}

process.stdout.write('\nStudyHub backend load scripts\n')
process.stdout.write('─────────────────────────────────────────────────────────────\n')
process.stdout.write('These scripts hit a real dev server. They are NOT run by this\n')
process.stdout.write('command — run them manually, one at a time.\n\n')
process.stdout.write('Pre-reqs (see ./README.md for the full list):\n')
process.stdout.write('  1. npm --prefix backend run dev\n')
process.stdout.write('  2. npm --prefix backend run seed:beta\n')
process.stdout.write("  3. export LOAD_AUTH_COOKIE='studyhub_session=...'\n")
process.stdout.write('  4. (ai-analyze only) ANTHROPIC_API_KEY=mock + LOAD_AI_SHEET_ID=N\n\n')
process.stdout.write('Available scripts:\n')

for (const file of entries) {
  const abs = path.join(here, file)
  // Pull the first JSDoc line for a one-liner description.
  const text = fs.readFileSync(abs, 'utf8')
  const firstLine = text.split('\n').find((l) => l.includes('—')) || ''
  const desc = firstLine.replace(/^\s*\*\s*/, '').trim()
  process.stdout.write(`  • ${desc || file}\n`)
  process.stdout.write(`      node backend/test/load/${file}\n\n`)
}

process.stdout.write('See backend/test/load/README.md for interpretation + alarm thresholds.\n\n')

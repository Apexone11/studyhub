/**
 * sheets-list.load.js — GET /api/sheets?search=calc
 *
 * Browse / search query on the Sheets page. Frequent during exam weeks.
 *
 * Alarm: p99 > 500ms (read endpoint).
 *
 * Pre-reqs: see feed-list.load.js header.
 *
 * Run:   node backend/test/load/sheets-list.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write(
    'LOAD_AUTH_COOKIE is not set. /api/sheets requires auth for non-public results. ' +
      'Export the studyhub_session cookie before running.\n',
  )
  process.exit(2)
}

runLoadTest({
  name: 'sheets-list',
  path: '/api/sheets?search=calc',
  method: 'GET',
  headers: {
    cookie,
    accept: 'application/json',
  },
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

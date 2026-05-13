/**
 * search.load.js — GET /api/search?q=cs101&type=all&limit=10
 *
 * Global search modal (Ctrl-K) fans out to sheets / courses / users /
 * notes / groups in a single query. Joins + LIKE clauses across five
 * tables — this is the page most likely to slow down as the corpus
 * grows.
 *
 * Alarm: p99 > 500ms (read endpoint).
 *
 * Pre-reqs: see feed-list.load.js header.
 *
 * Run:   node backend/test/load/search.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write(
    'LOAD_AUTH_COOKIE is not set. /api/search requires auth. ' +
      'Export the studyhub_session cookie before running.\n',
  )
  process.exit(2)
}

runLoadTest({
  name: 'search',
  path: '/api/search?q=cs101&type=all&limit=10',
  method: 'GET',
  headers: {
    cookie,
    accept: 'application/json',
  },
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

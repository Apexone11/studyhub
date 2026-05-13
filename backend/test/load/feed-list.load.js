/**
 * feed-list.load.js — GET /api/feed?sort=ranked
 *
 * High-traffic ranked-feed endpoint. Every authenticated user lands on
 * /feed; this is the first thing that has to be fast or the app feels
 * slow on login.
 *
 * Alarm: p99 > 500ms (read endpoint).
 *
 * Pre-reqs:
 *   1. Backend dev server running: `npm --prefix backend run dev`
 *   2. DB seeded:                  `npm --prefix backend run seed:beta`
 *   3. Auth cookie exported:       LOAD_AUTH_COOKIE='studyhub_session=...'
 *      (log into the dev server in a browser, copy the cookie from
 *      DevTools → Application → Cookies)
 *
 * Run:   node backend/test/load/feed-list.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write(
    'LOAD_AUTH_COOKIE is not set. /api/feed requires auth. ' +
      'Export the studyhub_session cookie before running.\n',
  )
  process.exit(2)
}

runLoadTest({
  name: 'feed-list',
  path: '/api/feed?sort=ranked',
  method: 'GET',
  headers: {
    cookie,
    accept: 'application/json',
  },
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

/**
 * notifications.load.js — GET /api/notifications
 *
 * Notification list — fetched on bell-icon open and on initial app
 * mount. Joins through `Notification` + actor `User` rows; behavior at
 * high cardinality is worth profiling.
 *
 * Alarm: p99 > 500ms (read endpoint).
 *
 * Pre-reqs: see feed-list.load.js header.
 *
 * Run:   node backend/test/load/notifications.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write(
    'LOAD_AUTH_COOKIE is not set. /api/notifications requires auth. ' +
      'Export the studyhub_session cookie before running.\n',
  )
  process.exit(2)
}

runLoadTest({
  name: 'notifications',
  path: '/api/notifications',
  method: 'GET',
  headers: {
    cookie,
    accept: 'application/json',
  },
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

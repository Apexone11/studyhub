/**
 * messaging-unread.load.js — GET /api/messages/unread-total
 *
 * Polled by the AppSidebar badge on every authenticated page. Even a
 * 200ms regression here hurts every navigation because it blocks the
 * sidebar's first paint of the unread count.
 *
 * Alarm: p99 > 500ms (read endpoint). This one we'd ideally want closer
 * to 100ms because it runs on every page load.
 *
 * Pre-reqs: see feed-list.load.js header.
 *
 * Run:   node backend/test/load/messaging-unread.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write(
    'LOAD_AUTH_COOKIE is not set. /api/messages requires auth. ' +
      'Export the studyhub_session cookie before running.\n',
  )
  process.exit(2)
}

runLoadTest({
  name: 'messaging-unread',
  path: '/api/messages/unread-total',
  method: 'GET',
  headers: {
    cookie,
    accept: 'application/json',
  },
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

/**
 * ai-analyze.load.js — POST /api/ai/sheets/:id/analyze
 *
 * AI sheet review endpoint. The handler builds a prompt from the sheet
 * content and calls Anthropic. Load-testing the real Anthropic call
 * would burn credits and rate-limit our key, so we gate on a "mock"
 * sentinel — when ANTHROPIC_API_KEY=mock (and NODE_ENV !== production)
 * the handler returns a canned response without hitting Anthropic.
 *
 * Alarm: p99 > 2000ms (AI endpoint). The mock path should be much
 * faster than that since it skips network entirely; if the mock is
 * slow, the slowdown is elsewhere in the route (spend-ceiling write,
 * Prisma round-trip, HTML scan path).
 *
 * Pre-reqs:
 *   1. Backend dev server running with mock key:
 *        ANTHROPIC_API_KEY=mock npm --prefix backend run dev
 *      (or set ANTHROPIC_API_KEY=mock in backend/.env)
 *   2. DB seeded:                  `npm --prefix backend run seed:beta`
 *   3. Auth cookie exported:       LOAD_AUTH_COOKIE='studyhub_session=...'
 *   4. Target sheet id exported:   LOAD_AI_SHEET_ID=42
 *      (any sheet the cookie-holder can read)
 *
 * Run:   node backend/test/load/ai-analyze.load.js
 */

const { runLoadTest } = require('./loadHarness')

const cookie = process.env.LOAD_AUTH_COOKIE || ''
if (!cookie) {
  process.stderr.write('LOAD_AUTH_COOKIE is not set. /api/ai/sheets/:id/analyze requires auth.\n')
  process.exit(2)
}

const sheetId = Number.parseInt(process.env.LOAD_AI_SHEET_ID || '', 10)
if (!Number.isInteger(sheetId) || sheetId < 1) {
  process.stderr.write(
    'LOAD_AI_SHEET_ID must be a positive integer (a sheet the auth cookie can read).\n',
  )
  process.exit(2)
}

// AI endpoints share the per-user message limiter — at 50 VUs hammering
// one user this will trip immediately. The mock path still goes through
// reserveSpend() + the limiter so the run will produce a mix of 200s
// and 429s. That's the correct shape to measure (alarm conditions
// should NOT count 429s as latency wins).
process.stdout.write(
  '[note] expect 429s once the per-user AI limit trips. ' +
    'Throughput numbers below are total (200 + 429); error rate captures the split.\n',
)

runLoadTest({
  name: 'ai-analyze',
  path: `/api/ai/sheets/${sheetId}/analyze`,
  method: 'POST',
  headers: {
    cookie,
    accept: 'application/json',
    'content-type': 'application/json',
    // originAllowlist accepts localhost on any port — keeps the CSRF
    // check happy from a non-browser client like this harness.
    origin: 'http://localhost:4000',
  },
  body: JSON.stringify({}),
}).catch((err) => {
  process.stderr.write(`Harness crashed: ${err && err.message}\n`)
  process.exit(1)
})

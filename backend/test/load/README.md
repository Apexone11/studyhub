# Backend Load Tests

These scripts measure latency and throughput on six high-traffic
endpoints. They are NOT run automatically — running them hits a real
server and can thrash the dev DB. The first time you run them is a
deliberate ops choice.

## What's measured

Each script:

- Ramps from 1 → 50 concurrent virtual users (VUs) over 30 seconds.
- Holds at 50 VUs for 60 seconds (90s total).
- Reports `p50`, `p95`, `p99`, error rate, and throughput.

Latency is measured client-side, response time to last byte. Each VU is
its own `worker_threads` Worker so the issuing loop isn't competing
with response-parsing on the same event loop — keeps tail-latency
numbers honest. No external deps; raw Node 20 `fetch` only.

## Pre-requisites

1. **Backend dev server running.** From the repo root:

   ```powershell
   npm --prefix backend run dev
   ```

   This boots `nodemon src/index.js` on `http://localhost:4000`.

2. **DB seeded.** From the repo root:

   ```powershell
   npm --prefix backend run seed:beta
   ```

   Produces a `beta_student1` account plus realistic content so feed /
   sheets / search return non-empty result sets.

3. **Auth cookie exported.** All endpoints require auth. Log into the
   dev server in a browser, open DevTools → Application → Cookies →
   `http://localhost:4000`, copy the `studyhub_session` value, then:

   ```powershell
   $env:LOAD_AUTH_COOKIE = 'studyhub_session=eyJhbGc...'
   ```

   (POSIX shells: `export LOAD_AUTH_COOKIE='studyhub_session=...'`.)

4. **For `ai-analyze.load.js` only:** mock the Anthropic call AND pick
   a target sheet id.

   In `backend/.env` set:

   ```text
   ANTHROPIC_API_KEY=mock
   ```

   (Or prefix the dev run: `ANTHROPIC_API_KEY=mock npm --prefix backend run dev`.)

   The handler short-circuits to a canned JSON response when the key is
   exactly `mock` AND `NODE_ENV !== 'production'`. The gate is wired in
   `backend/src/modules/ai/ai.sheet.routes.js#getClient`. It can NEVER
   trigger in production — a deploy that accidentally set the key to
   `mock` would 500 instead of serving canned content. The defense is
   intentional.

   Then pick a sheet id the seeded `beta_student1` can read:

   ```powershell
   $env:LOAD_AI_SHEET_ID = '1'
   ```

## Run a single script

```powershell
node backend/test/load/feed-list.load.js
node backend/test/load/sheets-list.load.js
node backend/test/load/search.load.js
node backend/test/load/messaging-unread.load.js
node backend/test/load/notifications.load.js
node backend/test/load/ai-analyze.load.js
```

Or use the helper script to see what's available:

```powershell
npm --prefix backend run load:all
```

That script does NOT run anything — it prints the available scripts and
the manual invocation lines. Running them is on you.

## Interpreting the output

```text
── Load test: feed-list ───────────────────────────────────────────
Target:   GET http://localhost:4000/api/feed?sort=ranked
Duration: 90s (30s ramp 1→50 VUs, 60s hold @ 50)

Samples:    4823
Errors:     12 (0.25%)
Throughput: 53.6 req/s

Latency (ms):
  p50: 41
  p95: 187
  p99: 432
  max: 1041
```

- **p50** — half the requests were faster than this. The median
  experience for a user during peak load.
- **p95** — 5% of requests were slower than this. The "feels-slow"
  threshold. Anything above ~500ms here on a list page is going to be
  noticed.
- **p99** — 1% of requests were slower than this. The "rage-quit"
  threshold. This is what alarms should fire on. p99 is dominated by
  GC pauses, lock contention, slow queries on cold cache — exactly the
  things load tests are meant to surface.
- **Errors** — count of 4xx + 5xx + connection failures. Note:
  `ai-analyze` will report ~30-60% errors because the per-user AI
  message limiter trips quickly under 50 VUs hitting one user. That's
  expected — the limiter is doing its job. Look at p99 of the
  successful 200s in isolation if you need to compare AI-handler perf
  against the read endpoints.
- **Throughput** — total samples ÷ elapsed seconds. Useful as a
  sanity check (50 VUs × ~10 req/s/VU should be ~400-500 req/s on a
  fast read endpoint; anything dramatically below that means the
  server is the bottleneck, not the harness).

## When to alarm

- **Read endpoints** (feed-list, sheets-list, search, messaging-unread,
  notifications) — **p99 > 500ms** is the alarm line. Below that, the
  user experience stays snappy under 50 concurrent VUs.
- **AI endpoints** (ai-analyze) — **p99 > 2000ms** is the alarm line.
  The mock path should be well below 200ms because it skips network;
  if the mock is over 500ms, the slowdown is somewhere else in the
  handler (Prisma `loadSheet`, spend-ceiling reserve, HTML scan
  pipeline) — start there.

## Tuning the run

The harness honours three env vars per run:

| Variable           | Default                 | Effect                                  |
| ------------------ | ----------------------- | --------------------------------------- |
| `LOAD_BASE_URL`    | `http://localhost:4000` | Point at staging or a Railway URL.      |
| `LOAD_MAX_VUS`     | _(not currently wired)_ | Future hook for `runLoadTest` override. |
| `LOAD_AUTH_COOKIE` | _(required)_            | `studyhub_session=...` cookie value.    |

Endpoint-specific:

| Variable           | Used by              | Effect                              |
| ------------------ | -------------------- | ----------------------------------- |
| `LOAD_AI_SHEET_ID` | `ai-analyze.load.js` | Target sheet id (must be readable). |

## Files

- `loadHarness.js` — shared worker pool + ramp scheduler + reporter.
- `feed-list.load.js` — GET `/api/feed?sort=ranked`
- `sheets-list.load.js` — GET `/api/sheets?search=calc`
- `search.load.js` — GET `/api/search?q=cs101&type=all&limit=10`
- `messaging-unread.load.js` — GET `/api/messages/unread-total`
- `notifications.load.js` — GET `/api/notifications`
- `ai-analyze.load.js` — POST `/api/ai/sheets/:id/analyze` (mocked Anthropic)

## What this is NOT

- Not a CI gate. Don't try to run these from `npm test` or a workflow.
- Not a benchmark for production scale. Localhost has zero network
  RTT, the dev DB has no replicas, and the harness can't simulate
  realistic user think-time. These numbers are useful for **relative**
  comparison ("did my refactor make `/api/feed` faster or slower?"),
  not absolute "can we handle 10k users" claims.
- Not a substitute for an APM dashboard. Sentry + pino + the Railway
  metrics are the source of truth for prod behaviour. Use these
  scripts to catch regressions BEFORE a deploy.

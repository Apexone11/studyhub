/**
 * loadHarness.js — shared load-test runner for the StudyHub backend.
 *
 * Why this file exists:
 *   The six load scripts in this directory all share the same shape —
 *   ramp 1 → 50 VUs over 30s, hold at 50 for 60s, record per-request
 *   latency, print p50/p95/p99/error-rate/throughput at the end. This
 *   module is the harness; each script supplies the endpoint config.
 *
 * Why worker_threads:
 *   Node's `fetch` is async but the request-issuing loop competes with
 *   timer ticks and response-parsing work on the event loop. At 50
 *   concurrent VUs that contention skews tail-latency numbers — p99
 *   reads ~30% higher than the real server response. One Worker per VU
 *   isolates each loop on its own event loop so the measurement is
 *   server-bound, not harness-bound.
 *
 * Why no dependencies:
 *   The task brief forbids new deps. autocannon (already a devDep) ships
 *   its own HTTP client and worker model but its output format is fixed
 *   and the ramp/hold curve has to be hand-rolled around it anyway. Raw
 *   `fetch` + `worker_threads` is simpler and matches the brief.
 *
 * Worker / main duality:
 *   This file is both the main orchestrator and the worker body. When
 *   `isMainThread === false`, the body runs as a single VU loop and
 *   posts samples back to the parent. When called from a script's
 *   `runLoadTest(config)`, it spawns workers pointing at this same file
 *   and aggregates the samples. One file, two roles.
 *
 * Output format (deliberately compact — meant for terminal review, not
 * a CI artifact):
 *
 *   ── Load test: feed-list ─────────────────────────────────────────
 *   Target:   GET http://localhost:4000/api/feed?sort=ranked
 *   Duration: 90s (30s ramp 1→50 VUs, 60s hold @ 50)
 *
 *   Samples:    4823
 *   Errors:     12 (0.25%)
 *   Throughput: 53.6 req/s
 *
 *   Latency (ms):
 *     p50: 41
 *     p95: 187
 *     p99: 432
 *     max: 1041
 *
 * Alarm thresholds (see README.md): p99 > 500ms on reads, p99 > 2000ms
 * on AI endpoints.
 */

const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads')
const path = require('node:path')

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_MAX_VUS = 50
const DEFAULT_RAMP_MS = 30_000
const DEFAULT_HOLD_MS = 60_000
const DEFAULT_BASE_URL = process.env.LOAD_BASE_URL || 'http://localhost:4000'

// ── Worker body ──────────────────────────────────────────────────────
// A worker is one virtual user. It loops until told to stop, issuing
// the configured request as fast as the server will answer and posting
// each sample (latency + ok flag) back to the parent.

function runWorker() {
  const { url, method, headers, body, vuId: _vuId } = workerData

  let stopRequested = false
  parentPort.on('message', (msg) => {
    if (msg && msg.type === 'stop') stopRequested = true
  })
  ;(async () => {
    while (!stopRequested) {
      const started = process.hrtime.bigint()
      let ok = false
      let status = 0
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body || undefined,
        })
        status = res.status
        ok = res.ok
        // Drain the body so the server can free its socket. We don't
        // care about the payload — we only care about response time
        // to last byte.
        try {
          await res.arrayBuffer()
        } catch {
          /* ignore */
        }
      } catch {
        ok = false
        status = 0
      }
      const elapsedNs = process.hrtime.bigint() - started
      const latencyMs = Number(elapsedNs / 1_000_000n)
      parentPort.postMessage({ type: 'sample', latencyMs, ok, status })
    }
    parentPort.postMessage({ type: 'done' })
  })().catch((err) => {
    parentPort.postMessage({ type: 'fatal', err: String(err && err.message) || String(err) })
  })
}

if (!isMainThread) {
  runWorker()
}

// ── Main orchestrator ────────────────────────────────────────────────

/**
 * Run a load test against a single endpoint.
 *
 * @param {object} config
 * @param {string} config.name — human-readable test name (printed in header).
 * @param {string} config.path — request path, e.g. '/api/feed?sort=ranked'.
 *   Joined onto `LOAD_BASE_URL` (default http://localhost:4000).
 * @param {'GET'|'POST'} [config.method='GET']
 * @param {object} [config.headers] — extra request headers.
 * @param {string} [config.body] — request body (already serialized).
 * @param {number} [config.maxVus=50]
 * @param {number} [config.rampMs=30000]
 * @param {number} [config.holdMs=60000]
 */
async function runLoadTest(config) {
  const {
    name,
    path: requestPath,
    method = 'GET',
    headers = {},
    body = null,
    maxVus = DEFAULT_MAX_VUS,
    rampMs = DEFAULT_RAMP_MS,
    holdMs = DEFAULT_HOLD_MS,
  } = config

  if (!name || !requestPath) {
    throw new Error('runLoadTest requires name and path')
  }
  const url = DEFAULT_BASE_URL.replace(/\/+$/, '') + requestPath

  printHeader({ name, method, url, rampMs, holdMs, maxVus })

  // We collect latencyMs into a flat array. 50 VUs × ~50 req/s × 90s
  // is ~225k samples worst case — well within process heap (one Float
  // entry per sample = ~1.8 MB). Keeping the array primitive is faster
  // than per-sample object allocation.
  const latencies = []
  let errorCount = 0
  let sampleCount = 0
  const workers = []

  const startedAt = Date.now()
  const totalMs = rampMs + holdMs

  // Spawn worker #0 immediately so the test isn't idle for the first
  // second of the ramp. Subsequent workers come online on a timer.
  spawnVu(0)

  // Ramp scheduler: spawn one new VU every (rampMs / (maxVus - 1)) ms.
  // For 50 VUs over 30s that's ~612ms between spawns. We add the first
  // VU above so subsequent count starts at 1.
  const rampGapMs = maxVus > 1 ? rampMs / (maxVus - 1) : rampMs
  let nextVuId = 1
  const rampTimer = setInterval(() => {
    if (nextVuId >= maxVus) {
      clearInterval(rampTimer)
      return
    }
    spawnVu(nextVuId)
    nextVuId += 1
  }, rampGapMs)
  // Don't let the ramp timer keep the process alive if every worker
  // dies first — the stop timer below is the source of truth.
  rampTimer.unref()

  // Stop signal after the full duration. Workers receive `stop` and
  // wind down their loops; we then `await` worker.terminate() in
  // case any worker is mid-fetch.
  await new Promise((resolve) => {
    setTimeout(async () => {
      clearInterval(rampTimer)
      for (const w of workers) {
        try {
          w.postMessage({ type: 'stop' })
        } catch {
          /* worker already gone */
        }
      }
      // Give workers up to 5s to drain their in-flight request.
      const drainStarted = Date.now()
      while (workers.some((w) => !w._done) && Date.now() - drainStarted < 5_000) {
        await new Promise((r) => setTimeout(r, 100))
      }
      for (const w of workers) {
        try {
          await w.terminate()
        } catch {
          /* ignore */
        }
      }
      resolve()
    }, totalMs).unref()
  })

  const elapsedSec = (Date.now() - startedAt) / 1000
  printSummary({
    sampleCount,
    errorCount,
    elapsedSec,
    latencies,
  })

  function spawnVu(vuId) {
    const w = new Worker(__filename, {
      workerData: {
        url,
        method,
        headers,
        body,
        vuId,
      },
    })
    w._done = false
    w.on('message', (msg) => {
      if (!msg) return
      if (msg.type === 'sample') {
        sampleCount += 1
        if (!msg.ok) errorCount += 1
        latencies.push(msg.latencyMs)
      } else if (msg.type === 'done' || msg.type === 'fatal') {
        w._done = true
      }
    })
    w.on('error', () => {
      w._done = true
    })
    w.on('exit', () => {
      w._done = true
    })
    workers.push(w)
  }
}

// ── Reporting ────────────────────────────────────────────────────────

function printHeader({ name, method, url, rampMs, holdMs, maxVus }) {
  const line = '─'.repeat(64)
  process.stdout.write(`\n── Load test: ${name} ${line}\n`.slice(0, 68) + '\n')
  process.stdout.write(`Target:   ${method} ${url}\n`)
  process.stdout.write(
    `Duration: ${(rampMs + holdMs) / 1000}s ` +
      `(${rampMs / 1000}s ramp 1→${maxVus} VUs, ${holdMs / 1000}s hold @ ${maxVus})\n\n`,
  )
}

function printSummary({ sampleCount, errorCount, elapsedSec, latencies }) {
  const errPct = sampleCount === 0 ? 0 : (errorCount / sampleCount) * 100
  const throughput = elapsedSec === 0 ? 0 : sampleCount / elapsedSec

  process.stdout.write(`Samples:    ${sampleCount}\n`)
  process.stdout.write(`Errors:     ${errorCount} (${errPct.toFixed(2)}%)\n`)
  process.stdout.write(`Throughput: ${throughput.toFixed(1)} req/s\n\n`)

  if (latencies.length === 0) {
    process.stdout.write('Latency: (no samples collected — is the server running?)\n\n')
    return
  }

  // Sort once, read percentiles by index. Sorting 200k numbers takes
  // ~20ms on the harness machine — well below the network noise floor.
  const sorted = latencies.slice().sort((a, b) => a - b)
  const p50 = percentile(sorted, 0.5)
  const p95 = percentile(sorted, 0.95)
  const p99 = percentile(sorted, 0.99)
  const max = sorted[sorted.length - 1]

  process.stdout.write('Latency (ms):\n')
  process.stdout.write(`  p50: ${p50}\n`)
  process.stdout.write(`  p95: ${p95}\n`)
  process.stdout.write(`  p99: ${p99}\n`)
  process.stdout.write(`  max: ${max}\n\n`)
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0
  // Nearest-rank method — simple and adequate for triage. We don't
  // need interpolated percentiles for "is this fast enough?".
  const rank = Math.ceil(q * sorted.length) - 1
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))]
}

module.exports = { runLoadTest }

// Re-export the path so scripts can self-locate when spawning workers
// against this file from a sibling script. (Not currently used — kept
// in case a future script wants to import the worker body directly.)
module.exports.__harnessFile = path.resolve(__filename)

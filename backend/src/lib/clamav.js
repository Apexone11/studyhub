const net = require('node:net')

// Logger is loaded lazily (and silenced under test) so this module stays
// usable from any caller without a hard pino dependency at require-time.
// The runbook (docs/internal/security/RUNBOOK_CLAMAV.md) references the
// `clamav.scan_*` event keys emitted from `emitScanEvent()` below — keep
// the keys in sync if you rename anything.
let cachedLogger = null
function getLogger() {
  if (cachedLogger) return cachedLogger
  try {
    cachedLogger = require('./logger')
  } catch {
    cachedLogger = { info() {}, warn() {}, error() {} }
  }
  return cachedLogger
}

// Map a scan result `status` to the stable event key the runbook
// alerts on. The status field uses the verb the parseClamAvReply layer
// returns ("error" for any reachability/parse failure), but the
// observability surface needs a stable noun the on-call can grep
// (`clamav.scan_failed`). Keep this mapping in sync with
// docs/internal/security/RUNBOOK_CLAMAV.md "Logging and alerts".
const SCAN_EVENT_KEY_BY_STATUS = {
  clean: 'clamav.scan_clean',
  infected: 'clamav.scan_infected',
  error: 'clamav.scan_failed',
}

function emitScanEvent(result, ctx) {
  // Skip noise in unit tests — the disabled-engine short-circuit returns
  // synthetic clean replies and would spam logs. Real scan paths still log.
  if (process.env.NODE_ENV === 'test' || result?.engine === 'disabled') return
  const log = getLogger()
  const status = result?.status || 'error'
  const base = {
    event: SCAN_EVENT_KEY_BY_STATUS[status] || 'clamav.scan_failed',
    engine: result?.engine || 'clamav',
    bytes: ctx?.bytes,
  }
  if (status === 'clean') {
    log.info(base, 'clamav scan clean')
  } else if (status === 'infected') {
    log.warn({ ...base, threat: result.threat }, 'clamav scan infected')
  } else {
    log.warn({ ...base, message: result?.message }, 'clamav scan failed')
  }
}

const DEFAULT_CLAMAV_HOST = process.env.CLAMAV_HOST || 'clamav'
const DEFAULT_CLAMAV_PORT = Number.parseInt(process.env.CLAMAV_PORT || '3310', 10)
const DEFAULT_CLAMAV_TIMEOUT_MS = Number.parseInt(process.env.CLAMAV_TIMEOUT_MS || '12000', 10)

function parseClamAvReply(replyText) {
  const message = String(replyText || '').trim()
  if (!message) {
    return {
      status: 'error',
      isClean: false,
      threat: null,
      message: 'Empty scanner response.',
    }
  }

  if (message.endsWith('OK')) {
    return {
      status: 'clean',
      isClean: true,
      threat: null,
      message,
    }
  }

  const foundIndex = message.lastIndexOf(' FOUND')
  if (foundIndex > 0) {
    const prefix = message.slice(0, foundIndex)
    const colonIndex = prefix.indexOf(':')
    const threat =
      (colonIndex >= 0 ? prefix.slice(colonIndex + 1) : prefix).trim() || 'Unknown threat'
    return {
      status: 'infected',
      isClean: false,
      threat,
      message,
    }
  }

  return {
    status: 'error',
    isClean: false,
    threat: null,
    message,
  }
}

function scanBufferWithClamAv(buffer, options = {}) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8')

  if (
    process.env.NODE_ENV === 'test' ||
    String(process.env.CLAMAV_DISABLED || '').toLowerCase() === 'true'
  ) {
    return Promise.resolve({
      status: 'clean',
      isClean: true,
      threat: null,
      message: 'Scanner disabled for this environment.',
      engine: 'disabled',
    })
  }

  const host = options.host || DEFAULT_CLAMAV_HOST
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_CLAMAV_PORT
  const timeoutMs = Number.isInteger(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_CLAMAV_TIMEOUT_MS

  const bytes = content.length

  return new Promise((resolve) => {
    let settled = false
    let response = ''

    const socket = net.createConnection({ host, port }, () => {
      // ClamAV protocol: every streaming command must be prefixed with `z` (null-terminated)
      // or `n` (newline-terminated). Plain `INSTREAM\0` is legacy and rejected by clamd 1.x+
      // with "UNKNOWN COMMAND". `z` matches the rest of this code which uses NUL terminators.
      const streamCommand = Buffer.from('zINSTREAM\0')
      socket.write(streamCommand)

      const chunkSize = 64 * 1024
      for (let offset = 0; offset < content.length; offset += chunkSize) {
        const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.length))
        const lengthBuffer = Buffer.alloc(4)
        lengthBuffer.writeUInt32BE(chunk.length, 0)
        socket.write(lengthBuffer)
        socket.write(chunk)
      }

      const endBuffer = Buffer.alloc(4)
      endBuffer.writeUInt32BE(0, 0)
      socket.write(endBuffer)
    })

    function finalize(result) {
      if (settled) return
      settled = true
      socket.destroy()
      // Structured pino event so the runbook's alert guidance has something
      // to alert on. See RUNBOOK_CLAMAV.md "Logging and alerts" section.
      try {
        emitScanEvent(result, { bytes })
      } catch {
        // Never let log emission turn a clean scan into a failed scan.
      }
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (response.includes('\u0000') || response.includes('\n')) {
        const parsed = parseClamAvReply(response.split('\0').join('').trim())
        finalize({
          ...parsed,
          engine: 'clamav',
        })
      }
    })

    socket.on('timeout', () => {
      finalize({
        status: 'error',
        isClean: false,
        threat: null,
        message: `Scanner timeout after ${timeoutMs}ms.`,
        engine: 'clamav',
      })
    })

    socket.on('error', (error) => {
      finalize({
        status: 'error',
        isClean: false,
        threat: null,
        message: `Scanner unavailable: ${error.message}`,
        engine: 'clamav',
      })
    })

    socket.on('end', () => {
      if (!settled) {
        const parsed = parseClamAvReply(response.split('\0').join('').trim())
        finalize({
          ...parsed,
          engine: 'clamav',
        })
      }
    })
  })
}

module.exports = {
  parseClamAvReply,
  scanBufferWithClamAv,
}

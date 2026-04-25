/**
 * updateGeoipDb.js — download the MaxMind GeoLite2 databases.
 *
 * Usage:
 *   MAXMIND_LICENSE_KEY=xxx node scripts/updateGeoipDb.js
 *
 * Downloads two editions:
 *   - GeoLite2-City         (~70MB, city-level geolocation)
 *   - GeoIP2-Anonymous-IP   (optional; skipped if 404/denied — free accounts
 *                            don't always have access)
 *
 * Destination: backend/geoip/<edition>.mmdb. The directory is created if
 * missing. Existing .mmdb files are replaced atomically.
 *
 * Intended cadence: weekly. A stale DB produces wrong country attributions;
 * the refresh keeps them accurate without any runtime cost.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY
if (!LICENSE_KEY) {
  console.error('[updateGeoipDb] MAXMIND_LICENSE_KEY env var is required.')
  console.error('  Get a free key at https://www.maxmind.com/en/geolite2/signup')
  process.exit(1)
}

const DB_DIR = path.join(__dirname, '..', 'geoip')
fs.mkdirSync(DB_DIR, { recursive: true })

const EDITIONS = [
  { id: 'GeoLite2-City', required: true },
  { id: 'GeoIP2-Anonymous-IP', required: false },
]

// Network guards. The GeoIP fetch runs during Railway preDeploy, so a
// hung connection or a redirect loop on MaxMind's side could stall a
// deploy indefinitely. Bound both: a per-attempt timeout and a max
// redirect chain length.
const REQUEST_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5

function download(url, outFile, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outFile)
    // settled guards against the multiple ways this promise can race
    // to a terminal state: request error, response error, file error,
    // timeout, or normal finish. Without it, a server that errors
    // mid-stream after we've started piping could fire both an error
    // path and a finish path, calling resolve+reject and turning a
    // failure into a silent success.
    let settled = false
    const settle = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }
    const cleanup = () => {
      file.close()
      try {
        fs.unlinkSync(outFile)
      } catch {
        /* ignore — file may not exist if we never finished opening it */
      }
    }
    const failWith = (err) => {
      cleanup()
      settle(reject, err)
    }
    // File-side errors (ENOSPC mid-write, EPERM on a locked file,
    // etc.) used to bubble up as unhandled 'error' events. Bind a
    // listener so the promise rejects deterministically.
    file.on('error', failWith)

    const req = https.get(url, (res) => {
      // Bind a listener BEFORE any branching so a server-side reset
      // mid-pipe surfaces as a reject instead of an unhandled event.
      res.on('error', failWith)

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Drain the redirect response body so the underlying socket
        // can be released to the pool / closed cleanly. Leaving an
        // un-consumed response stream alive is the standard cause of
        // "first redirect works but the next request hangs" issues.
        res.resume()
        if (redirectCount >= MAX_REDIRECTS) {
          return failWith(new Error(`Too many redirects (max ${MAX_REDIRECTS})`))
        }
        // Resolve relative against the current request URL — Location
        // is allowed to be a relative reference per RFC 7231 §7.1.2,
        // and passing it raw to https.get would either fail or
        // misinterpret the host on a relative redirect.
        const redirectUrl = new URL(res.headers.location, url).toString()
        cleanup()
        return download(redirectUrl, outFile, redirectCount + 1).then(
          (v) => settle(resolve, v),
          (e) => settle(reject, e),
        )
      }
      if (res.statusCode !== 200) {
        // Same drain-then-fail pattern for non-2xx responses. Without
        // resume(), the body sits in a buffer until socket timeout.
        res.resume()
        return failWith(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => settle(resolve)))
    })
    req.on('error', failWith)
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })
  })
}

async function fetchEdition(edition) {
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition.id}&license_key=${LICENSE_KEY}&suffix=tar.gz`
  const tarFile = path.join(DB_DIR, `${edition.id}.tar.gz`)
  console.log(`[updateGeoipDb] downloading ${edition.id}...`)
  try {
    await download(url, tarFile)
  } catch (err) {
    if (edition.required) throw err
    console.warn(`[updateGeoipDb] skipping optional edition ${edition.id}: ${err.message}`)
    return
  }
  console.log(`[updateGeoipDb] extracting ${edition.id}...`)
  await execAsync(`tar -xzf "${tarFile}" -C "${DB_DIR}"`)
  const dirs = fs
    .readdirSync(DB_DIR)
    .filter((d) => d.startsWith(edition.id) && fs.statSync(path.join(DB_DIR, d)).isDirectory())
  for (const d of dirs) {
    const mmdb = fs.readdirSync(path.join(DB_DIR, d)).find((f) => f.endsWith('.mmdb'))
    if (mmdb) {
      const target = path.join(DB_DIR, `${edition.id}.mmdb`)
      const tmp = `${target}.new`
      fs.renameSync(path.join(DB_DIR, d, mmdb), tmp)
      // POSIX rename(2) replaces an existing target atomically. On
      // Windows that fails with EEXIST/EPERM, so we fall back to
      // copyFileSync (which overwrites on both platforms) and then
      // unlink the tmp file. Two important guards on the fallback:
      //
      // 1. err.code is restricted to the Windows replacement codes
      //    AND process.platform must be 'win32'. A POSIX EACCES or
      //    ENOSPC here would mean a real permission / disk problem,
      //    not a Windows quirk — re-throw rather than masking it.
      // 2. We do NOT rmSync the target before copying. A previous
      //    revision did, which meant a transient lock on the second
      //    move would leave the contributor with no .mmdb at all
      //    (geoip.service no-ops geolocation + risk signals until
      //    someone manually restores). copyFileSync preserves the
      //    old target if the copy itself fails.
      try {
        fs.renameSync(tmp, target)
      } catch (err) {
        const isWindowsReplaceFailure =
          process.platform === 'win32' &&
          err &&
          (err.code === 'EEXIST' || err.code === 'EPERM') &&
          fs.existsSync(target)
        if (!isWindowsReplaceFailure) throw err
        fs.copyFileSync(tmp, target)
        try {
          fs.unlinkSync(tmp)
        } catch {
          /* tmp cleanup is best-effort; the next run overwrites */
        }
      }
      fs.rmSync(path.join(DB_DIR, d), { recursive: true })
    }
  }
  try {
    fs.unlinkSync(tarFile)
  } catch {
    /* ignore */
  }
}

async function main() {
  for (const edition of EDITIONS) {
    await fetchEdition(edition)
  }
  console.log(`[updateGeoipDb] done. DBs are at ${DB_DIR}`)
}

main().catch((err) => {
  console.error('[updateGeoipDb] failed:', err.message)
  process.exit(1)
})

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
    const cleanup = () => {
      file.close()
      try {
        fs.unlinkSync(outFile)
      } catch {
        /* ignore */
      }
    }
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          cleanup()
          return reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`))
        }
        cleanup()
        return download(res.headers.location, outFile, redirectCount + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        cleanup()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    })
    req.on('error', (err) => {
      cleanup()
      reject(err)
    })
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
      // Windows the equivalent fails with EEXIST/EPERM/EACCES, so we
      // remove the destination and retry ONLY for those specific codes.
      // Any other failure (read-only mount, transient I/O error, the
      // .new file disappearing) re-throws — silently rm-ing the live
      // DB on a permission glitch would lose both the old and new
      // copies on the next failed rename.
      try {
        fs.renameSync(tmp, target)
      } catch (err) {
        const isWindowsCollision =
          err && (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES')
        if (!isWindowsCollision || !fs.existsSync(target)) throw err
        fs.rmSync(target, { force: true })
        fs.renameSync(tmp, target)
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

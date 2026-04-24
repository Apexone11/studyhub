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

function download(url, outFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outFile)
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlinkSync(outFile)
          return download(res.headers.location, outFile).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlinkSync(outFile)
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      })
      .on('error', (err) => {
        file.close()
        try {
          fs.unlinkSync(outFile)
        } catch {
          /* ignore */
        }
        reject(err)
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
      // Windows the equivalent fails with EEXIST/EPERM, so when the
      // atomic rename throws we explicitly remove the destination and
      // retry. Keeps Linux (Railway) on the atomic path while giving
      // Windows contributors a working local `npm run update-geoip-db`.
      try {
        fs.renameSync(tmp, target)
      } catch (err) {
        if (!fs.existsSync(target)) throw err
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

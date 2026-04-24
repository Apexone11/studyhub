/**
 * geoip.service.js — MaxMind GeoLite2 offline IP → location lookup.
 *
 * Loads GeoLite2-City + GeoIP2-Anonymous-IP databases from disk once and
 * serves reads in-memory. No external API calls, no per-request cost.
 *
 * Graceful fallback:
 *   - If the MMDB files are absent (e.g. no MAXMIND_LICENSE_KEY configured
 *     yet) lookup() returns null. Callers treat that as "no geo signals"
 *     and the risk-scoring layer degrades cleanly — new logins still flow,
 *     geo-based signals just aren't applied.
 *
 * To populate the databases:
 *   MAXMIND_LICENSE_KEY=xxx node scripts/updateGeoipDb.js
 *
 * Or override the location with GEOIP_DB_DIR.
 */

const path = require('path')
const fs = require('fs')

const DB_DIR = process.env.GEOIP_DB_DIR || path.join(__dirname, '..', '..', 'geoip')
const CITY_DB = path.join(DB_DIR, 'GeoLite2-City.mmdb')
const ANON_DB = path.join(DB_DIR, 'GeoIP2-Anonymous-IP.mmdb')

let cityReader = null
let anonReader = null
let loadPromise = null
let warnedMissing = false

async function load() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    // maxmind is a peer; require lazily so this module loads even without it.
    let mm
    try {
      mm = require('maxmind')
    } catch {
      return
    }
    try {
      if (fs.existsSync(CITY_DB)) {
        cityReader = await mm.open(CITY_DB)
      } else if (!warnedMissing) {
        warnedMissing = true
        console.warn(
          `[geoip] GeoLite2-City.mmdb not found at ${CITY_DB}. Geo lookup will no-op. ` +
            `Run: MAXMIND_LICENSE_KEY=xxx node scripts/updateGeoipDb.js`,
        )
      }
    } catch {
      cityReader = null
    }
    try {
      if (fs.existsSync(ANON_DB)) {
        anonReader = await mm.open(ANON_DB)
      }
    } catch {
      anonReader = null
    }
  })()
  return loadPromise
}

/**
 * Look up an IP address. Returns:
 *   { country, region, city, lat, lon, isAnonymous } on success
 *   null if: IP is missing / private, DB not loaded, or lookup fails
 */
async function lookup(ip) {
  if (!ip || typeof ip !== 'string') return null
  if (isPrivateOrLocal(ip)) return null

  await load()
  if (!cityReader) return null

  try {
    const city = cityReader.get(ip)
    if (!city) return null
    const anon = anonReader ? anonReader.get(ip) : null
    return {
      country: city.country?.iso_code || null,
      region: city.subdivisions?.[0]?.iso_code || null,
      city: city.city?.names?.en || null,
      lat: city.location?.latitude ?? null,
      lon: city.location?.longitude ?? null,
      isAnonymous: !!(anon?.is_anonymous || anon?.is_tor_exit_node || anon?.is_hosting_provider),
    }
  } catch {
    return null
  }
}

/**
 * Returns true for RFC1918 + loopback + link-local ranges + common
 * container-internal addresses, including IPv6 equivalents. We skip
 * geolocation for these because the result is meaningless and the read
 * is cheap but non-zero.
 *
 * Covered ranges:
 *   IPv4: 10/8, 172.16/12, 192.168/16 (RFC1918); 127/8 (loopback);
 *         169.254/16 (link-local)
 *   IPv6: ::1 (loopback); fe80::/10 (link-local);
 *         fc00::/7 (unique local addresses, i.e. the IPv6 equivalent of
 *         RFC1918 — covers fc00::/8 and fd00::/8);
 *         ::ffff:0:0/96 (IPv4-mapped — recurse on the mapped IPv4)
 */
function isPrivateOrLocal(ip) {
  if (!ip || typeof ip !== 'string') return false
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true

  // IPv4-mapped IPv6 — strip the ::ffff: prefix and re-check the IPv4.
  if (ip.startsWith('::ffff:')) return isPrivateOrLocal(ip.slice(7))

  // IPv6 link-local (fe80::/10) — first 10 bits are 1111 1110 10xx xxxx.
  // That means the leading hextet is fe80..febf. Match any of those.
  const lower = ip.toLowerCase()
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true

  // IPv6 unique local (fc00::/7) — leading byte fc or fd.
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true

  // IPv4 private + loopback + link-local.
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('169.254.')) return true
  const match = /^172\.(\d+)\./.exec(ip)
  if (match) {
    const n = parseInt(match[1], 10)
    if (n >= 16 && n <= 31) return true
  }
  return false
}

/**
 * Test hook — clear caches so a subsequent call reloads the DBs.
 * Not used in production code paths.
 */
function _resetForTests() {
  cityReader = null
  anonReader = null
  loadPromise = null
  warnedMissing = false
}

module.exports = { lookup, _resetForTests, isPrivateOrLocal }

/**
 * riskScoring.service.js — classify a login attempt.
 *
 * Pure function. Inputs describe the login attempt + user's history;
 * output is { score, band, signals }. Bands drive the login controller:
 *   - "normal"    (<30): issue session, write a SecurityEvent.
 *   - "notify"    (30-59): issue session + send new-location email.
 *   - "challenge" (≥60): pend the session, email a 6-digit code, only
 *                         issue the session after the code verifies.
 *
 * Weights are module-local so we can tune them in one place. None of the
 * signals are individually fatal; they combine via a simple sum.
 */

const WEIGHTS = Object.freeze({
  UNKNOWN_DEVICE: 30,
  NEW_COUNTRY: 40,
  NEW_REGION: 15,
  IMPOSSIBLE_TRAVEL: 50,
  ANON_IP: 25,
  UA_FAMILY_CHANGE: 10,
  FAILED_ATTEMPTS: 20,
})

const SPEED_KMH_LIMIT = 800 // commercial jet ~900 km/h; we allow a little wiggle
const EARTH_KM = 6371

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a))
}

function hasLatLon(x) {
  // Number.isFinite over typeof === 'number' so NaN and ±Infinity are
  // rejected. A NaN slipping through would propagate through haversineKm
  // and silently disable the impossible-travel signal — exactly the
  // adversary case the signal exists for.
  return x && Number.isFinite(x.lat) && Number.isFinite(x.lon)
}

/**
 * scoreLogin(ctx)
 *
 * ctx shape:
 *   deviceKnown       boolean   — sh_did cookie matched a known TrustedDevice
 *   geo               {country, region, city, lat, lon} | null
 *   recentSessions    Array of {country, region, lat, lon, createdAt} — most recent first
 *   uaFamilyChanged   boolean   — browser family differs from what we've seen on this deviceId
 *   anonymousIp       boolean   — MaxMind flagged this IP as anon/Tor/hosting
 *   failedAttempts15m number    — count of failed attempts against this userId in the last 15m
 */
function scoreLogin(ctx) {
  const signals = []
  let score = 0

  const recentSessions = Array.isArray(ctx.recentSessions) ? ctx.recentSessions : []
  const hasHistory = recentSessions.length > 0
  const geo = ctx.geo || null

  if (!ctx.deviceKnown) {
    score += WEIGHTS.UNKNOWN_DEVICE
    signals.push('unknown_device')
  }

  // First-time logins get no country/region penalty — there's nothing to compare.
  if (hasHistory && geo?.country) {
    const pastCountries = recentSessions.map((s) => s.country).filter(Boolean)
    if (pastCountries.length > 0 && !pastCountries.includes(geo.country)) {
      score += WEIGHTS.NEW_COUNTRY
      signals.push('new_country')
    }
  }

  if (hasHistory && geo?.region) {
    const pastRegions = recentSessions.map((s) => s.region).filter(Boolean)
    if (pastRegions.length > 0 && !pastRegions.includes(geo.region)) {
      score += WEIGHTS.NEW_REGION
      signals.push('new_region')
    }
  }

  // Impossible travel — speed between previous login and this one exceeds SPEED_KMH_LIMIT.
  const last = recentSessions[0]
  if (hasLatLon(last) && hasLatLon(geo) && last.createdAt) {
    const hours = (Date.now() - new Date(last.createdAt).getTime()) / 3.6e6
    if (hours > 0) {
      const km = haversineKm(last.lat, last.lon, geo.lat, geo.lon)
      if (km / hours > SPEED_KMH_LIMIT) {
        score += WEIGHTS.IMPOSSIBLE_TRAVEL
        signals.push('impossible_travel')
      }
    }
  }

  if (ctx.anonymousIp) {
    score += WEIGHTS.ANON_IP
    signals.push('anonymous_ip')
  }

  if (ctx.uaFamilyChanged) {
    score += WEIGHTS.UA_FAMILY_CHANGE
    signals.push('ua_change')
  }

  if ((ctx.failedAttempts15m || 0) >= 3) {
    score += WEIGHTS.FAILED_ATTEMPTS
    signals.push('failed_attempts')
  }

  let band = 'normal'
  if (score >= 60) band = 'challenge'
  else if (score >= 30) band = 'notify'

  return { score, band, signals }
}

module.exports = { scoreLogin, WEIGHTS }

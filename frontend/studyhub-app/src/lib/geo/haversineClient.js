/**
 * haversineClient.js — frontend mirror of backend/src/lib/geo/haversine.js.
 *
 * Used by /my-courses to sort the school list client-side once the user
 * grants geolocation — so the user gets instant feedback without a
 * round-trip to /api/courses/schools-nearby. Same math, same result.
 *
 * Returns kilometers. Null when any coord is missing or non-finite.
 */

const EARTH_RADIUS_KM = 6371

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null
  }
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

export default distanceKm

/**
 * haversine.js — great-circle distance between two lat/lng points.
 *
 * Pure function. No dependencies. Used by the schools-nearby sort and
 * by the feed algorithm v2 (nearby-school signal weighting).
 *
 * Returns distance in kilometers. For UI display, divide by 1.609 for
 * miles. Mean Earth radius 6371 km is the standard simplification —
 * accurate to ~0.5% which is far better than the geolocation API's
 * own typical accuracy.
 */

const EARTH_RADIUS_KM = 6371

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * Distance in km between two (lat, lng) pairs.
 * Returns null when any coordinate is missing or non-finite — callers
 * use this to sort missing-coord rows to the bottom of the list.
 */
function distanceKm(lat1, lng1, lat2, lng2) {
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

module.exports = { distanceKm, EARTH_RADIUS_KM }

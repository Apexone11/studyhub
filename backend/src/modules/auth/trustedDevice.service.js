/**
 * TrustedDevice service — stable device identity across sessions.
 *
 * A TrustedDevice is keyed by the `sh_did` httpOnly cookie. A given device
 * can have many sessions over time. When a session is revoked, the linked
 * device is also marked revoked — the next login from that browser will be
 * treated as new by the risk-scoring layer (until the user re-verifies).
 *
 * Every external call site should wrap invocations in try/catch with a
 * no-op fallback. This table may be unavailable during transient DB blips
 * or on a stack where the migration has not yet deployed; login must not
 * hard-fail in that case.
 */

const prisma = require('../../lib/prisma')

/**
 * Look up a device by (userId, deviceId). If it exists, refresh its
 * last-seen metadata and clear any prior `revokedAt`. If not, create it.
 */
async function findOrCreateDevice({ userId, deviceId, label, ip, country, region }) {
  if (!userId || !deviceId) return null

  const existing = await prisma.trustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
  })

  if (existing) {
    return prisma.trustedDevice.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        lastIp: ip || existing.lastIp,
        lastCountry: country || existing.lastCountry,
        lastRegion: region || existing.lastRegion,
        label: label || existing.label,
        revokedAt: null,
      },
    })
  }

  return prisma.trustedDevice.create({
    data: {
      userId,
      deviceId,
      label: (label || 'Unknown device').slice(0, 200),
      lastIp: ip ? String(ip).slice(0, 45) : null,
      lastCountry: country ? String(country).slice(0, 2) : null,
      lastRegion: region ? String(region).slice(0, 10) : null,
    },
  })
}

/**
 * Mark a device as verified/trusted. Called after a successful step-up
 * challenge (Phase 3) or whenever the login was confidently low-risk.
 */
async function markTrusted(id) {
  if (!id) return null
  return prisma.trustedDevice.update({
    where: { id },
    data: { trustedAt: new Date() },
  })
}

/**
 * Mark a device as revoked. Called when a session is revoked or via the
 * user-facing "This wasn't me" revoke link.
 */
async function revokeDevice(id) {
  if (!id) return null
  return prisma.trustedDevice.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}

/**
 * List the user's active (non-revoked) devices, most recently seen first.
 */
async function getUserDevices(userId) {
  if (!userId) return []
  return prisma.trustedDevice.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  })
}

module.exports = {
  findOrCreateDevice,
  markTrusted,
  revokeDevice,
  getUserDevices,
}

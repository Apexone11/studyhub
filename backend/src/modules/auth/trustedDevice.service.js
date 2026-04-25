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
 * last-seen metadata (lastSeenAt, lastIp, lastCountry, lastRegion, label).
 * If it doesn't exist, create it.
 *
 * Does NOT touch `revokedAt` — a revoked device stays revoked until a
 * successful step-up challenge clears it via `markTrusted`. See the
 * CRITICAL comment inside the upsert for the reasoning.
 */
async function findOrCreateDevice({ userId, deviceId, label, ip, country, region }) {
  if (!userId || !deviceId) return null

  // Use upsert to avoid a read-then-create race: two concurrent logins from
  // the same browser (e.g., rapid double-click on the sign-in button, or a
  // tab that retries a stalled request) would otherwise both miss the
  // findUnique() and then hit the unique constraint on (userId, deviceId),
  // intermittently failing one of the logins with P2002.
  const normalizedLabel = label ? String(label).slice(0, 200) : null
  const normalizedIp = ip ? String(ip).slice(0, 45) : null
  const normalizedCountry = country ? String(country).slice(0, 2) : null
  const normalizedRegion = region ? String(region).slice(0, 10) : null

  // CRITICAL: do NOT clear `revokedAt` here. A user who explicitly revoked
  // this device from Settings ("This wasn't me" / "Sign out everywhere")
  // must stay revoked until they complete a step-up challenge. Re-trusting
  // on every findOrCreate would silently defeat the revoke button — any
  // subsequent login attempt (even a failed one) would re-enable the
  // device. Re-trust happens only in `markTrusted`, which is gated behind
  // a successful email challenge.
  return prisma.trustedDevice.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    update: {
      lastSeenAt: new Date(),
      // Only overwrite existing metadata when the caller provided a fresh
      // value. Prisma treats `undefined` as "leave column alone", so we
      // send undefined (not null) when the caller didn't supply the field.
      lastIp: normalizedIp ?? undefined,
      lastCountry: normalizedCountry ?? undefined,
      lastRegion: normalizedRegion ?? undefined,
      label: normalizedLabel ?? undefined,
    },
    create: {
      userId,
      deviceId,
      label: normalizedLabel || 'Unknown device',
      lastIp: normalizedIp,
      lastCountry: normalizedCountry,
      lastRegion: normalizedRegion,
    },
  })
}

/**
 * Mark a device as verified/trusted. Called after a successful step-up
 * challenge (Phase 3) or whenever the login was confidently low-risk.
 *
 * Also clears any prior `revokedAt` — this is the legitimate "user proved
 * ownership, re-enable this device" path. Paired with the rule in
 * `findOrCreateDevice` which intentionally does NOT clear `revokedAt`,
 * this means a revoked device stays revoked until the owner actually
 * completes a challenge.
 */
async function markTrusted(id) {
  if (!id) return null
  return prisma.trustedDevice.update({
    where: { id },
    data: { trustedAt: new Date(), revokedAt: null },
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

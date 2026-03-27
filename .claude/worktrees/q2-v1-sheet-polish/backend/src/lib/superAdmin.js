/**
 * Super Admin identity — the bootstrap admin account (ADMIN_USERNAME env var).
 *
 * The super admin cannot be demoted, deleted, or restricted by other admins.
 * They can see all claims and override any admin action.
 */
const prisma = require('./prisma')

let _superAdminId = null

/**
 * Resolve the super admin's user ID from the ADMIN_USERNAME env var.
 * Cached after first call. Returns null if the env var is unset or user not found.
 */
async function getSuperAdminId() {
  if (_superAdminId !== null) return _superAdminId

  const username = (process.env.ADMIN_USERNAME || '').trim()
  if (!username) return null

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    _superAdminId = user ? user.id : null
  } catch {
    _superAdminId = null
  }

  return _superAdminId
}

/**
 * Check if a given userId is the super admin.
 */
async function isSuperAdmin(userId) {
  const superAdminId = await getSuperAdminId()
  return superAdminId !== null && superAdminId === userId
}

/** Reset cache (for testing). */
function _resetCache() {
  _superAdminId = null
}

module.exports = { getSuperAdminId, isSuperAdmin, _resetCache }

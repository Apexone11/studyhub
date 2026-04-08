const bcrypt = require('bcryptjs')

const DEFAULT_ADMIN_EMAIL = 'abdulrfornah@getstudyhub.org'

async function ensureAdminUser(prisma) {
  const username = (process.env.ADMIN_USERNAME || '').trim()
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''

  if (!username) {
    return false
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      role: true,
      email: true,
      emailVerified: true,
    },
  })

  const nextPasswordHash = password
    ? await bcrypt.hash(password, 12)
    : null

  if (!existingUser) {
    if (!nextPasswordHash) {
      console.warn(
        'Skipping admin bootstrap because ADMIN_PASSWORD is not set for a new admin account.'
      )
      return false
    }

    await prisma.user.create({
      data: {
        username,
        passwordHash: nextPasswordHash,
        role: 'admin',
        email: email || null,
        emailVerified: Boolean(email),
      },
      select: { id: true },
    })
    console.log('Admin bootstrap created the admin account.')
    return true
  }

  const updates = {}

  if (existingUser.role !== 'admin') {
    updates.role = 'admin'
  }

  if (email && existingUser.email !== email) {
    updates.email = email
    updates.emailVerified = true
  } else if (email && !existingUser.emailVerified) {
    updates.emailVerified = true
  }

  if (nextPasswordHash) {
    updates.passwordHash = nextPasswordHash
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: updates,
      select: { id: true },
    })
    console.log('Admin bootstrap synced the admin account.')
    return true
  }

  return false
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  ensureAdminUser,
}

// Run once from backend/: npm run seed:admin
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const DEFAULT_ADMIN_EMAIL = 'abdulrfornah@getstudyhub.org'

async function main() {
  const username = (process.env.ADMIN_USERNAME || '').trim()
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url')

  if (!username) {
    throw new Error('ADMIN_USERNAME is required for admin bootstrap.')
  }

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, email: true }
  })
  if (existing) {
    if (!existing.email && email) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { email, emailVerified: true }
      })
      console.log('Admin already existed, so the company/admin email was added.')
      return
    }
    console.log('Admin already exists (username not logged).')
    return
  }
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      role: 'admin',
      email: email || null,
      emailVerified: Boolean(email),
    }
  })
  console.log('Admin created (username not logged).')
  if (email) {
    console.log('Admin email configured from ADMIN_EMAIL (or the default company email).')
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.log('A random admin password was generated for one-time bootstrap use (not printed here for security).')
    console.log('Set the ADMIN_PASSWORD environment variable and re-run this script if you need to control the initial password value.')
  } else {
    console.log('Password source: ADMIN_PASSWORD env var (not reprinted here).')
  }
  console.log('Store these credentials securely and change the password immediately after first login.')
}

main().catch(console.error).finally(() => prisma.$disconnect())

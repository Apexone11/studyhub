// Run once from backend/: npm run seed:admin
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const username = (process.env.ADMIN_USERNAME || '').trim()
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url')

  if (!username) {
    throw new Error('ADMIN_USERNAME is required for admin bootstrap.')
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log('Admin already exists (username not logged).')
    return
  }
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { username, passwordHash: hash, role: 'admin' }
  })
  console.log('Admin created (username not logged).')
  if (!process.env.ADMIN_PASSWORD) {
    console.log('A random admin password was generated for one-time bootstrap use (not printed here for security).')
    console.log('Set the ADMIN_PASSWORD environment variable and re-run this script if you need to control the initial password value.')
  } else {
    console.log('Password source: ADMIN_PASSWORD env var (not reprinted here).')
  }
  console.log('Store these credentials securely and change the password immediately after first login.')
}

main().catch(console.error).finally(() => prisma.$disconnect())

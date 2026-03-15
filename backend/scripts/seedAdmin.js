// Run once from backend/: npm run seed:admin
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'studyhub_admin').trim()
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url')

  if (!username) {
    throw new Error('ADMIN_USERNAME cannot be empty.')
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log('Admin already exists:', username)
    return
  }
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { username, passwordHash: hash, role: 'admin' }
  })
  console.log('Admin created:', username)
  console.log('Password:', password)
  if (!process.env.ADMIN_PASSWORD) {
    console.log('No ADMIN_PASSWORD env var was provided, so this password was generated for one-time bootstrap use.')
  }
  console.log('Store these credentials securely and change the password immediately after first login.')
}

main().catch(console.error).finally(() => prisma.$disconnect())

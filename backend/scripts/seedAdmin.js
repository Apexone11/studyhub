// Run once: node backend/scripts/seedAdmin.js
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const USERNAME = 'studyhub_admin'
  const PASSWORD = 'H@rb0r!SH_2026#Vx'
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } })
  if (existing) {
    console.log('Admin already exists:', USERNAME)
    return
  }
  const hash = await bcrypt.hash(PASSWORD, 12)
  await prisma.user.create({
    data: { username: USERNAME, passwordHash: hash, role: 'admin' }
  })
  console.log('Admin created:', USERNAME)
  console.log('Password: H@rb0r!SH_2026#Vx')
  console.log('IMPORTANT: Change your password immediately after first login.')
}

main().catch(console.error).finally(() => prisma.$disconnect())

// backend/scripts/seedTestAccounts.js
//
// Dev-only: seed three test accounts (student / teacher / self-learner) with
// email verification pre-satisfied and terms pre-accepted so the founder can
// log in locally without the outbound email provider (Resend) needing to
// accept verification-code requests on the dev stack.
//
// Usage (from repo root):
//   docker compose exec backend node scripts/seedTestAccounts.js
//
// Safe to re-run — upserts by username.

const bcrypt = require('bcryptjs')
const prisma = require('../src/lib/prisma')

const PASSWORD = 'Password123'

const ACCOUNTS = [
  {
    username: 'test_student',
    email: 'test_student@studyhub.local',
    accountType: 'student',
    role: 'student',
  },
  {
    username: 'test_teacher',
    email: 'test_teacher@studyhub.local',
    accountType: 'teacher',
    role: 'student',
  },
  {
    username: 'test_learner',
    email: 'test_learner@studyhub.local',
    accountType: 'other',
    role: 'student',
  },
]

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const now = new Date()

  for (const account of ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { username: account.username } })

    const data = {
      username: account.username,
      email: account.email,
      passwordHash,
      emailVerified: true,
      role: account.role,
      accountType: account.accountType,
      termsAcceptedAt: now,
    }

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data })
      process.stdout.write(`updated ${account.username} (${account.accountType})\n`)
    } else {
      await prisma.user.create({ data })
      process.stdout.write(`created ${account.username} (${account.accountType})\n`)
    }
  }

  process.stdout.write(
    `\nLogin at http://localhost:5173/login with any of the usernames above + password: ${PASSWORD}\n`,
  )
}

main()
  .catch((err) => {
    process.stderr.write(`${err.stack || err}\n`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

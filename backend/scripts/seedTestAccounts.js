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
//
// PRODUCTION GUARDRAIL: refuses to run when NODE_ENV=production unless
// ALLOW_SEED_TEST_ACCOUNTS=true is also set explicitly. The passwords
// are predictable ("Password123") and the accounts bypass email
// verification — they must never land in a production database by
// accident (e.g., if someone docker-execs the wrong container).

const bcrypt = require('bcryptjs')
const prisma = require('../src/lib/prisma')

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_TEST_ACCOUNTS !== 'true') {
  console.error(
    '[seedTestAccounts] refusing to run in production without ALLOW_SEED_TEST_ACCOUNTS=true.',
  )
  console.error(
    '  These test accounts have predictable passwords ("Password123") and skip email verification.',
  )
  console.error('  If you really mean to seed them in production (you almost never do): set both')
  console.error('    NODE_ENV=production ALLOW_SEED_TEST_ACCOUNTS=true')
  process.exit(1)
}

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

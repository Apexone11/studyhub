const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { SCHOOLS, COURSES } = require('../src/lib/catalogData')
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Clear existing data in correct order
  await prisma.enrollment.deleteMany()
  await prisma.studySheet.deleteMany()
  await prisma.course.deleteMany()
  await prisma.school.deleteMany()

  // Seed schools + courses
  for (const school of SCHOOLS) {
    const courses = COURSES[school.short] || COURSES['DEFAULT']

    const created = await prisma.school.create({
      data: {
        name:    school.name,
        short:   school.short,
        courses: {
          create: courses
        }
      }
    })
    console.log(`✅ ${school.short} — ${courses.length} courses`)
  }

  // Seed sample study sheets
  const umd = await prisma.school.findFirst({ where: { short: 'UMD' } })
  const cmsc131 = umd
    ? await prisma.course.findFirst({ where: { code: 'CMSC131', schoolId: umd.id } })
    : null
  const math140 = umd
    ? await prisma.course.findFirst({ where: { code: 'MATH140', schoolId: umd.id } })
    : null

  // Create a sample user for seeding
  let seedUser = await prisma.user.findUnique({ where: { username: 'studyhub_seed' } })

  if (!seedUser) {
    const seedPassword = process.env.SEED_USER_PASSWORD || crypto.randomBytes(12).toString('base64url')
    seedUser = await prisma.user.create({
      data: {
        username: 'studyhub_seed',
        passwordHash: await bcrypt.hash(seedPassword, 12),
        role: 'student'
      }
    })
    console.log('Created sample user: studyhub_seed')
    if (process.env.SEED_USER_PASSWORD) {
      console.log('Sample user password was taken from the SEED_USER_PASSWORD environment variable.')
    } else {
      console.log('A random sample password was generated for local use. To use a known password, set the SEED_USER_PASSWORD env var before running the seed script.')
    }
  }

  if (cmsc131 && math140) {
    await prisma.studySheet.createMany({
      data: [
        {
          title: 'CMSC131 Complete Study Guide',
          content:
            '# CMSC131 Study Guide\n\n## Object-Oriented Programming Basics\n\nJava is an object-oriented language...\n\n## Classes and Objects\n\nA class is a blueprint...',
          courseId: cmsc131.id,
          userId: seedUser.id,
          stars: 24,
          downloads: 67
        },
        {
          title: 'CMSC131 Recursion Cheatsheet',
          content:
            '# Recursion\n\n## Base Case\nAlways define a base case first...\n\n## Recursive Case\nBreak the problem into smaller subproblems...',
          courseId: cmsc131.id,
          userId: seedUser.id,
          stars: 18,
          downloads: 45
        },
        {
          title: 'Calculus I Limits & Derivatives',
          content:
            '# Calculus I\n\n## Limits\nlim(x→a) f(x) = L means...\n\n## Derivative Rules\n- Power Rule: d/dx[xⁿ] = nxⁿ⁻¹\n- Chain Rule...',
          courseId: math140.id,
          userId: seedUser.id,
          stars: 31,
          downloads: 89
        }
      ],
      skipDuplicates: true
    })
    console.log('✅ Sample sheets seeded')
  }

  console.log('\n🎉 Database seeded successfully!')
  console.log(`   ${SCHOOLS.length} schools`)
  const total = Object.values(COURSES).reduce((a, c) => a + c.length, 0)
  console.log(`   ${total}+ courses`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

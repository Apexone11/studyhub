const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = new PrismaClient()

const SCHOOLS = [
  { name: 'University of Maryland, College Park', short: 'UMD' },
  { name: 'UMBC', short: 'UMBC' },
  { name: 'Towson University', short: 'TU' },
  { name: 'Morgan State University', short: 'Morgan' },
  { name: 'Bowie State University', short: 'Bowie' },
  { name: 'Coppin State University', short: 'Coppin' },
  { name: 'Salisbury University', short: 'SU' },
  { name: 'Frostburg State University', short: 'FSU' },
  { name: 'University of Baltimore', short: 'UBalt' },
  { name: 'Johns Hopkins University', short: 'JHU' },
  { name: 'Loyola University Maryland', short: 'Loyola' },
  { name: 'McDaniel College', short: 'McDaniel' },
  { name: 'Hood College', short: 'Hood' },
  { name: 'Goucher College', short: 'Goucher' },
  { name: 'St. Mary\'s College of Maryland', short: 'SMCM' },
]

const COURSES = {
  'UMD': [
    { name: 'Calculus I',                    code: 'MATH140'  },
    { name: 'Calculus II',                   code: 'MATH141'  },
    { name: 'Calculus III',                  code: 'MATH241'  },
    { name: 'Linear Algebra',                code: 'MATH240'  },
    { name: 'Intro to Computer Science',     code: 'CMSC131'  },
    { name: 'Object-Oriented Programming',   code: 'CMSC132'  },
    { name: 'Discrete Math',                 code: 'CMSC250'  },
    { name: 'Data Structures',               code: 'CMSC420'  },
    { name: 'Algorithms',                    code: 'CMSC351'  },
    { name: 'Computer Architecture',         code: 'CMSC411'  },
    { name: 'Operating Systems',             code: 'CMSC412'  },
    { name: 'Intro to Biology',              code: 'BSCI105'  },
    { name: 'General Chemistry I',           code: 'CHEM131'  },
    { name: 'General Chemistry II',          code: 'CHEM132'  },
    { name: 'General Physics I',             code: 'PHYS141'  },
    { name: 'General Physics II',            code: 'PHYS142'  },
    { name: 'Macroeconomics',                code: 'ECON201'  },
    { name: 'Microeconomics',                code: 'ECON200'  },
    { name: 'Statistics',                    code: 'STAT400'  },
    { name: 'Technical Writing',             code: 'ENGL393'  },
  ],
  'UMBC': [
    { name: 'Intro to Computing',            code: 'CMSC201'  },
    { name: 'Computer Science II',           code: 'CMSC202'  },
    { name: 'Discrete Structures',           code: 'CMSC203'  },
    { name: 'Computer Organization',         code: 'CMSC313'  },
    { name: 'Data Structures',               code: 'CMSC341'  },
    { name: 'Algorithms',                    code: 'CMSC441'  },
    { name: 'Software Engineering',          code: 'CMSC345'  },
    { name: 'Database Management',           code: 'CMSC461'  },
    { name: 'Operating Systems',             code: 'CMSC421'  },
    { name: 'Calculus I',                    code: 'MATH151'  },
    { name: 'Calculus II',                   code: 'MATH152'  },
    { name: 'Linear Algebra',                code: 'MATH221'  },
    { name: 'General Chemistry I',           code: 'CHEM101'  },
    { name: 'General Physics I',             code: 'PHYS121'  },
    { name: 'Statistics for Scientists',     code: 'STAT355'  },
    { name: 'Intro to Biology',              code: 'BIOL100'  },
    { name: 'Principles of Economics',       code: 'ECON101'  },
    { name: 'Technical Communication',       code: 'ENGL393'  },
  ],
  'TU': [
    { name: 'Intro to Computer Science',     code: 'COSC175'  },
    { name: 'Data Structures',               code: 'COSC290'  },
    { name: 'Computer Organization',         code: 'COSC340'  },
    { name: 'Algorithms',                    code: 'COSC455'  },
    { name: 'Calculus I',                    code: 'MATH273'  },
    { name: 'Calculus II',                   code: 'MATH274'  },
    { name: 'General Chemistry',             code: 'CHEM110'  },
    { name: 'General Biology',               code: 'BIOL110'  },
    { name: 'Intro to Psychology',           code: 'PSYC101'  },
    { name: 'Principles of Accounting',      code: 'ACCT201'  },
  ],
  'DEFAULT': [
    { name: 'Calculus I',                    code: 'MATH101'  },
    { name: 'Calculus II',                   code: 'MATH102'  },
    { name: 'Intro to Computer Science',     code: 'CS101'    },
    { name: 'Data Structures',               code: 'CS201'    },
    { name: 'General Chemistry I',           code: 'CHEM101'  },
    { name: 'General Physics I',             code: 'PHYS101'  },
    { name: 'Intro to Biology',              code: 'BIO101'   },
    { name: 'Microeconomics',                code: 'ECON101'  },
    { name: 'Statistics',                    code: 'STAT101'  },
    { name: 'Technical Writing',             code: 'ENG201'   },
  ]
}

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

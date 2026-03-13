const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const router = express.Router()
const prisma = new PrismaClient()

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_MIN_LENGTH = 8
const TOKEN_EXPIRES_IN = '24h'
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

class AppError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }

  return process.env.JWT_SECRET
}

function createToken(user, jwtSecret) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: TOKEN_EXPIRES_IN }
  )
}

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue)) {
    throw new AppError(400, `${fieldName} must be an integer.`)
  }

  return parsedValue
}

function parseCourseIds(courseIds) {
  if (courseIds === undefined || courseIds === null) {
    return []
  }

  if (!Array.isArray(courseIds)) {
    throw new AppError(400, 'courseIds must be an array of integers.')
  }

  const parsedCourseIds = courseIds.map((courseId) => Number(courseId))

  if (parsedCourseIds.some((courseId) => !Number.isInteger(courseId))) {
    throw new AppError(400, 'courseIds must contain only integer values.')
  }

  return [...new Set(parsedCourseIds)]
}

function parseCustomCourses(customCourses) {
  if (customCourses === undefined || customCourses === null) {
    return []
  }

  if (!Array.isArray(customCourses)) {
    throw new AppError(400, 'customCourses must be an array.')
  }

  if (customCourses.length > 10) {
    throw new AppError(400, 'You can add up to 10 custom courses.')
  }

  const parsedCourses = customCourses.map((course, index) => {
    if (!course || typeof course !== 'object') {
      throw new AppError(400, `customCourses[${index}] must be an object.`)
    }

    const code = typeof course.code === 'string' ? course.code.trim().toUpperCase() : ''
    const name = typeof course.name === 'string' ? course.name.trim() : ''

    if (!code || !name) {
      throw new AppError(400, 'Each custom course must include both code and name.')
    }

    if (!COURSE_CODE_REGEX.test(code)) {
      throw new AppError(400, 'Custom course code must be 2-20 characters (A-Z, 0-9, or -).')
    }

    if (name.length < 2 || name.length > 120) {
      throw new AppError(400, 'Custom course name must be between 2 and 120 characters.')
    }

    return { code, name }
  })

  const uniqueByCode = new Map()

  parsedCourses.forEach((course) => {
    if (!uniqueByCode.has(course.code)) {
      uniqueByCode.set(course.code, course)
    }
  })

  return Array.from(uniqueByCode.values())
}

async function resolveCourseIds(tx, courseIds, customCourses, schoolId) {
  const resolvedCourseIds = [...courseIds]

  if (customCourses.length === 0) {
    return [...new Set(resolvedCourseIds)]
  }

  if (schoolId === null) {
    throw new AppError(400, 'schoolId is required when adding custom courses.')
  }

  for (const customCourse of customCourses) {
    const existingCourse = await tx.course.findFirst({
      where: {
        schoolId,
        code: {
          equals: customCourse.code,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    })

    if (existingCourse) {
      resolvedCourseIds.push(existingCourse.id)
      continue
    }

    const createdCourse = await tx.course.create({
      data: {
        schoolId,
        code: customCourse.code,
        name: customCourse.name
      },
      select: { id: true }
    })

    resolvedCourseIds.push(createdCourse.id)
  }

  return [...new Set(resolvedCourseIds)]
}

async function validateCourses(courseIds, schoolId) {
  if (courseIds.length === 0) {
    return
  }

  const where = {
    id: { in: courseIds }
  }

  if (schoolId !== null) {
    where.schoolId = schoolId
  }

  const courses = await prisma.course.findMany({
    where,
    select: { id: true }
  })

  if (courses.length !== courseIds.length) {
    throw new AppError(400, 'One or more provided courseIds are invalid for the given school.')
  }
}

function sendError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message })
  }

  if (error && error.code === 'P2002') {
    return res.status(409).json({ error: 'Username already taken.' })
  }

  console.error(error)
  return res.status(500).json({ error: 'Server error. Please try again.' })
}

// ── REGISTER ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const { schoolId, courseIds, customCourses } = body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username format.' })
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    })
  }

  try {
    const jwtSecret = getJwtSecret()
    const parsedSchoolId = parseOptionalInteger(schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(courseIds)
    const parsedCustomCourses = parseCustomCourses(customCourses)

    if (parsedCustomCourses.length > 0 && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before adding custom courses.')
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true }
    })

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken.' })
    }

    await validateCourses(parsedCourseIds, parsedSchoolId)

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { username, passwordHash }
      })

      const resolvedCourseIds = await resolveCourseIds(
        tx,
        parsedCourseIds,
        parsedCustomCourses,
        parsedSchoolId
      )

      if (resolvedCourseIds.length > 0) {
        await tx.enrollment.createMany({
          data: resolvedCourseIds.map((courseId) => ({
            userId: createdUser.id,
            courseId
          })),
          skipDuplicates: true
        })
      }

      return createdUser
    })

    const token = createToken(user, jwtSecret)

    return res.status(201).json({
      message: 'Account created!',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return res.status(400).json({ error: 'Please fill in both fields.' })
  }

  try {
    const jwtSecret = getJwtSecret()

    const user = await prisma.user.findUnique({
      where: { username }
    })

    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.' })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Incorrect username or password.' })
    }

    const token = createToken(user, jwtSecret)

    return res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

const requireAuth = require('../middleware/auth')

// Get current logged-in user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        enrollments: {
          include: { course: { include: { school: true } } }
        }
      }
    })

    return res.json(user)
  } catch (error) {
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
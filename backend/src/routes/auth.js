const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const router = express.Router()
const prisma = new PrismaClient()

// ── REGISTER ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, schoolId, courseIds } = req.body

  // Validate input
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: 'Invalid username format.' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }

  try {
    // Check if username already taken
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      return res.status(409).json({ error: 'Username already taken.' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: { username, passwordHash }
    })

    // Enroll in courses if provided
    if (courseIds !== undefined && courseIds !== null) {
      if (!Array.isArray(courseIds)) {
        return res.status(400).json({ error: 'courseIds must be an array of integers.' })
      }

      if (courseIds.length > 0) {
        const parsedCourseIds = courseIds.map((id) => Number(id))

        if (parsedCourseIds.some((id) => !Number.isInteger(id))) {
          return res.status(400).json({ error: 'courseIds must contain only integer values.' })
        }

        const uniqueCourseIds = Array.from(new Set(parsedCourseIds))

        const courseWhere = {
          id: { in: uniqueCourseIds }
        }

        if (schoolId !== undefined && schoolId !== null) {
          courseWhere.schoolId = schoolId
        }

        const existingCourses = await prisma.course.findMany({
          where: courseWhere
        })

        if (existingCourses.length !== uniqueCourseIds.length) {
          return res.status(400).json({ error: 'One or more provided courseIds are invalid for the given school.' })
        }

        await prisma.enrollment.createMany({
          data: parsedCourseIds.map((courseId) => ({ userId: user.id, courseId })),
          skipDuplicates: true
        })
      }
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.status(201).json({
      message: 'Account created!',
      token,
      user: { id: user.id, username: user.username, role: user.role }
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error. Please try again.' })
  }
})

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Please fill in both fields.' })
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.' })
    }

    // Check password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect username or password.' })
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, username: user.username, role: user.role }
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error. Please try again.' })
  }
})

module.exports = router
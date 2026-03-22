const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { schoolsLimiter } = require('./courses.constants')

const router = express.Router()

// Public endpoint for school + course dropdowns.
router.get('/schools', schoolsLimiter, async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        short: true,
        city: true,
        state: true,
        schoolType: true,
        courses: {
          select: {
            id: true,
            code: true,
            name: true,
            department: true,
          },
          orderBy: { code: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    })

    return res.json(schools)
  } catch (error) {
    captureError(error, {
      route: req.originalUrl,
      method: req.method
    })

    console.error(error)
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router

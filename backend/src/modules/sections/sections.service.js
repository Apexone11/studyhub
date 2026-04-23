/**
 * sections.service.js — business logic for teacher-owned sections and
 * student enrollment.
 *
 * Week 3 of Design Refresh v2. Every external call to this service must
 * go through sections.routes.js so auth + rate limits are applied first.
 *
 * Design notes:
 * - joinCode uniqueness is enforced at the DB level (`@unique`), but on
 *   collision (extremely rare with 31^6 code space) we retry up to
 *   MAX_JOIN_CODE_RETRIES times.
 * - Every read path filters out archived sections by default; archive
 *   is a recovery mechanism, not a trash bin.
 * - All prisma calls that depend on tables landing in the Week 3
 *   migration are wrapped so the endpoints still resolve in preview
 *   envs where the migration hasn't run yet.
 */

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { MAX_SECTIONS_PER_TEACHER, generateJoinCode } = require('./sections.constants')

const MAX_JOIN_CODE_RETRIES = 5

async function countTeacherSections(teacherId) {
  try {
    return await prisma.section.count({ where: { teacherId, archived: false } })
  } catch (err) {
    captureError(err, { where: 'sections.service.countTeacherSections', teacherId })
    return 0
  }
}

async function createSection({ teacherId, courseId, name, description }) {
  const activeCount = await countTeacherSections(teacherId)
  if (activeCount >= MAX_SECTIONS_PER_TEACHER) {
    const err = new Error(
      `Section limit reached (${MAX_SECTIONS_PER_TEACHER}). Archive an old section before creating a new one.`,
    )
    err.code = 'SECTION_LIMIT'
    throw err
  }

  for (let attempt = 0; attempt < MAX_JOIN_CODE_RETRIES; attempt += 1) {
    const joinCode = generateJoinCode()
    try {
      return await prisma.section.create({
        data: {
          teacherId,
          courseId: courseId ?? null,
          name,
          description: description ?? '',
          joinCode,
        },
      })
    } catch (err) {
      // Prisma uniqueness violation — retry with a fresh code.
      if (err && err.code === 'P2002' && attempt < MAX_JOIN_CODE_RETRIES - 1) continue
      throw err
    }
  }
  const err = new Error('Could not generate a unique join code. Please try again.')
  err.code = 'SECTION_JOIN_CODE_EXHAUSTED'
  throw err
}

async function listSectionsForTeacher(teacherId, { includeArchived = false } = {}) {
  try {
    return await prisma.section.findMany({
      where: {
        teacherId,
        ...(includeArchived ? {} : { archived: false }),
      },
      orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { enrollments: true, assignments: true } },
      },
    })
  } catch (err) {
    captureError(err, { where: 'sections.service.listSectionsForTeacher', teacherId })
    return []
  }
}

async function getSectionById(sectionId) {
  try {
    return await prisma.section.findUnique({
      where: { id: Number(sectionId) },
      include: {
        course: { select: { id: true, name: true, code: true } },
        _count: { select: { enrollments: true, assignments: true } },
      },
    })
  } catch (err) {
    captureError(err, { where: 'sections.service.getSectionById', sectionId })
    return null
  }
}

async function updateSection(sectionId, teacherId, patch) {
  // Authorization: the section must be owned by this teacher.
  const section = await prisma.section.findUnique({ where: { id: Number(sectionId) } })
  if (!section) {
    const err = new Error('Section not found.')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (section.teacherId !== teacherId) {
    const err = new Error('You do not own this section.')
    err.code = 'FORBIDDEN'
    throw err
  }
  const allowedFields = ['name', 'description', 'courseId', 'archived']
  const data = {}
  for (const key of allowedFields) {
    if (patch[key] !== undefined) data[key] = patch[key]
  }
  return prisma.section.update({ where: { id: Number(sectionId) }, data })
}

async function deleteSection(sectionId, teacherId) {
  const section = await prisma.section.findUnique({ where: { id: Number(sectionId) } })
  if (!section) return { deleted: false }
  if (section.teacherId !== teacherId) {
    const err = new Error('You do not own this section.')
    err.code = 'FORBIDDEN'
    throw err
  }
  await prisma.section.delete({ where: { id: Number(sectionId) } })
  return { deleted: true }
}

async function listEnrollments(sectionId) {
  try {
    return await prisma.sectionEnrollment.findMany({
      where: { sectionId: Number(sectionId) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { enrolledAt: 'asc' },
    })
  } catch (err) {
    captureError(err, { where: 'sections.service.listEnrollments', sectionId })
    return []
  }
}

async function enrollStudentByJoinCode(joinCode, studentId) {
  const section = await prisma.section.findUnique({ where: { joinCode } })
  if (!section) {
    const err = new Error('That join code did not match any active section.')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (section.archived) {
    const err = new Error('That section has been archived and no longer accepts enrollments.')
    err.code = 'ARCHIVED'
    throw err
  }
  if (section.teacherId === studentId) {
    const err = new Error('You cannot enroll in your own section.')
    err.code = 'SELF_ENROLL'
    throw err
  }
  try {
    return await prisma.sectionEnrollment.create({
      data: { sectionId: section.id, userId: studentId },
    })
  } catch (err) {
    if (err && err.code === 'P2002') {
      const dupErr = new Error('You are already enrolled in this section.')
      dupErr.code = 'ALREADY_ENROLLED'
      throw dupErr
    }
    throw err
  }
}

async function removeEnrollment(sectionId, studentId, actingUserId) {
  const section = await prisma.section.findUnique({ where: { id: Number(sectionId) } })
  if (!section) {
    const err = new Error('Section not found.')
    err.code = 'NOT_FOUND'
    throw err
  }
  // Teachers can remove anyone in their section; students can only remove themselves.
  const isTeacher = section.teacherId === actingUserId
  const isSelf = Number(studentId) === actingUserId
  if (!isTeacher && !isSelf) {
    const err = new Error('You cannot remove this enrollment.')
    err.code = 'FORBIDDEN'
    throw err
  }
  await prisma.sectionEnrollment.deleteMany({
    where: { sectionId: Number(sectionId), userId: Number(studentId) },
  })
  return { removed: true }
}

async function listSectionsForStudent(studentId) {
  try {
    return await prisma.sectionEnrollment.findMany({
      where: { userId: studentId },
      include: {
        section: {
          include: {
            teacher: { select: { id: true, username: true, displayName: true } },
            course: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    })
  } catch (err) {
    captureError(err, { where: 'sections.service.listSectionsForStudent', studentId })
    return []
  }
}

module.exports = {
  createSection,
  listSectionsForTeacher,
  getSectionById,
  updateSection,
  deleteSection,
  listEnrollments,
  enrollStudentByJoinCode,
  removeEnrollment,
  listSectionsForStudent,
}

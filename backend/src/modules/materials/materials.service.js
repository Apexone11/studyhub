/**
 * materials.service.js — teacher material curation + bulk assignment.
 *
 * A Material row is a teacher-curated wrapper around a StudySheet or Note,
 * with optional teacher-authored instructions and week grouping. Materials
 * are assigned to Sections via MaterialAssignment join rows.
 *
 * All cross-table queries use graceful degradation (try/catch → fallback)
 * to keep teacher surfaces working in preview envs where migrations may
 * be partially applied.
 */

const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { validateMaterialSource } = require('./materials.constants')

async function ensureSourceOwnership({ teacherId, sheetId, noteId }) {
  // A teacher can only wrap content they authored. This prevents a teacher
  // from silently "re-publishing" another user's sheet to their own roster.
  if (sheetId != null) {
    const sheet = await prisma.studySheet.findUnique({ where: { id: Number(sheetId) } })
    if (!sheet) return 'That sheet was not found.'
    if (sheet.userId !== teacherId) return 'You can only curate your own sheets as materials.'
    return null
  }
  if (noteId != null) {
    const note = await prisma.note.findUnique({ where: { id: Number(noteId) } })
    if (!note) return 'That note was not found.'
    if (note.userId !== teacherId) return 'You can only curate your own notes as materials.'
    return null
  }
  return null
}

async function createMaterial({ teacherId, sheetId, noteId, title, instructions, week }) {
  const sourceError = validateMaterialSource({ sheetId, noteId })
  if (sourceError) {
    const err = new Error(sourceError)
    err.code = 'VALIDATION'
    throw err
  }
  const ownershipError = await ensureSourceOwnership({ teacherId, sheetId, noteId })
  if (ownershipError) {
    const err = new Error(ownershipError)
    err.code = 'FORBIDDEN'
    throw err
  }
  return prisma.material.create({
    data: {
      teacherId,
      sheetId: sheetId != null ? Number(sheetId) : null,
      noteId: noteId != null ? Number(noteId) : null,
      title,
      instructions: instructions || '',
      week: week != null ? Number(week) : null,
    },
  })
}

async function listMaterialsForTeacher(teacherId, { includeArchived = false } = {}) {
  try {
    return await prisma.material.findMany({
      where: {
        teacherId,
        ...(includeArchived ? {} : { archived: false }),
      },
      orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
      include: {
        sheet: { select: { id: true, title: true, status: true } },
        note: { select: { id: true, title: true } },
        _count: { select: { assignments: true } },
      },
    })
  } catch (err) {
    captureError(err, { where: 'materials.service.listMaterialsForTeacher', teacherId })
    return []
  }
}

async function archiveMaterial(materialId, teacherId) {
  const material = await prisma.material.findUnique({ where: { id: Number(materialId) } })
  if (!material) {
    const err = new Error('Material not found.')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (material.teacherId !== teacherId) {
    const err = new Error('You do not own this material.')
    err.code = 'FORBIDDEN'
    throw err
  }
  return prisma.material.update({
    where: { id: Number(materialId) },
    data: { archived: true },
  })
}

/**
 * Bulk-assign one or more materials to one or more sections.
 *
 * Skips (materialId, sectionId) pairs where:
 *   - the material isn't owned by the teacher, or
 *   - the section isn't owned by the teacher, or
 *   - an assignment already exists (unique constraint).
 *
 * Returns { created: n, skipped: [{ materialId, sectionId, reason }] } so
 * the UI can show a specific reason per skipped pair instead of a vague
 * "some failed" toast.
 */
async function bulkAssign({ teacherId, materialIds, sectionIds, dueAt }) {
  const skipped = []
  let created = 0

  const [materials, sections] = await Promise.all([
    prisma.material.findMany({
      where: { id: { in: materialIds.map(Number) }, teacherId },
      select: { id: true },
    }),
    prisma.section.findMany({
      where: { id: { in: sectionIds.map(Number) }, teacherId },
      select: { id: true },
    }),
  ])
  const ownedMaterialIds = new Set(materials.map((m) => m.id))
  const ownedSectionIds = new Set(sections.map((s) => s.id))

  const existing = await prisma.materialAssignment.findMany({
    where: {
      materialId: { in: Array.from(ownedMaterialIds) },
      sectionId: { in: Array.from(ownedSectionIds) },
    },
    select: { materialId: true, sectionId: true },
  })
  const existingKey = (mid, sid) => `${mid}:${sid}`
  const existingSet = new Set(existing.map((e) => existingKey(e.materialId, e.sectionId)))

  const toInsert = []
  for (const mid of materialIds.map(Number)) {
    if (!ownedMaterialIds.has(mid)) {
      for (const sid of sectionIds)
        skipped.push({ materialId: mid, sectionId: Number(sid), reason: 'material_not_owned' })
      continue
    }
    for (const sid of sectionIds.map(Number)) {
      if (!ownedSectionIds.has(sid)) {
        skipped.push({ materialId: mid, sectionId: sid, reason: 'section_not_owned' })
        continue
      }
      if (existingSet.has(existingKey(mid, sid))) {
        skipped.push({ materialId: mid, sectionId: sid, reason: 'already_assigned' })
        continue
      }
      toInsert.push({
        materialId: mid,
        sectionId: sid,
        dueAt: dueAt ? new Date(dueAt) : null,
      })
    }
  }

  if (toInsert.length > 0) {
    const result = await prisma.materialAssignment.createMany({ data: toInsert })
    created = result.count
  }

  return { created, skipped }
}

async function deleteAssignment(assignmentId, teacherId) {
  const assignment = await prisma.materialAssignment.findUnique({
    where: { id: Number(assignmentId) },
    include: { material: { select: { teacherId: true } } },
  })
  if (!assignment) return { deleted: false }
  if (assignment.material.teacherId !== teacherId) {
    const err = new Error('You do not own this assignment.')
    err.code = 'FORBIDDEN'
    throw err
  }
  await prisma.materialAssignment.delete({ where: { id: Number(assignmentId) } })
  return { deleted: true }
}

async function listAssignmentsForStudent(studentId) {
  try {
    const enrollments = await prisma.sectionEnrollment.findMany({
      where: { userId: studentId },
      select: { sectionId: true },
    })
    const sectionIds = enrollments.map((e) => e.sectionId)
    if (sectionIds.length === 0) return []

    return await prisma.materialAssignment.findMany({
      where: { sectionId: { in: sectionIds } },
      orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
      include: {
        material: {
          include: {
            sheet: { select: { id: true, title: true, status: true } },
            note: { select: { id: true, title: true } },
            teacher: { select: { id: true, username: true, displayName: true } },
          },
        },
        section: { select: { id: true, name: true } },
      },
    })
  } catch (err) {
    captureError(err, { where: 'materials.service.listAssignmentsForStudent', studentId })
    return []
  }
}

module.exports = {
  createMaterial,
  listMaterialsForTeacher,
  archiveMaterial,
  bulkAssign,
  deleteAssignment,
  listAssignmentsForStudent,
  // Exposed for tests
  _internal: { ensureSourceOwnership },
}

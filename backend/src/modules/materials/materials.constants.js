/**
 * materials.constants.js — limits and invariants for the materials module.
 */

const MAX_MATERIAL_TITLE_LENGTH = 200
const MAX_MATERIAL_INSTRUCTIONS_LENGTH = 2000
const MAX_BULK_ASSIGN_SECTIONS = 25
const MAX_BULK_ASSIGN_MATERIALS = 25

// Materials wrap exactly one of (sheetId, noteId). Enforced in the service
// layer because Prisma 6.x doesn't support CHECK constraints natively.
function validateMaterialSource({ sheetId, noteId }) {
  const hasSheet = sheetId != null
  const hasNote = noteId != null
  if (hasSheet && hasNote) return 'A material must wrap EITHER a sheet OR a note, not both.'
  if (!hasSheet && !hasNote) return 'A material must wrap either a sheet or a note.'
  return null
}

module.exports = {
  MAX_MATERIAL_TITLE_LENGTH,
  MAX_MATERIAL_INSTRUCTIONS_LENGTH,
  MAX_BULK_ASSIGN_SECTIONS,
  MAX_BULK_ASSIGN_MATERIALS,
  validateMaterialSource,
}

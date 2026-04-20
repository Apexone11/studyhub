/**
 * sections.constants.js — shared limits and helpers for the sections module.
 *
 * Week 3 of Design Refresh v2. See
 * docs/internal/design-refresh-v2-week2-to-week5-execution.md.
 */

const MAX_SECTION_NAME_LENGTH = 120
const MAX_SECTION_DESCRIPTION_LENGTH = 500
const MAX_SECTIONS_PER_TEACHER = 50

// Join codes are short, human-typable, and avoid ambiguous glyphs (no 0/O, 1/I/L).
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const JOIN_CODE_LENGTH = 6

function generateJoinCode() {
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
  }
  return code
}

// Teacher-only gate — keeps the module usable in every env even if the
// accountType column hasn't been fully populated yet (falls back to
// trustLevel >= 2 like the onboarding-state endpoint does).
function isTeacherAccount(user) {
  if (!user) return false
  if (user.accountType === 'teacher') return true
  if (typeof user.trustLevel === 'number' && user.trustLevel >= 2) return true
  return false
}

module.exports = {
  MAX_SECTION_NAME_LENGTH,
  MAX_SECTION_DESCRIPTION_LENGTH,
  MAX_SECTIONS_PER_TEACHER,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  isTeacherAccount,
}

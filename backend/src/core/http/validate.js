/**
 * Shared lightweight validators for route parameters.
 */

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseOptionalInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

function parsePage(raw) {
  const page = Number.parseInt(raw, 10)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

module.exports = { parsePositiveInt, parseOptionalInteger, parsePage }

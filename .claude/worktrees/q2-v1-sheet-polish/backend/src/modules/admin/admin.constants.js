const PAGE_SIZE = 20

function parsePage(value, defaultValue = 1) {
  const parsed = parseInt(value || String(defaultValue), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue
  return parsed
}

function parseSuppressionStatus(rawStatus) {
  const value = String(rawStatus || 'active').trim().toLowerCase()
  if (value === 'all' || value === 'inactive') return value
  return 'active'
}

module.exports = {
  PAGE_SIZE,
  parsePage,
  parseSuppressionStatus,
}

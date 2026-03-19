function buildSheetTextSearchClauses(rawQuery) {
  const query = String(rawQuery || '').trim()

  if (!query) {
    return []
  }

  return [
    { title: { contains: query, mode: 'insensitive' } },
    { content: { contains: query, mode: 'insensitive' } },
    { description: { contains: query, mode: 'insensitive' } },
  ]
}

module.exports = {
  buildSheetTextSearchClauses,
}
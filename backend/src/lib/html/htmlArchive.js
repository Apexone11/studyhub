const zlib = require('node:zlib')
const { promisify } = require('node:util')

const gzipAsync = promisify(zlib.gzip)

async function archiveExpiredOriginalVersions(prisma, options = {}) {
  const olderThanDays = Number.isFinite(options.olderThanDays) ? options.olderThanDays : 20
  const limit = Number.isFinite(options.limit) ? options.limit : 50

  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

  const candidates = await prisma.sheetHtmlVersion.findMany({
    where: {
      kind: 'original',
      archivedAt: null,
      createdAt: { lte: cutoff },
      content: { not: '' },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      sheetId: true,
      content: true,
    },
  })

  let archived = 0

  for (const candidate of candidates) {
    const compressed = await gzipAsync(
      Buffer.from(candidate.content, 'utf8'),
      { level: zlib.constants.Z_BEST_SPEED },
    )

    await prisma.$transaction([
      prisma.sheetHtmlVersion.update({
        where: { id: candidate.id },
        data: {
          compressionAlgo: 'gzip',
          compressedContent: compressed,
          archivedAt: new Date(),
          content: '',
        },
      }),
      prisma.studySheet.update({
        where: { id: candidate.sheetId },
        data: {
          htmlOriginalArchivedAt: new Date(),
        },
      }),
    ])

    archived += 1
  }

  return {
    archived,
    inspected: candidates.length,
    cutoff,
  }
}

module.exports = {
  archiveExpiredOriginalVersions,
}
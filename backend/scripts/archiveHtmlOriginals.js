const prisma = require('../src/lib/prisma')
const { archiveExpiredOriginalVersions } = require('../src/lib/htmlArchive')

async function main() {
  const summary = await archiveExpiredOriginalVersions(prisma, {
    olderThanDays: Number.parseInt(process.env.HTML_ARCHIVE_DAYS || '20', 10),
    limit: Number.parseInt(process.env.HTML_ARCHIVE_BATCH_SIZE || '200', 10),
  })

  console.log(`Archived ${summary.archived} original HTML versions (inspected ${summary.inspected}, cutoff ${summary.cutoff.toISOString()}).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
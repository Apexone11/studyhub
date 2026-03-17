const fs = require('node:fs')
const path = require('node:path')
const prisma = require('../src/lib/prisma')
const {
  ATTACHMENTS_DIR,
  buildAttachmentUrl,
  ensureUploadDirectories,
} = require('../src/lib/storage')

const ownerUsername = process.env.BETA_OWNER_USERNAME || 'studyhub_owner'
const marker = '[beta-preview-fixture]'
const fixtureFileName = 'beta-preview-fixture.png'
const fixtureAttachmentUrl = buildAttachmentUrl(fixtureFileName)
const fixturePath = path.join(ATTACHMENTS_DIR, fixtureFileName)

// Small valid PNG so preview/download flows exercise a real attachment instead of a stub file.
const fixturePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAn0lEQVR4Ae3XQQrCQBQE0M3//2ydQkChl0A3NdxbYGN9VOGBev5nYeDg4ODg4ODg4OAwb2jpk6d4cE0l3MZoV+6Ewq2PgW1Xg0vS4Gz5B1q+0XcQ7Up4C1r7jvQOaWJ5jI5xB5VW0y3m4mR7aEuS2xJ9nM3x+0lO8ac2U2W3cT1kMypQG6g5h0l0ScnM5fYy0mqmX+8k1V2z1j6d5uQvg6cCwAAAAAAAAAAAAAAAAAAAPwV4QEbLQkXbJ6QWQAAAABJRU5ErkJggg==',
  'base64',
)

async function main() {
  ensureUploadDirectories()
  fs.writeFileSync(fixturePath, fixturePng)

  const owner = await prisma.user.findUnique({
    where: { username: ownerUsername },
    select: { id: true, username: true },
  })

  if (!owner) {
    throw new Error(`Could not find preview fixture owner "${ownerUsername}".`)
  }

  await prisma.feedPost.deleteMany({
    where: {
      userId: owner.id,
      content: marker,
    },
  })

  const post = await prisma.feedPost.create({
    data: {
      content: marker,
      userId: owner.id,
      attachmentUrl: fixtureAttachmentUrl,
      attachmentName: fixtureFileName,
      attachmentType: 'image',
      allowDownloads: true,
    },
    select: {
      id: true,
      content: true,
      attachmentUrl: true,
      attachmentName: true,
      createdAt: true,
    },
  })

  console.log(JSON.stringify({
    owner: owner.username,
    postId: post.id,
    previewPath: `/preview/feed-post/${post.id}`,
    attachmentUrl: post.attachmentUrl,
    attachmentName: post.attachmentName,
    fixturePath,
  }, null, 2))
}

main()
  .catch(() => {
    console.error('ensurePreviewFixture failed. Check internal diagnostics for details.')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

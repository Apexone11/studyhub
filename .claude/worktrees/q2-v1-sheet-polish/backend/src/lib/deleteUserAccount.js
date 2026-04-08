const { captureError } = require('../monitoring/sentry')
const { cleanupAttachmentIfUnused, cleanupAvatarIfUnused } = require('./storage')

async function deleteUserAccount(prisma, { userId, username, reason = null, details = null }) {
  const deletedAssetRefs = await prisma.$transaction(async (tx) => {
    const userRecord = await tx.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })

    if (reason) {
      await tx.deletionReason.create({
        data: {
          username,
          reason: String(reason).slice(0, 100),
          details: details ? String(details).slice(0, 300) : null,
        },
      })
    }

    await tx.enrollment.deleteMany({ where: { userId } })
    await tx.announcement.deleteMany({ where: { authorId: userId } })

    // Explicitly clean up study sheet dependents before deleting the sheets.
    // CASCADE on the FK is set, but in production transactions we delete
    // explicitly to avoid silent deadlocks or constraint failures.
    const userSheets = await tx.studySheet.findMany({
      where: { userId },
      select: { id: true, attachmentUrl: true },
    })
    const sheetIds = userSheets.map((sheet) => sheet.id)

    if (sheetIds.length > 0) {
      await tx.comment.deleteMany({ where: { sheetId: { in: sheetIds } } })
      await tx.starredSheet.deleteMany({ where: { sheetId: { in: sheetIds } } })
      await tx.reaction.deleteMany({ where: { sheetId: { in: sheetIds } } })
      await tx.sheetContribution.deleteMany({
        where: {
          OR: [
            { targetSheetId: { in: sheetIds } },
            { forkSheetId: { in: sheetIds } },
          ],
        },
      })
    }

    const userPosts = await tx.feedPost.findMany({
      where: { userId },
      select: { id: true, attachmentUrl: true },
    })
    const postIds = userPosts.map((post) => post.id)

    if (postIds.length > 0) {
      await tx.feedPostComment.deleteMany({ where: { postId: { in: postIds } } })
      await tx.feedPostReaction.deleteMany({ where: { postId: { in: postIds } } })
    }

    // Clean up note comments on the user's notes + comments the user authored elsewhere
    const userNotes = await tx.note.findMany({ where: { userId }, select: { id: true } })
    const noteIds = userNotes.map((n) => n.id)
    if (noteIds.length > 0) {
      await tx.noteComment.deleteMany({ where: { noteId: { in: noteIds } } })
    }
    await tx.noteComment.deleteMany({ where: { userId } })

    await tx.feedPostComment.deleteMany({ where: { userId } })
    await tx.feedPostReaction.deleteMany({ where: { userId } })
    await tx.sheetContribution.deleteMany({
      where: {
        OR: [
          { proposerId: userId },
          { reviewerId: userId },
        ],
      },
    })
    await tx.feedPost.deleteMany({ where: { userId } })

    await tx.studySheet.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })

    return {
      avatarUrl: userRecord?.avatarUrl || null,
      attachmentUrls: [
        ...new Set(
          [...userSheets, ...userPosts]
            .map((entry) => entry.attachmentUrl)
            .filter(Boolean)
        ),
      ],
    }
  })

  const cleanupTasks = [
    ...deletedAssetRefs.attachmentUrls.map((attachmentUrl) =>
      cleanupAttachmentIfUnused(prisma, attachmentUrl, {
        source: 'deleteUserAccount',
        userId,
      })
    ),
  ]

  if (deletedAssetRefs.avatarUrl) {
    cleanupTasks.push(cleanupAvatarIfUnused(prisma, deletedAssetRefs.avatarUrl, {
      source: 'deleteUserAccount',
      userId,
    }))
  }

  const cleanupResults = await Promise.allSettled(cleanupTasks)
  cleanupResults.forEach((result) => {
    if (result.status === 'rejected') {
      captureError(result.reason, {
        source: 'deleteUserAccountCleanup',
        userId,
      })
    }
  })
}

module.exports = {
  deleteUserAccount,
}

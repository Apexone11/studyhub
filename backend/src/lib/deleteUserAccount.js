async function deleteUserAccount(prisma, { userId, username, reason = null, details = null }) {
  return prisma.$transaction(async (tx) => {
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
    const sheetIds = (await tx.studySheet.findMany({
      where: { userId },
      select: { id: true },
    })).map(s => s.id)

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

    const postIds = (await tx.feedPost.findMany({
      where: { userId },
      select: { id: true },
    })).map((post) => post.id)

    if (postIds.length > 0) {
      await tx.feedPostComment.deleteMany({ where: { postId: { in: postIds } } })
      await tx.feedPostReaction.deleteMany({ where: { postId: { in: postIds } } })
    }

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
  })
}

module.exports = {
  deleteUserAccount,
}

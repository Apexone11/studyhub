const { captureError } = require('../monitoring/sentry')
const {
  cleanupAttachmentIfUnused,
  cleanupAvatarIfUnused,
  cleanupContentImageIfUnused,
  cleanupCoverIfUnused,
  cleanupNoteImageIfUnused,
  extractNoteImageUrlsFromTexts,
} = require('./storage')
const r2 = require('./r2Storage')
const { getStripe } = require('../modules/payments/payments.service')
const { deleteVideoAssetRefs } = require('../modules/video/video.service')

const CANCEL_ON_DELETE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function buildOrFilters(filters) {
  return (filters || []).filter(Boolean)
}

async function cancelStripeSubscriptionIfNeeded(prisma, userId) {
  if (!prisma?.subscription?.findUnique) return

  let subscription = null
  try {
    subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        stripeSubscriptionId: true,
        status: true,
      },
    })
  } catch (error) {
    captureError(error, {
      source: 'deleteUserAccountLoadSubscription',
      userId,
    })
    return
  }

  if (!subscription?.stripeSubscriptionId || !CANCEL_ON_DELETE_STATUSES.has(subscription.status)) {
    return
  }

  const stripe = getStripe()
  await stripe.subscriptions.cancel(subscription.stripeSubscriptionId)
}

async function cleanupAnnouncementImage(imageUrl, context = {}) {
  try {
    if (!r2.isR2Configured()) return false

    const key = r2.extractObjectKeyFromUrl(imageUrl)
    if (!key) return false

    await r2.deleteObject(key)
    return true
  } catch (error) {
    captureError(error, {
      source: 'cleanupAnnouncementImage',
      imageUrl,
      ...context,
    })
    return false
  }
}

async function deleteUserAccount(prisma, { userId, username, reason = null, details = null }) {
  await cancelStripeSubscriptionIfNeeded(prisma, userId)

  const deletedAssetRefs = await prisma.$transaction(async (tx) => {
    const userRecord = await tx.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true, coverImageUrl: true, email: true },
    })

    const announcementIds = (await tx.announcement.findMany({
      where: { authorId: userId },
      select: { id: true },
    })).map((announcement) => announcement.id)

    const announcementImageUrls = announcementIds.length > 0
      ? (await tx.announcementMedia.findMany({
        where: {
          announcementId: { in: announcementIds },
          type: 'image',
        },
        select: { url: true },
      })).map((media) => media.url).filter(Boolean)
      : []

    if (reason) {
      await tx.deletionReason.create({
        data: {
          username,
          reason: String(reason).slice(0, 100),
          details: details ? String(details).slice(0, 300) : null,
        },
      })
    }

    await tx.passwordResetToken.deleteMany({ where: { userId } })

    const verificationFilters = buildOrFilters([
      { userId },
      username ? { username } : null,
      userRecord?.email ? { email: userRecord.email } : null,
    ])

    if (verificationFilters.length > 0) {
      await tx.verificationChallenge.deleteMany({
        where: { OR: verificationFilters },
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

    const sheetCommentFilters = buildOrFilters([
      sheetIds.length > 0 ? { sheetId: { in: sheetIds } } : null,
      { userId },
    ])

    const sheetCommentIds = (await tx.comment.findMany({
      where: { OR: sheetCommentFilters },
      select: { id: true },
    })).map((comment) => comment.id)

    const sheetCommentAttachmentUrls = sheetCommentIds.length > 0
      ? (await tx.commentAttachment.findMany({
        where: { commentId: { in: sheetCommentIds } },
        select: { url: true },
      })).map((attachment) => attachment.url).filter(Boolean)
      : []

    if (sheetIds.length > 0) {
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

    await tx.comment.deleteMany({ where: { OR: sheetCommentFilters } })

    const userPosts = await tx.feedPost.findMany({
      where: { userId },
      select: { id: true, attachmentUrl: true },
    })
    const postIds = userPosts.map((post) => post.id)

    const feedCommentFilters = buildOrFilters([
      postIds.length > 0 ? { postId: { in: postIds } } : null,
      { userId },
    ])

    const feedCommentIds = (await tx.feedPostComment.findMany({
      where: { OR: feedCommentFilters },
      select: { id: true },
    })).map((comment) => comment.id)

    const feedCommentAttachmentUrls = feedCommentIds.length > 0
      ? (await tx.feedPostCommentAttachment.findMany({
        where: { commentId: { in: feedCommentIds } },
        select: { url: true },
      })).map((attachment) => attachment.url).filter(Boolean)
      : []

    if (postIds.length > 0) {
      await tx.feedPostReaction.deleteMany({ where: { postId: { in: postIds } } })
    }

    await tx.feedPostComment.deleteMany({ where: { OR: feedCommentFilters } })

    // Clean up note comments on the user's notes + comments the user authored elsewhere
    const userNotes = await tx.note.findMany({
      where: { userId },
      select: { id: true, content: true },
    })
    const noteIds = userNotes.map((n) => n.id)

    const noteVersionFilters = buildOrFilters([
      noteIds.length > 0 ? { noteId: { in: noteIds } } : null,
      { userId },
    ])

    const noteVersionsToDelete = await tx.noteVersion.findMany({
      where: { OR: noteVersionFilters },
      select: { content: true },
    })

    const noteImageUrls = extractNoteImageUrlsFromTexts([
      ...userNotes.map((note) => note.content),
      ...noteVersionsToDelete.map((version) => version.content),
    ])

    const noteCommentFilters = buildOrFilters([
      noteIds.length > 0 ? { noteId: { in: noteIds } } : null,
      { userId },
    ])

    const noteCommentIds = (await tx.noteComment.findMany({
      where: { OR: noteCommentFilters },
      select: { id: true },
    })).map((comment) => comment.id)

    const noteCommentAttachmentUrls = noteCommentIds.length > 0
      ? (await tx.noteCommentAttachment.findMany({
        where: { commentId: { in: noteCommentIds } },
        select: { url: true },
      })).map((attachment) => attachment.url).filter(Boolean)
      : []

    await tx.noteComment.deleteMany({ where: { OR: noteCommentFilters } })

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

    const userVideos = await tx.video.findMany({
      where: { userId },
      select: {
        id: true,
        r2Key: true,
        thumbnailR2Key: true,
        hlsManifestR2Key: true,
        variants: true,
        captions: {
          select: { vttR2Key: true },
        },
      },
    })
    const videoIds = userVideos.map((video) => video.id)

    const videoAppealDeleteFilters = buildOrFilters([
      videoIds.length > 0 ? { videoId: { in: videoIds } } : null,
      videoIds.length > 0 ? { originalVideoId: { in: videoIds } } : null,
      { uploaderId: userId },
    ])

    await tx.videoAppeal.deleteMany({ where: { OR: videoAppealDeleteFilters } })
    await tx.videoAppeal.updateMany({
      where: { reviewedBy: userId },
      data: { reviewedBy: null },
    })
    await tx.video.deleteMany({ where: { userId } })

    // ── Messaging cleanup (Conversation.createdById has no cascade) ──
    // Delete messages sent by this user (soft-delete reactions/attachments cascade)
    await tx.messageReaction.deleteMany({ where: { userId } })
    await tx.message.deleteMany({ where: { senderId: userId } })
    // Remove user from all conversations as participant
    await tx.conversationParticipant.deleteMany({ where: { userId } })
    // Delete conversations created by this user (cascades participants/messages)
    await tx.conversation.deleteMany({ where: { createdById: userId } })

    // ── Study Groups cleanup (StudyGroup.createdById has no cascade) ──
    // Clean up user's discussion upvotes, replies, and posts
    await tx.discussionUpvote.deleteMany({ where: { userId } })
    await tx.groupDiscussionReply.deleteMany({ where: { userId } })
    await tx.groupDiscussionPost.deleteMany({ where: { userId } })
    // Clean up RSVPs and resources added by the user
    await tx.groupSessionRsvp.deleteMany({ where: { userId } })
    await tx.groupResource.deleteMany({ where: { userId } })
    // Remove user from all groups as member
    await tx.studyGroupMember.deleteMany({ where: { userId } })
    // Delete groups created by this user (cascades members/resources/sessions/posts)
    await tx.studyGroup.deleteMany({ where: { createdById: userId } })

    // ── Share links and content shares (no cascade on createdById) ──
    await tx.shareLink.deleteMany({ where: { createdById: userId } })
    await tx.contentShare.deleteMany({
      where: { OR: [{ sharedById: userId }, { sharedWithId: userId }] },
    })

    // ── Block/Mute cleanup (cascade is set but explicit for safety) ──
    await tx.userBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    })
    await tx.userMute.deleteMany({
      where: { OR: [{ muterId: userId }, { mutedId: userId }] },
    })

    // ── Notes cleanup (versions, stars, then notes) ──
    if (noteIds.length > 0) {
      await tx.noteStar.deleteMany({ where: { noteId: { in: noteIds } } })
    }
    await tx.noteStar.deleteMany({ where: { userId } })
    await tx.noteVersion.deleteMany({ where: { OR: noteVersionFilters } })
    await tx.note.deleteMany({ where: { userId } })

    // ── Notifications cleanup ──
    await tx.notification.deleteMany({ where: { userId } })

    // ── Hub AI cleanup (messages cascade from conversations, but explicit for safety) ──
    await tx.aiMessage.deleteMany({ where: { userId } })
    await tx.aiUsageLog.deleteMany({ where: { userId } })
    await tx.aiConversation.deleteMany({ where: { userId } })

    await tx.studySheet.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })

    return {
      announcementImageUrls: uniq(announcementImageUrls),
      avatarUrl: userRecord?.avatarUrl || null,
      attachmentUrls: uniq([...userSheets, ...userPosts].map((entry) => entry.attachmentUrl)),
      contentImageUrls: uniq([
        ...sheetCommentAttachmentUrls,
        ...feedCommentAttachmentUrls,
        ...noteCommentAttachmentUrls,
      ]),
      coverImageUrl: userRecord?.coverImageUrl || null,
      noteImageUrls,
      videos: userVideos,
    }
  })

  const cleanupTasks = [
    ...deletedAssetRefs.attachmentUrls.map((attachmentUrl) =>
      cleanupAttachmentIfUnused(prisma, attachmentUrl, {
        source: 'deleteUserAccount',
        userId,
      })
    ),
    ...deletedAssetRefs.contentImageUrls.map((imageUrl) =>
      cleanupContentImageIfUnused(prisma, imageUrl, {
        source: 'deleteUserAccount',
        userId,
      })
    ),
    ...deletedAssetRefs.noteImageUrls.map((imageUrl) =>
      cleanupNoteImageIfUnused(prisma, imageUrl, {
        source: 'deleteUserAccount',
        userId,
      })
    ),
    ...deletedAssetRefs.announcementImageUrls.map((imageUrl) =>
      cleanupAnnouncementImage(imageUrl, {
        source: 'deleteUserAccount',
        userId,
      })
    ),
    ...deletedAssetRefs.videos.map((video) => deleteVideoAssetRefs(video)),
  ]

  if (deletedAssetRefs.avatarUrl) {
    cleanupTasks.push(cleanupAvatarIfUnused(prisma, deletedAssetRefs.avatarUrl, {
      source: 'deleteUserAccount',
      userId,
    }))
  }

  if (deletedAssetRefs.coverImageUrl) {
    cleanupTasks.push(cleanupCoverIfUnused(prisma, deletedAssetRefs.coverImageUrl, {
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

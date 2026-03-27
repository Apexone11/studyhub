const PROFILE_VISIBILITY = {
  PUBLIC: 'public',
  ENROLLED: 'enrolled',
  PRIVATE: 'private',
}

async function getVisibilityByUserId(prisma, userIds) {
  const uniqueUserIds = [...new Set(userIds.filter((userId) => Number.isInteger(userId)))]
  const visibilityByUserId = new Map(
    uniqueUserIds.map((userId) => [userId, PROFILE_VISIBILITY.PUBLIC]),
  )

  if (!uniqueUserIds.length) {
    return visibilityByUserId
  }

  let preferences = []
  try {
    preferences = await prisma.userPreferences.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, profileVisibility: true },
    })
  } catch {
    // If the UserPreferences table is not yet migrated, treat all users as public
    return visibilityByUserId
  }

  for (const preference of preferences) {
    visibilityByUserId.set(
      preference.userId,
      preference.profileVisibility || PROFILE_VISIBILITY.PUBLIC,
    )
  }

  return visibilityByUserId
}

async function getSharedCourseUserIds(prisma, viewerUserId, targetUserIds) {
  const uniqueTargetUserIds = [...new Set(targetUserIds.filter((userId) => Number.isInteger(userId)))]

  if (!viewerUserId || !uniqueTargetUserIds.length) {
    return new Set()
  }

  const [viewerEnrollments, targetEnrollments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: viewerUserId },
      select: { courseId: true },
    }),
    prisma.enrollment.findMany({
      where: { userId: { in: uniqueTargetUserIds } },
      select: { userId: true, courseId: true },
    }),
  ])

  const viewerCourseIds = new Set(viewerEnrollments.map((enrollment) => enrollment.courseId))
  const sharedCourseUserIds = new Set()

  for (const enrollment of targetEnrollments) {
    if (viewerCourseIds.has(enrollment.courseId)) {
      sharedCourseUserIds.add(enrollment.userId)
    }
  }

  return sharedCourseUserIds
}

async function getVisibleProfileIds(prisma, viewer, userIds) {
  const uniqueUserIds = [...new Set(userIds.filter((userId) => Number.isInteger(userId)))]
  const visibleUserIds = new Set()

  if (!uniqueUserIds.length) {
    return visibleUserIds
  }

  if (viewer?.role === 'admin') {
    return new Set(uniqueUserIds)
  }

  const visibilityByUserId = await getVisibilityByUserId(prisma, uniqueUserIds)
  const classmatesOnlyUserIds = []

  for (const userId of uniqueUserIds) {
    if (viewer?.userId === userId) {
      visibleUserIds.add(userId)
      continue
    }

    const visibility = visibilityByUserId.get(userId) || PROFILE_VISIBILITY.PUBLIC

    if (visibility === PROFILE_VISIBILITY.PUBLIC) {
      visibleUserIds.add(userId)
      continue
    }

    if (visibility === PROFILE_VISIBILITY.ENROLLED) {
      classmatesOnlyUserIds.push(userId)
    }
  }

  if (!viewer?.userId || !classmatesOnlyUserIds.length) {
    return visibleUserIds
  }

  const sharedCourseUserIds = await getSharedCourseUserIds(
    prisma,
    viewer.userId,
    classmatesOnlyUserIds,
  )

  for (const userId of sharedCourseUserIds) {
    visibleUserIds.add(userId)
  }

  return visibleUserIds
}

async function getProfileAccessDecision(prisma, viewer, targetUserId) {
  const visibilityByUserId = await getVisibilityByUserId(prisma, [targetUserId])
  const visibility = visibilityByUserId.get(targetUserId) || PROFILE_VISIBILITY.PUBLIC

  if (viewer?.role === 'admin' || viewer?.userId === targetUserId) {
    return { allowed: true, visibility }
  }

  if (visibility === PROFILE_VISIBILITY.PUBLIC) {
    return { allowed: true, visibility }
  }

  if (visibility === PROFILE_VISIBILITY.PRIVATE) {
    return { allowed: false, visibility }
  }

  if (!viewer?.userId) {
    return { allowed: false, visibility }
  }

  const sharedCourseUserIds = await getSharedCourseUserIds(prisma, viewer.userId, [targetUserId])

  return {
    allowed: sharedCourseUserIds.has(targetUserId),
    visibility,
  }
}

module.exports = {
  PROFILE_VISIBILITY,
  getProfileAccessDecision,
  getVisibleProfileIds,
}
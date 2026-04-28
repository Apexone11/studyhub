const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { EVENTS, trackServerEvent } = require('../../lib/events')

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_ONBOARDING_AGE_DAYS = 30
const MAX_COURSES_PER_STEP = 6
const INTEREST_TAGS_WHITELIST = ['exam_prep', 'note_sharing', 'group_study', 'research', 'tutoring']
const VALID_ACTION_TYPES = ['ai_sheet', 'star', 'upload_note']
const MAX_PROMPT_LENGTH = 500
const MAX_NOTE_TITLE_LENGTH = 200
const MAX_NOTE_CONTENT_LENGTH = 10000
const TOTAL_STEPS = 7

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a typed error with a status code for the controller to forward.
 */
function serviceError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

/**
 * Format an OnboardingProgress row into the public state shape.
 */
function formatState(row) {
  return {
    currentStep: row.currentStep,
    completed: Boolean(row.completedAt),
    skipped: Boolean(row.skippedAt),
    progress: {
      schoolSelected: row.schoolSelected,
      coursesAdded: row.coursesAdded,
      firstActionType: row.firstActionType,
      invitesSent: row.invitesSent,
    },
  }
}

// ── Core Service Functions ─────────────────────────────────────────────────

/**
 * Get or create the onboarding progress row for a user.
 * Returns null for users created more than 30 days ago (they skip onboarding).
 */
async function getOrCreateProgress(userId) {
  const existing = await prisma.onboardingProgress.findUnique({
    where: { userId },
  })
  if (existing) return existing

  // Check if user is recent enough for onboarding
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })
  if (!user) throw serviceError(404, 'User not found.')

  const ageMs = Date.now() - new Date(user.createdAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  if (ageDays > MAX_ONBOARDING_AGE_DAYS) {
    return null
  }

  return prisma.onboardingProgress.create({
    data: { userId },
  })
}

/**
 * Get the formatted onboarding state for a user.
 * Returns null if the user does not need onboarding.
 */
async function getState(userId) {
  const row = await getOrCreateProgress(userId)
  if (!row) return null
  return formatState(row)
}

/**
 * Apply a step submission to the onboarding flow.
 */
async function applyStep(userId, step, payload) {
  const row = await getOrCreateProgress(userId)
  if (!row) throw serviceError(400, 'Onboarding not available for this account.')

  // Idempotency: if user already passed this step, return current state
  if (step < row.currentStep) {
    return formatState(row)
  }

  // Enforce step ordering
  if (step !== row.currentStep) {
    throw serviceError(400, `Expected step ${row.currentStep}, received step ${step}.`)
  }

  if (step < 1 || step > TOTAL_STEPS) {
    throw serviceError(400, `Step must be between 1 and ${TOTAL_STEPS}.`)
  }

  const updateData = {
    skippedAt: null, // Clear skip on any step submission (resume behavior)
  }

  switch (step) {
    case 1:
      // Welcome -- no payload needed, just advance
      updateData.currentStep = 2
      break

    case 2:
      // School selection
      await handleSchoolStep(userId, payload, updateData)
      break

    case 3:
      // Course enrollment
      await handleCoursesStep(userId, payload, updateData)
      break

    case 4:
      // Interests
      await handleInterestsStep(userId, payload, updateData)
      break

    case 5:
      // First success action
      await handleFirstActionStep(userId, payload, updateData)
      break

    case 6:
      // Invite
      handleInviteStep(payload, updateData)
      break

    case 7:
      // Done
      updateData.completedAt = new Date()
      updateData.currentStep = 7
      break

    default:
      throw serviceError(400, `Invalid step: ${step}.`)
  }

  const updated = await prisma.onboardingProgress.update({
    where: { userId },
    data: updateData,
  })

  trackServerEvent(String(userId), EVENTS.ONBOARDING_STEP_COMPLETED, { step })

  if (step === TOTAL_STEPS) {
    trackServerEvent(String(userId), EVENTS.ONBOARDING_FINISHED, {
      stepsCompleted: TOTAL_STEPS,
    })
  }

  return formatState(updated)
}

// ── Step Handlers ──────────────────────────────────────────────────────────

async function handleSchoolStep(userId, payload, updateData) {
  if (!payload || !payload.schoolId) {
    throw serviceError(400, 'schoolId is required for step 2.')
  }

  const schoolId = Number(payload.schoolId)
  if (!schoolId || isNaN(schoolId)) {
    throw serviceError(400, 'schoolId must be a valid number.')
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } })
  if (!school) throw serviceError(404, 'School not found.')

  // Don't create an Enrollment row here. Enrollment is course-level
  // (userId + courseId only — no schoolId column; see schema.prisma).
  // School membership is currently derived from the user's enrolled
  // courses via course.school. The previous attempt at
  // `prisma.enrollment.create({ data: { userId, schoolId } })` silently
  // failed on every step 2 submission and only logged a warning. Step 3
  // (handleCoursesStep) creates the actual Enrollment rows that pin the
  // user to courses, which transitively pin them to a school.
  // The dedicated UserSchoolEnrollment table belongs to the Phase R1
  // dual-enrollment cleanup (Task #64) and is not in scope here.

  updateData.schoolSelected = true
  updateData.currentStep = 3
}

async function handleCoursesStep(userId, payload, updateData) {
  if (!payload || !Array.isArray(payload.courseIds)) {
    throw serviceError(400, 'courseIds array is required for step 3.')
  }

  const courseIds = payload.courseIds.map(Number).filter((n) => n > 0 && !isNaN(n))
  if (courseIds.length === 0) {
    throw serviceError(400, 'At least one valid courseId is required.')
  }
  if (courseIds.length > MAX_COURSES_PER_STEP) {
    throw serviceError(400, `Maximum ${MAX_COURSES_PER_STEP} courses allowed.`)
  }

  // Verify all courses exist
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true },
  })
  const foundIds = new Set(courses.map((c) => c.id))
  const missing = courseIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw serviceError(404, `Courses not found: ${missing.join(', ')}`)
  }

  // Create enrollments (skip duplicates)
  for (const courseId of courseIds) {
    const exists = await prisma.enrollment.findFirst({
      where: { userId, courseId },
    })
    if (!exists) {
      try {
        await prisma.enrollment.create({
          data: { userId, courseId },
        })
      } catch (err) {
        log.warn({ err, userId, courseId }, 'Failed to create course enrollment during onboarding')
      }
    }
  }

  updateData.coursesAdded = courseIds.length
  updateData.currentStep = 4
}

async function handleInterestsStep(userId, payload, updateData) {
  if (!payload || !Array.isArray(payload.tags)) {
    throw serviceError(400, 'tags array is required for step 4.')
  }

  const invalidTags = payload.tags.filter((t) => !INTEREST_TAGS_WHITELIST.includes(t))
  if (invalidTags.length > 0) {
    throw serviceError(
      400,
      `Invalid tags: ${invalidTags.join(', ')}. Valid: ${INTEREST_TAGS_WHITELIST.join(', ')}`,
    )
  }

  // Store interests in userPreferences profileFieldVisibility JSON (under onboardingInterests key).
  // This is non-blocking: we still advance the step even if preferences save fails.
  try {
    const existing = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { profileFieldVisibility: true },
    })
    const visibility =
      existing && typeof existing.profileFieldVisibility === 'object'
        ? existing.profileFieldVisibility
        : {}
    const merged = { ...visibility, onboardingInterests: payload.tags }

    await prisma.userPreferences.upsert({
      where: { userId },
      update: { profileFieldVisibility: merged },
      create: { userId, profileFieldVisibility: merged },
    })
  } catch (err) {
    log.warn({ err, userId }, 'Failed to store onboarding interests in userPreferences')
  }

  updateData.currentStep = 5
}

async function handleFirstActionStep(userId, payload, updateData) {
  if (!payload || !payload.actionType) {
    throw serviceError(400, 'actionType is required for step 5.')
  }

  if (!VALID_ACTION_TYPES.includes(payload.actionType)) {
    throw serviceError(400, `Invalid actionType. Must be one of: ${VALID_ACTION_TYPES.join(', ')}`)
  }

  await executeFirstAction(userId, payload.actionType, payload)

  updateData.firstActionType = payload.actionType
  updateData.currentStep = 6
}

function handleInviteStep(payload, updateData) {
  const emailCount =
    payload && Array.isArray(payload.emails)
      ? payload.emails.filter((e) => typeof e === 'string' && e.trim().length > 0).length
      : 0

  updateData.invitesSent = emailCount
  updateData.currentStep = 7
}

// ── First Action Executor ──────────────────────────────────────────────────

async function executeFirstAction(userId, actionType, actionPayload) {
  switch (actionType) {
    case 'star': {
      if (!actionPayload || !actionPayload.sheetId) {
        throw serviceError(400, 'sheetId is required for star action.')
      }
      const sheetId = Number(actionPayload.sheetId)
      if (!sheetId || isNaN(sheetId)) {
        throw serviceError(400, 'sheetId must be a valid number.')
      }
      const sheet = await prisma.studySheet.findFirst({
        where: { id: sheetId, status: 'published' },
        select: { id: true },
      })
      if (!sheet) throw serviceError(404, 'Sheet not found or not published.')

      // Create star if not already starred
      try {
        await prisma.starredSheet.create({
          data: { userId, sheetId },
        })
      } catch (err) {
        // Unique constraint violation means already starred -- that is fine
        if (err.code !== 'P2002') {
          throw err
        }
      }
      break
    }

    case 'ai_sheet': {
      // Only validate the inputs and record the action — DO NOT create a
      // placeholder StudySheet here. Earlier this branch wrote a draft
      // whose content was the literal prompt (`<p>Generated from
      // onboarding prompt: ${prompt}</p>`), which deceived users into
      // thinking the AI had generated something for them. The real
      // generation happens via Hub AI's streaming endpoint; the frontend
      // hands off the prompt by navigating to `/ai?prompt=<text>` after
      // this action succeeds, so the user lands on a prefilled Hub AI
      // chat where the actual sheet gets generated for real.
      if (!actionPayload || !actionPayload.prompt) {
        throw serviceError(400, 'prompt is required for ai_sheet action.')
      }
      if (actionPayload.prompt.length > MAX_PROMPT_LENGTH) {
        throw serviceError(400, `Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`)
      }

      const courseId = actionPayload.courseId ? Number(actionPayload.courseId) : null
      if (courseId) {
        const course = await prisma.course.findUnique({
          where: { id: courseId },
          select: { id: true },
        })
        if (!course) throw serviceError(404, 'Course not found.')
      }
      // Action is recorded by the controller wrapper writing to
      // OnboardingAction; nothing more to do server-side.
      break
    }

    case 'upload_note': {
      if (!actionPayload || !actionPayload.title) {
        throw serviceError(400, 'title is required for upload_note action.')
      }
      if (actionPayload.title.length > MAX_NOTE_TITLE_LENGTH) {
        throw serviceError(400, `Title must be at most ${MAX_NOTE_TITLE_LENGTH} characters.`)
      }
      if (!actionPayload.content) {
        throw serviceError(400, 'content is required for upload_note action.')
      }
      if (actionPayload.content.length > MAX_NOTE_CONTENT_LENGTH) {
        throw serviceError(400, `Content must be at most ${MAX_NOTE_CONTENT_LENGTH} characters.`)
      }

      await prisma.note.create({
        data: {
          title: actionPayload.title,
          content: actionPayload.content,
          userId,
          visibility: 'private',
        },
      })
      break
    }

    default:
      throw serviceError(400, `Unknown action type: ${actionType}`)
  }
}

// ── Complete / Skip ────────────────────────────────────────────────────────

async function complete(userId) {
  const row = await getOrCreateProgress(userId)
  if (!row) throw serviceError(400, 'Onboarding not available for this account.')

  if (row.currentStep < TOTAL_STEPS) {
    throw serviceError(400, `Cannot complete onboarding before reaching step ${TOTAL_STEPS}.`)
  }

  const updated = await prisma.onboardingProgress.update({
    where: { userId },
    data: { completedAt: new Date() },
  })

  trackServerEvent(String(userId), EVENTS.ONBOARDING_FINISHED, {
    stepsCompleted: TOTAL_STEPS,
  })

  return formatState(updated)
}

async function skip(userId) {
  const row = await getOrCreateProgress(userId)
  if (!row) throw serviceError(400, 'Onboarding not available for this account.')

  const updated = await prisma.onboardingProgress.update({
    where: { userId },
    data: { skippedAt: new Date() },
  })

  trackServerEvent(String(userId), EVENTS.ONBOARDING_SKIPPED, {
    skippedAtStep: row.currentStep,
  })

  return formatState(updated)
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getOrCreateProgress,
  getState,
  applyStep,
  complete,
  skip,
}

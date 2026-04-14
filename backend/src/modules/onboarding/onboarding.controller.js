const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const service = require('./onboarding.service')

/**
 * GET /api/onboarding/state
 * Returns the current onboarding state for the authenticated user.
 */
async function getOnboardingState(req, res) {
  try {
    const state = await service.getState(req.user.userId)
    if (!state) {
      return res.json({ onboarding: null })
    }
    res.json({ onboarding: state })
  } catch (err) {
    if (err.status) {
      return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    }
    sendError(res, 500, 'Failed to load onboarding state.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/onboarding/step
 * Submit a step in the onboarding flow.
 * Body: { step: number, payload: object }
 */
async function submitStep(req, res) {
  try {
    const { step, payload } = req.body

    const stepNum = Number(step)
    if (!stepNum || isNaN(stepNum) || stepNum < 1 || stepNum > 7) {
      return sendError(res, 400, 'step must be a number between 1 and 7.', ERROR_CODES.VALIDATION)
    }

    const state = await service.applyStep(req.user.userId, stepNum, payload || {})
    res.json({ onboarding: state })
  } catch (err) {
    if (err.status) {
      return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    }
    sendError(res, 500, 'Failed to submit onboarding step.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/onboarding/complete
 * Mark onboarding as completed.
 */
async function completeOnboarding(req, res) {
  try {
    const state = await service.complete(req.user.userId)
    res.json({ onboarding: state })
  } catch (err) {
    if (err.status) {
      return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    }
    sendError(res, 500, 'Failed to complete onboarding.', ERROR_CODES.INTERNAL)
  }
}

/**
 * POST /api/onboarding/skip
 * Skip onboarding entirely.
 */
async function skipOnboarding(req, res) {
  try {
    const state = await service.skip(req.user.userId)
    res.json({ onboarding: state })
  } catch (err) {
    if (err.status) {
      return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    }
    sendError(res, 500, 'Failed to skip onboarding.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  getOnboardingState,
  submitStep,
  completeOnboarding,
  skipOnboarding,
}

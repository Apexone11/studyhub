/* ═══════════════════════════════════════════════════════════════════════════
 * events.js — Server-side event catalog and PostHog forwarding
 *
 * Provides typed event constants and a safe trackServerEvent() function
 * that forwards product analytics events to PostHog server-side.
 *
 * Privacy: Never pass PII (emails, names, content) in event properties.
 * Only pass IDs, counts, durations, and booleans.
 *
 * Usage:
 *   const { EVENTS, trackServerEvent } = require('./events')
 *   trackServerEvent(userId, EVENTS.SIGNUP_COMPLETED, { method: 'email' })
 *
 * Safe to call in any environment — silently no-ops when POSTHOG_API_KEY
 * is not set (typical for local dev and test).
 * ═══════════════════════════════════════════════════════════════════════════ */
const log = require('./logger')

// ---------------------------------------------------------------------------
// Event constants
// ---------------------------------------------------------------------------

const EVENTS = Object.freeze({
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_FINISHED: 'onboarding_finished',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  SHEET_FIRST_CREATED: 'sheet_first_created',
  SHEET_STARRED_FIRST: 'sheet_starred_first',
  NOTE_FIRST_CREATED: 'note_first_created',
  REFERRAL_SENT: 'referral_sent',
  REFERRAL_ACCEPTED: 'referral_accepted',
  REFERRAL_REWARD_GRANTED: 'referral_reward_granted',
  AI_STREAM_TTFT: 'ai_stream_ttft',
})

// ---------------------------------------------------------------------------
// PostHog client (lazy-initialized)
// ---------------------------------------------------------------------------

/** @type {import('posthog-node').PostHog | null} */
let posthogClient = null
let initAttempted = false

/**
 * Lazily create the PostHog client on first use.
 * Returns null when POSTHOG_API_KEY is not configured.
 */
function getPostHogClient() {
  if (posthogClient) return posthogClient
  if (initAttempted) return null

  initAttempted = true

  const apiKey = process.env.POSTHOG_API_KEY
  if (!apiKey) {
    log.debug('PostHog API key not set — server events will be no-ops')
    return null
  }

  try {
    const { PostHog } = require('posthog-node')
    posthogClient = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000,
    })
    log.info('PostHog server-side client initialized')
    return posthogClient
  } catch (err) {
    log.warn({ err }, 'Failed to initialize PostHog server-side client')
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a server-side product event in PostHog.
 *
 * Safe to call at any time — silently no-ops when PostHog is not configured.
 * Never throws.
 *
 * Privacy: properties must NOT contain PII (emails, names, content).
 * Only pass IDs, counts, durations, and booleans.
 *
 * @param {number|string|null} userId  The user who triggered the event
 * @param {string} eventName           One of the EVENTS constants
 * @param {Record<string, unknown>} [properties]  Flat properties object
 */
function trackServerEvent(userId, eventName, properties = {}) {
  try {
    const client = getPostHogClient()
    if (!client) return

    const distinctId = userId != null ? String(userId) : 'anonymous'

    client.capture({
      distinctId,
      event: eventName,
      properties: {
        ...properties,
        source: 'server',
        timestamp: new Date().toISOString(),
      },
    })
  } catch (err) {
    log.warn({ err, eventName }, 'Failed to track server event')
  }
}

/**
 * Flush pending events and shut down the PostHog client.
 * Call during graceful process shutdown.
 */
async function flushEvents() {
  try {
    if (posthogClient) {
      await posthogClient.shutdown()
      posthogClient = null
      initAttempted = false
    }
  } catch (err) {
    log.warn({ err }, 'Failed to flush PostHog events on shutdown')
  }
}

module.exports = {
  EVENTS,
  trackServerEvent,
  flushEvents,
}

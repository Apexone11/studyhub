/**
 * analytics.js -- Typed client-side event wrapper.
 *
 * Wraps PostHog capture with typed event constants matching the backend
 * catalog in events.js. Gates on user opt-out preference via telemetry.js.
 */
import { trackEvent } from './telemetry'

export const CLIENT_EVENTS = {
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_FINISHED: 'onboarding_finished',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  SHEET_FIRST_CREATED: 'sheet_first_created',
  SHEET_STARRED_FIRST: 'sheet_starred_first',
  NOTE_FIRST_CREATED: 'note_first_created',
  REFERRAL_SENT: 'referral_sent',
  REFERRAL_ACCEPTED: 'referral_accepted',
  AI_STREAM_TTFT: 'ai_stream_ttft',
  WEB_VITALS: 'web_vitals',
}

export function trackClientEvent(eventName, props = {}) {
  trackEvent(eventName, { ...props, source: 'client' })
}

const { CURRENT_LEGAL_VERSION, LEGAL_DOCUMENT_ORDER } = require('./legal.seed')

const LEGAL_REMINDER_NOTIFICATION_TYPE = 'legal_acceptance_required'
const LEGAL_REMINDER_LINK_PATH = '/settings?tab=legal'

const LEGAL_ACCEPTANCE_SOURCES = {
  REGISTER: 'register',
  GOOGLE_SIGNUP: 'google-signup',
  SETTINGS: 'settings',
  LEGACY_BACKFILL: 'legacy-backfill',
}

module.exports = {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  LEGAL_DOCUMENT_ORDER,
  LEGAL_REMINDER_LINK_PATH,
  LEGAL_REMINDER_NOTIFICATION_TYPE,
}

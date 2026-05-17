const { settingsTwoFaLimiter } = require('../../lib/rateLimiters')

// Re-export rate limiter with original name for backward compatibility
const twoFaLimiter = settingsTwoFaLimiter

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

const PREF_BOOLEAN_KEYS = [
  'emailDigest',
  'emailMentions',
  'emailContributions',
  'emailComments',
  'emailSocial',
  'emailStudyGroups',
  'inAppNotifications',
  'inAppMentions',
  'inAppComments',
  'inAppSocial',
  'inAppContributions',
  'inAppStudyGroups',
  'defaultDownloads',
  'defaultContributions',
  // Security alert prefs (Phase 3)
  'alertOnNewCountry',
  'alertOnNewCity',
  'blockAnonymousIp',
  // School-scoped search (wave-12.3, 2026-05-16). Default true at the
  // schema level — when on, course pickers in Notes/Sheets/AI Sheet
  // Setup default to showing only the user's primary school's courses.
  'scopeBySchool',
]
const PREF_ENUM_KEYS = {
  profileVisibility: ['public', 'enrolled', 'private'],
  theme: ['system', 'light', 'dark'],
  fontSize: ['small', 'medium', 'large'],
}

module.exports = {
  twoFaLimiter,
  USERNAME_REGEX,
  COURSE_CODE_REGEX,
  PREF_BOOLEAN_KEYS,
  PREF_ENUM_KEYS,
}

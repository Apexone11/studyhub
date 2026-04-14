/**
 * referrals.constants.js -- Referral system constants.
 *
 * Milestone thresholds, valid channels, and code generation parameters.
 * Reward amounts are defined here as server-side constants only -- never
 * derived from user input.
 */

const MILESTONES = [
  { threshold: 5, proMonths: 1, badgeKey: 'referrer' },
  { threshold: 15, proMonths: 2, badgeKey: 'top_referrer' },
  { threshold: 30, proMonths: 3, badgeKey: 'referral_champion' },
  { threshold: 50, proMonths: 3, badgeKey: 'ambassador' },
]

const VALID_CHANNELS = ['email', 'link', 'copy']
const MAX_INVITES_PER_REQUEST = 5
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789'
const CODE_LENGTH = 8

module.exports = { MILESTONES, VALID_CHANNELS, MAX_INVITES_PER_REQUEST, CODE_CHARS, CODE_LENGTH }

/**
 * Notification priority policy.
 *
 * Centralises the escalation rules so call-sites pass context
 * and the policy decides high / medium / low.
 *
 * ─ high  → in-app + email
 * ─ medium → in-app only (default)
 * ─ low   → in-app only
 */

/* ── Severity categories that always escalate ────────────────── */
const HIGH_SEVERITY_CATEGORIES = new Set(['sexual', 'self_harm', 'violence', 'hate_speech'])

/* ── High-impact content surfaces ─────────────────────────────── */
const HIGH_IMPACT_SURFACES = new Set([
  'post', // feed post (public reach)
  'post_comment', // feed comment
  'feed_post', // alias
  'feed_comment', // alias
])

/* ── Repeat-offender thresholds ───────────────────────────────── */
const REPEAT_OFFENDER_STRIKE_THRESHOLD = 2 // ≥ 2 active strikes
const REPEAT_OFFENDER_CASE_THRESHOLD = 3 // ≥ 3 cases in 24 h
const REPEAT_OFFENDER_CASE_WINDOW_MS = 24 * 60 * 60 * 1000

/* ── Plagiarism email threshold ───────────────────────────────── */
const PLAGIARISM_EMAIL_SIMILARITY = 0.95

/**
 * Classify priority for a new moderation case / user report.
 *
 * @param {object} ctx
 * @param {string}  ctx.reasonCategory    – REASON_CATEGORIES value
 * @param {string}  ctx.targetType        – 'sheet' | 'note' | 'post' | 'post_comment' | …
 * @param {boolean} ctx.isPublicTarget    – true if published sheet / shared note
 * @param {number}  ctx.actorActiveStrikes – actor's current active strikes count
 * @param {number}  ctx.actorRecentCases   – actor's cases opened in last 24 h
 * @param {boolean} ctx.autoDetected      – flagged by OpenAI / HTML scanner
 * @param {number}  ctx.htmlRiskTier      – 0-3 (only for HTML sheets)
 * @param {number}  ctx.similarity        – 0-1 (only for plagiarism)
 * @returns {'high'|'medium'|'low'}
 */
function classifyReportPriority(ctx = {}) {
  /* 1. Severity categories that always escalate */
  if (HIGH_SEVERITY_CATEGORIES.has(ctx.reasonCategory)) return 'high'

  /* 2. High-impact surfaces (public-facing) */
  if (HIGH_IMPACT_SURFACES.has(ctx.targetType)) return 'high'
  if (ctx.isPublicTarget && (ctx.targetType === 'sheet' || ctx.targetType === 'note')) return 'high'

  /* 3. Repeat-offender signals */
  if (ctx.actorActiveStrikes >= REPEAT_OFFENDER_STRIKE_THRESHOLD) return 'high'
  if (ctx.actorRecentCases >= REPEAT_OFFENDER_CASE_THRESHOLD) return 'high'

  /* 4. System confidence (auto-detection with strong signal) */
  if (ctx.autoDetected && ctx.htmlRiskTier >= 2) return 'high'

  /* 5. Plagiarism — only email when ≥ 95% similarity AND public target */
  if (ctx.reasonCategory === 'plagiarism') {
    if (ctx.similarity >= PLAGIARISM_EMAIL_SIMILARITY && ctx.isPublicTarget) return 'high'
    return 'medium'
  }

  return 'medium'
}

/**
 * Classify priority for an appeal.
 * Appeals are always at least 'high'; compromised-account appeals are critical.
 *
 * @param {object} ctx
 * @param {string} ctx.reasonCategory – APPEAL_REASON_CATEGORIES value
 * @returns {'high'}
 */
function classifyAppealPriority(_ctx = {}) {
  // All appeals are high (admin needs to act)
  // 'not_me' (compromised account) could be upgraded further if we add 'critical'
  return 'high'
}

/**
 * Classify priority for enforcement actions (admin reviewing a case).
 *
 * @param {object} ctx
 * @param {string}  ctx.action           – 'confirm' | 'dismiss' | 'approve_appeal' | 'reject_appeal'
 * @param {boolean} ctx.triggeredRestriction – true if action caused user restriction
 * @returns {'high'|'medium'}
 */
function classifyEnforcementPriority(ctx = {}) {
  /* Case confirmation that triggers restriction → high */
  if (ctx.action === 'confirm' && ctx.triggeredRestriction) return 'high'

  /* Everything else (dismiss, approve/reject appeal, lift restriction) → medium */
  return 'medium'
}

module.exports = {
  classifyReportPriority,
  classifyAppealPriority,
  classifyEnforcementPriority,
  HIGH_SEVERITY_CATEGORIES,
  HIGH_IMPACT_SURFACES,
  REPEAT_OFFENDER_STRIKE_THRESHOLD,
  REPEAT_OFFENDER_CASE_THRESHOLD,
  REPEAT_OFFENDER_CASE_WINDOW_MS,
  PLAGIARISM_EMAIL_SIMILARITY,
}

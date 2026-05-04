/**
 * notificationIcons.js — type-to-icon and type-to-accent mapping for in-app
 * notifications. Keeps the dropdown and full-page view scannable: each row
 * shows a type-coloured glyph aligned to the message text, instead of every
 * row looking identical.
 *
 * Accent uses CSS tokens so the same mapping works in both light and dark mode
 * without hand-keeping two palettes in sync.
 */

const FA_BY_TYPE = {
  // Social
  follow: 'fas fa-user-plus',
  follow_request: 'fas fa-user-clock',
  follow_accepted: 'fas fa-user-check',
  star: 'fas fa-star',
  fork: 'fas fa-code-branch',

  // Content
  comment: 'fas fa-comment',
  reply: 'fas fa-reply',
  contribution: 'fas fa-code-merge',
  contribution_comment: 'fas fa-comments',
  upstream_change: 'fas fa-arrow-trend-up',
  mention: 'fas fa-at',

  // Study groups
  group_join: 'fas fa-users',
  group_join_request: 'fas fa-user-clock',
  group_approved: 'fas fa-circle-check',
  group_invite: 'fas fa-envelope-open',
  group_post: 'fas fa-message',
  group_reply: 'fas fa-reply',
  group_post_pinned: 'fas fa-thumbtack',
  group_post_approved: 'fas fa-circle-check',
  group_post_rejected: 'fas fa-circle-xmark',
  group_session: 'fas fa-calendar-day',
  group_reported: 'fas fa-flag',
  group_moderation_action: 'fas fa-gavel',
  group_auto_locked: 'fas fa-lock',
  group_removed: 'fas fa-user-minus',

  // Sheets
  sheet_approved: 'fas fa-circle-check',
  sheet_rejected: 'fas fa-circle-xmark',
  upload_quota_reached: 'fas fa-bolt',

  // Hub AI
  ai_quota_reached: 'fas fa-bolt',

  // System / safety
  moderation: 'fas fa-shield-halved',
  legal_acceptance_required: 'fas fa-file-signature',
  payment_failed: 'fas fa-credit-card',
  subscription_canceled: 'fas fa-circle-xmark',
  subscription_will_cancel: 'fas fa-clock',
  video_copy_detected: 'fas fa-circle-exclamation',
  plagiarism_flagged: 'fas fa-magnifying-glass',
  announcement: 'fas fa-bullhorn',
  achievement_unlock: 'fas fa-medal',
}

const TONE_BY_TYPE = {
  follow: 'info',
  follow_request: 'info',
  follow_accepted: 'success',
  star: 'warn',
  fork: 'info',

  comment: 'info',
  reply: 'info',
  contribution: 'success',
  contribution_comment: 'info',
  upstream_change: 'info',
  mention: 'info',

  group_join: 'info',
  group_join_request: 'info',
  group_approved: 'success',
  group_invite: 'info',
  group_post: 'info',
  group_reply: 'info',
  group_post_pinned: 'success',
  group_post_approved: 'success',
  group_post_rejected: 'warn',
  group_session: 'info',
  group_reported: 'warn',
  group_moderation_action: 'warn',
  group_auto_locked: 'warn',
  group_removed: 'warn',

  sheet_approved: 'success',
  sheet_rejected: 'warn',
  upload_quota_reached: 'warn',

  ai_quota_reached: 'warn',

  moderation: 'warn',
  legal_acceptance_required: 'warn',
  payment_failed: 'danger',
  subscription_canceled: 'warn',
  subscription_will_cancel: 'warn',
  video_copy_detected: 'warn',
  plagiarism_flagged: 'warn',
  announcement: 'info',
  achievement_unlock: 'success',
}

const TONE_TO_TOKEN = {
  info: { bg: 'var(--sh-info-bg)', fg: 'var(--sh-info-text)' },
  success: { bg: 'var(--sh-success-bg)', fg: 'var(--sh-success-text)' },
  warn: { bg: 'var(--sh-warning-bg)', fg: 'var(--sh-warning-text)' },
  danger: { bg: 'var(--sh-danger-bg)', fg: 'var(--sh-danger-text)' },
}

export function getNotificationIcon(type) {
  return FA_BY_TYPE[type] || 'fas fa-bell'
}

export function getNotificationTone(type, priority) {
  if (priority === 'high') return TONE_TO_TOKEN.danger
  return TONE_TO_TOKEN[TONE_BY_TYPE[type] || 'info']
}

export const NOTIFICATION_TYPE_GROUPS = {
  social: ['follow', 'follow_request', 'follow_accepted', 'star', 'fork'],
  content: [
    'comment',
    'reply',
    'contribution',
    'contribution_comment',
    'upstream_change',
    'mention',
  ],
  groups: [
    'group_join',
    'group_join_request',
    'group_approved',
    'group_invite',
    'group_post',
    'group_reply',
    'group_post_pinned',
    'group_post_approved',
    'group_post_rejected',
    'group_session',
    'group_reported',
    'group_moderation_action',
    'group_auto_locked',
    'group_removed',
  ],
  sheets: ['sheet_approved', 'sheet_rejected', 'upload_quota_reached'],
  ai: ['ai_quota_reached'],
  system: [
    'moderation',
    'legal_acceptance_required',
    'payment_failed',
    'subscription_canceled',
    'subscription_will_cancel',
    'video_copy_detected',
    'plagiarism_flagged',
    'announcement',
    'achievement_unlock',
  ],
}

export const NOTIFICATION_GROUP_LABELS = {
  social: 'Social',
  content: 'Content & comments',
  groups: 'Study groups',
  sheets: 'Sheets',
  ai: 'Hub AI',
  system: 'System & safety',
}

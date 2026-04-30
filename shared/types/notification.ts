/**
 * Shared Notification API contract.
 *
 * Imported by both the backend (when emitting `notification:new` socket events
 * and serializing GET /api/notifications responses) and the frontend (when
 * rendering the navbar dropdown and /notifications page).
 *
 * Pure type declarations only — no runtime code.
 */

export type NotificationPriority = 'low' | 'medium' | 'high'

/**
 * Canonical notification types. Keep this list in sync with the strings the
 * backend writes to `Notification.type` and the icon mapping in
 * `frontend/studyhub-app/src/lib/notificationIcons.js`. New types must be added
 * here first, then the icon and tone mappings updated, then producer code.
 */
export type NotificationType =
  // Social
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'star'
  | 'fork'
  // Content
  | 'comment'
  | 'reply'
  | 'contribution'
  | 'contribution_comment'
  | 'upstream_change'
  | 'mention'
  // Study groups
  | 'group_join'
  | 'group_join_request'
  | 'group_approved'
  | 'group_invite'
  | 'group_post'
  | 'group_session'
  | 'group_reported'
  | 'group_moderation_action'
  | 'group_auto_locked'
  // System / safety
  | 'moderation'
  | 'legal_acceptance_required'
  | 'payment_failed'
  | 'video_copy_detected'
  | 'plagiarism_flagged'
  | 'announcement'
  | 'achievement_unlocked'

export interface NotificationActor {
  id: number
  username: string
  avatarUrl: string | null
}

/** Shape returned by GET /api/notifications and emitted on `notification:new`. */
export interface NotificationDTO {
  id: number
  userId: number
  type: NotificationType
  message: string
  priority: NotificationPriority
  read: boolean
  linkPath: string | null
  sheetId: number | null
  actorId: number | null
  actor?: NotificationActor | null
  createdAt: string
}

export interface NotificationListResponse {
  notifications: NotificationDTO[]
  unreadCount: number
}

/** Payload pushed via Socket.io on the `notification:new` event. Shape matches
 *  NotificationDTO so consumers can treat the two interchangeably. */
export type NotificationPushPayload = NotificationDTO

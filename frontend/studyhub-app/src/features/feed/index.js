/* ═══════════════════════════════════════════════════════════════════════════
 * features/feed — barrel re-exports for the Feed feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/feed/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hook
export { useFeedData } from '../../pages/feed/useFeedData'

// Constants
export {
  FONT, FILTERS, COMPOSER_PROMPTS,
  authHeaders, timeAgo, courseColor,
  actionButton, linkButton, pillStyle,
  commentButtonStyle,
} from '../../pages/feed/feedConstants'

// Helpers
export {
  attachmentPreviewKind, attachmentEndpoints, canUserDeletePost,
} from '../../pages/feed/feedHelpers'

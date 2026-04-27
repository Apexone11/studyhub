/* ═══════════════════════════════════════════════════════════════════════════
 * features/admin — barrel re-exports for the Admin feature
 *
 * Convention: new hooks, helpers, and constants go here.
 * Pages stay in pages/admin/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hook
export { useAdminData } from '../../pages/admin/useAdminData'

// Constants
export {
  FONT,
  PAGE_SIZE,
  TABS,
  authHeaders,
  createPageState,
  createAuditState,
  formatDateTime,
  formatLabel,
  primaryButton,
  primaryButtonLink,
  pillButton,
  pagerButton,
  suppressionStatusPill,
} from '../../pages/admin/adminConstants'

// Sheet review constants
export {
  SUB_TABS,
  statusPill,
  createState as createReviewState,
} from '../../pages/admin/sheetReview/sheetReviewConstants'

// Moderation helpers
export {
  statusPill as modStatusPill,
  createState as modCreateState,
} from '../../pages/admin/moderation/moderationHelpers'

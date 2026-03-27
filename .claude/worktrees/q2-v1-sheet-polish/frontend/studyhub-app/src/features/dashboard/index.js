/* ═══════════════════════════════════════════════════════════════════════════
 * features/dashboard — barrel re-exports for the Dashboard feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/dashboard/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hook
export { useDashboardData } from '../../pages/dashboard/useDashboardData'

// Constants
export {
  FONT, authHeaders, summaryCard, formatJoinedDate,
} from '../../pages/dashboard/dashboardConstants'

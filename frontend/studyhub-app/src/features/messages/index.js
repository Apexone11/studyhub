/* ═══════════════════════════════════════════════════════════════════════════
 * features/messages — barrel re-exports for the Messages feature
 *
 * Convention: new hooks, helpers, and constants go here.
 * Pages stay in pages/messages/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hooks
export { useMessagingData } from '../../pages/messages/useMessagingData'

// Pages
export { default as MessagesPage } from '../../pages/messages/MessagesPage'

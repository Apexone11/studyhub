/* ═══════════════════════════════════════════════════════════════════════════
 * features/users — barrel re-exports for the Users / Profile feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/profile/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Constants
export {
  FONT, authHeaders, fmtDate,
  pageWrapStyle, containerStyle, cardStyle,
  sectionHeadingStyle, pillStyle,
} from '../../pages/profile/profileConstants'

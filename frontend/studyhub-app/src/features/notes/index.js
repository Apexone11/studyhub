/* ═══════════════════════════════════════════════════════════════════════════
 * features/notes — barrel re-exports for the Notes feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/notes/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hook
export { useNotesData } from '../../pages/notes/useNotesData'

// Constants & components
export {
  TOOLBAR_ACTIONS, applyToolbarAction, MarkdownPreview, wordCount,
} from '../../pages/notes/notesConstants'

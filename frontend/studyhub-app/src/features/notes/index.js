/* ═══════════════════════════════════════════════════════════════════════════
 * features/notes — barrel re-exports for the Notes feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/notes/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hooks
export { useNotesData } from '../../pages/notes/useNotesData'
export { useNoteViewer } from '../../pages/notes/useNoteViewer'
export { useNoteComments } from '../../pages/notes/useNoteComments'

// Constants & components
export {
  TOOLBAR_ACTIONS,
  applyToolbarAction,
  MarkdownPreview,
  wordCount,
} from '../../pages/notes/notesConstants'

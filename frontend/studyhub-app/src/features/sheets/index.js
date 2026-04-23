/* ═══════════════════════════════════════════════════════════════════════════
 * features/sheets — barrel re-exports for the Sheets feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/sheets/ and import from this barrel.
 * Existing code is re-exported so consumers can migrate incrementally.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Hooks
export { useSheetsData } from '../../pages/sheets/useSheetsData'
export { useSheetViewer } from '../../pages/sheets/viewer/useSheetViewer'
export { useUploadSheet } from '../../pages/sheets/upload/useUploadSheet'
export { useSheetLab } from '../../pages/sheets/lab/useSheetLab'

// Sheets page constants & helpers
export {
  SORT_OPTIONS,
  FORMAT_OPTIONS,
  STATUS_OPTIONS,
  authHeaders as sheetsAuthHeaders,
  timeAgo as sheetsTimeAgo,
  resolveSheetFormat,
  formatBadgeText,
} from '../../pages/sheets/sheetsPageConstants'

// Upload constants & helpers
export {
  FONT,
  ATTACH_ALLOWED_TYPES,
  ATTACH_ALLOWED_EXT,
  ATTACH_MAX_BYTES,
  authHeaders,
  validateAttachment,
  tierLabel,
  tierColor,
  useSafeBlocker,
  MiniPreview,
} from '../../pages/sheets/upload/uploadSheetConstants'

// Sheet viewer constants
export {
  IMAGE_EXTENSIONS,
  attachmentExtension,
  attachmentPreviewKind,
  panelStyle,
  actionButton,
  linkButton,
  errorBanner,
  statusBadge,
} from '../../pages/sheets/viewer/sheetViewerConstants'

// Sheet Lab constants
export {
  authHeaders as labAuthHeaders,
  timeAgo as labTimeAgo,
  truncateChecksum,
} from '../../pages/sheets/lab/sheetLabConstants'

// Upload workflow helpers
export {
  UPLOAD_TUTORIAL_KEY,
  canEditHtmlWorkingCopy,
  canSubmitHtmlReview,
  reduceScanState,
} from '../../pages/sheets/upload/uploadSheetWorkflow'

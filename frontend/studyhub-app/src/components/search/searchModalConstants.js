/* ═══════════════════════════════════════════════════════════════════════════
 * searchModalConstants.js — Constants and styles for SearchModal.
 *
 * The Highlight component lives in searchModalComponents.jsx and is
 * re-exported here for backward-compatible imports.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const DEBOUNCE_MS = 250

// Recent searches are stored in localStorage so the empty state can surface
// the user's last few queries. v1 keeps the format simple (array of strings)
// — bump the suffix if the shape ever needs to change.
export const RECENT_SEARCHES_KEY = 'studyhub.search.recent.v1'
export const RECENT_SEARCHES_MAX = 10
export const RECENT_SEARCHES_DISPLAY = 5

// Tab filter chips. 'all' is the default and shows every section.
// The other keys map 1:1 to the result-bucket names returned by /api/search.
export const SEARCH_TABS = [
  { key: 'all', label: 'All' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'courses', label: 'Courses' },
  { key: 'users', label: 'Users' },
  { key: 'notes', label: 'Notes' },
  { key: 'groups', label: 'Groups' },
]

export const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 500,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 'clamp(80px, 12vh, 160px)',
  },
  modal: {
    background: 'var(--sh-surface, #fff)',
    borderRadius: 16,
    width: 'min(560px, 92vw)',
    maxHeight: '70vh',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 18px',
    borderBottom: '1px solid var(--sh-slate-200, #e2e8f0)',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    fontFamily: 'inherit',
    color: 'var(--sh-text)',
    background: 'transparent',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--sh-slate-400, #94a3b8)',
    display: 'flex',
    alignItems: 'center',
    padding: 2,
  },
  kbd: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--sh-slate-500, #64748b)',
    border: '1px solid var(--sh-slate-200, #e2e8f0)',
    background: 'var(--sh-soft, transparent)',
    borderRadius: 4,
    padding: '2px 6px',
    lineHeight: 1.2,
    fontFamily: 'inherit',
  },
  tabRow: {
    display: 'flex',
    gap: 6,
    padding: '8px 14px',
    borderBottom: '1px solid var(--sh-slate-100, #f1f5f9)',
    overflowX: 'auto',
  },
  tabChip: {
    border: '1px solid var(--sh-slate-200, #e2e8f0)',
    background: 'transparent',
    color: 'var(--sh-slate-600, #475569)',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  },
  tabChipActive: {
    background: 'var(--sh-info-bg, #eff6ff)',
    color: 'var(--sh-brand, #2563eb)',
    borderColor: 'var(--sh-brand, #2563eb)',
  },
  resultsContainer: {
    overflowY: 'auto',
    maxHeight: 'calc(70vh - 60px)',
    padding: '6px 0',
  },
  statusMsg: {
    padding: '24px 18px',
    textAlign: 'center',
    color: 'var(--sh-slate-500, #64748b)',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--sh-slate-500, #64748b)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '10px 18px 4px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  resultItem: {
    padding: '10px 18px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  resultIcon: {
    flexShrink: 0,
    color: 'var(--sh-slate-500, #64748b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'var(--sh-soft, #f8fafc)',
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--sh-text, #0f172a)',
    lineHeight: 1.3,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  resultTitleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  resultMeta: {
    fontSize: 12,
    color: 'var(--sh-slate-500, #64748b)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  typeChip: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--sh-slate-600, #475569)',
    background: 'var(--sh-soft, #f1f5f9)',
    border: '1px solid var(--sh-slate-200, #e2e8f0)',
    borderRadius: 4,
    padding: '1px 6px',
    flexShrink: 0,
  },
  emptyStateWrap: {
    padding: '16px 18px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  emptyStateGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  emptyStateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--sh-slate-500, #64748b)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  emptyStateLinkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--sh-slate-500, #64748b)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontFamily: 'inherit',
  },
  emptyStateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 13,
    color: 'var(--sh-text, #0f172a)',
    transition: 'background 0.1s',
  },
  emptyStateRowActive: {
    background: 'var(--sh-slate-100, #f1f5f9)',
  },
  emptyStateRowIcon: {
    color: 'var(--sh-slate-400, #94a3b8)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  shortcutsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    padding: '8px 0 0',
    borderTop: '1px solid var(--sh-slate-100, #f1f5f9)',
    fontSize: 11,
    color: 'var(--sh-slate-500, #64748b)',
  },
  shortcutItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  noResultsWrap: {
    padding: '24px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
  },
  noResultsTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--sh-text, #0f172a)',
  },
  noResultsHint: {
    fontSize: 12,
    color: 'var(--sh-slate-500, #64748b)',
    lineHeight: 1.5,
    maxWidth: 360,
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 18px',
  },
  skeletonBlock: {
    borderRadius: 6,
  },
}

/* ── Re-export JSX component from searchModalComponents.jsx ────────── */
export { Highlight } from './searchModalComponents.jsx'

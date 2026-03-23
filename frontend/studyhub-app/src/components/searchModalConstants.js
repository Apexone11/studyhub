/* ═══════════════════════════════════════════════════════════════════════════
 * searchModalConstants.js — Constants and styles for SearchModal.
 *
 * The Highlight component lives in searchModalComponents.jsx and is
 * re-exported here for backward-compatible imports.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const DEBOUNCE_MS = 300

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
    background: '#fff',
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
    borderBottom: '1px solid #e2e8f0',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    fontFamily: 'inherit',
    color: '#0f172a',
    background: 'transparent',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    padding: 2,
  },
  kbd: {
    fontSize: 10,
    fontWeight: 600,
    color: '#94a3b8',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    padding: '2px 6px',
    lineHeight: 1.2,
    fontFamily: 'inherit',
  },
  resultsContainer: {
    overflowY: 'auto',
    maxHeight: 'calc(70vh - 60px)',
    padding: '6px 0',
  },
  statusMsg: {
    padding: '24px 18px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
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
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    lineHeight: 1.3,
  },
  resultMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--sh-avatar-bg)',
    border: '1.5px solid var(--sh-brand)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--sh-avatar-text)',
  },
}

/* ── Re-export JSX component from searchModalComponents.jsx ────────── */
export { Highlight } from './searchModalComponents.jsx'

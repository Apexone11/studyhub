/* ═══════════════════════════════════════════════════════════════════════════
 * studyGroupsStyles.js — Shared styles for Study Groups pages
 *
 * Centralized style object used across GroupListView, GroupDetailView,
 * GroupCard, GroupListFilters, and GroupModals.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { PAGE_FONT } from '../shared/pageUtils'

export const styles = {
  page: {
    background: 'var(--sh-page-bg)',
    minHeight: '100vh',
    paddingTop: 'var(--page-gutter)',
    paddingBottom: 'var(--page-gutter)',
  },

  appGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 'var(--page-section-gap)',
  },

  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--page-section-gap)',
  },

  titleCard: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
  },

  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-8)',
    fontFamily: PAGE_FONT,
  },

  title: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
    marginBottom: 'var(--space-2)',
  },

  subtitle: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    margin: 0,
  },

  createBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  filterSection: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    fontFamily: PAGE_FONT,
  },

  searchInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  filterChip: {
    padding: '7px 14px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'all 0.12s',
  },

  filterChipActive: {
    background: 'var(--sh-brand)',
    color: 'white',
    borderColor: 'var(--sh-brand)',
  },

  filterSelect: {
    padding: '7px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    cursor: 'pointer',
  },

  gridSection: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
  },

  gridHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-6)',
    fontFamily: PAGE_FONT,
  },

  gridCount: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-text)',
  },

  clearBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--space-6)',
  },

  card: {
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontFamily: PAGE_FONT,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },

  cardTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
  },

  cardDesc: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    margin: 0,
    lineHeight: 1.5,
    flexGrow: 1,
  },

  cardMeta: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  privacyBadgeSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  memberCountSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  courseTagSmall: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
  },

  cardFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--sh-border)',
    paddingTop: 'var(--space-4)',
    marginTop: 'var(--space-2)',
  },

  joinBtnSmall: {
    padding: '6px 14px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
  },

  joinedLabel: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-success)',
  },

  cardSkeleton: {
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    height: '200px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },

  emptyState: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-16)',
    textAlign: 'center',
    fontFamily: PAGE_FONT,
  },

  emptyStateMessage: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    margin: '0 0 var(--space-6)',
  },

  emptyStateClearBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  /* Detail view styles */
  backLink: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-brand)',
    textDecoration: 'none',
    fontFamily: PAGE_FONT,
    fontWeight: 600,
    display: 'inline-block',
    marginBottom: 'var(--space-6)',
    transition: 'opacity 0.12s',
  },

  detailHeader: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--card-pad)',
    boxShadow: 'var(--elevation-1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-8)',
    fontFamily: PAGE_FONT,
  },

  detailTitle: {
    fontSize: 'var(--type-xl)',
    fontWeight: 700,
    color: 'var(--sh-heading)',
    margin: 0,
    marginBottom: 'var(--space-3)',
  },

  detailDesc: {
    fontSize: 'var(--type-base)',
    color: 'var(--sh-subtext)',
    margin: '0 0 var(--space-4)',
    lineHeight: 1.6,
  },

  detailMeta: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  privacyBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  memberBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  courseBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
  },

  actionButtons: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexDirection: 'column',
  },

  joinBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  editBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
  },

  deleteBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-danger-border)',
    background: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
    whiteSpace: 'nowrap',
  },

  leaveBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    color: 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
  },

  tabBar: {
    display: 'flex',
    gap: 'var(--space-4)',
    borderBottom: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    padding: '0 var(--card-pad)',
    fontFamily: PAGE_FONT,
  },

  tabButton: {
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    borderBottom: '2px solid transparent',
    transition: 'all 0.12s',
  },

  tabButtonActive: {
    color: 'var(--sh-brand)',
    borderBottomColor: 'var(--sh-brand)',
  },

  tabContent: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--radius-card) var(--radius-card)',
    padding: 'var(--card-pad)',
    fontFamily: PAGE_FONT,
  },

  placeholder: {
    padding: 'var(--space-12)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-base)',
  },

  loadingPlaceholder: {
    padding: 'var(--space-12)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-base)',
    fontFamily: PAGE_FONT,
  },

  alert: (type) => {
    const typeStyles = {
      danger: {
        background: 'var(--sh-danger-bg)',
        border: '1px solid var(--sh-danger-border)',
        color: 'var(--sh-danger-text)',
      },
      success: {
        background: 'var(--sh-success-bg)',
        border: '1px solid var(--sh-success-border)',
        color: 'var(--sh-success-text)',
      },
    }
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-4) var(--space-6)',
      borderRadius: 'var(--radius-control)',
      fontSize: 'var(--type-sm)',
      fontWeight: 600,
      fontFamily: PAGE_FONT,
      ...typeStyles[type],
    }
  },

  /* Modal styles */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--sh-modal-overlay)',
    backdropFilter: 'blur(4px)',
    zIndex: 550,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: PAGE_FONT,
  },

  modal: {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid var(--sh-border)',
    padding: 'clamp(20px, 3vw, 28px)',
    width: 'min(500px, 92vw)',
    boxShadow: 'var(--elevation-4)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },

  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    lineHeight: 1.3,
    marginBottom: 'var(--space-6)',
  },

  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 'var(--space-6)',
  },

  label: {
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
  },

  textarea: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 80,
  },

  charCount: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
    marginTop: 'var(--space-2)',
    textAlign: 'right',
  },

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-6)',
  },

  cancelBtn: {
    padding: '9px 18px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'background 0.12s',
  },

  submitBtn: {
    padding: '9px 18px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'white',
    fontSize: 'var(--type-sm)',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: PAGE_FONT,
    transition: 'opacity 0.12s',
  },
}

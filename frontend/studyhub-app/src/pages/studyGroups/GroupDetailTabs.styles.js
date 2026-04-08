import { PAGE_FONT } from '../shared/pageUtils'

export const styles = {
  tabContainer: {
    fontFamily: PAGE_FONT,
    color: 'var(--sh-text)',
  },

  section: {
    padding: 'var(--space-6)',
    marginBottom: 'var(--space-6)',
    backgroundColor: 'var(--sh-surface)',
    border: `1px solid var(--sh-border)`,
    borderRadius: 'var(--radius-card)',
  },

  sectionTitle: {
    fontSize: 'var(--type-lg)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-4)',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-4)',
  },

  statCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    textAlign: 'center',
    border: `1px solid var(--sh-border)`,
  },

  statNumber: {
    fontSize: 'var(--type-lg)',
    fontWeight: 700,
    color: 'var(--sh-brand)',
  },

  statLabel: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    marginTop: 'var(--space-2)',
  },

  emptyState: {
    padding: 'var(--space-8)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
  },

  emptyIcon: {
    fontSize: '2.5rem',
    marginBottom: 'var(--space-4)',
    opacity: 0.5,
  },

  emptyTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    marginBottom: 'var(--space-2)',
    color: 'var(--sh-subtext)',
  },

  emptyText: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-muted)',
  },

  listItem: {
    padding: 'var(--space-4)',
    borderBottom: `1px solid var(--sh-border)`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ':last-child': {
      borderBottom: 'none',
    },
  },

  itemContent: {
    flex: 1,
  },

  itemTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 500,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-2)',
  },

  itemMeta: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    display: 'flex',
    gap: 'var(--space-4)',
    alignItems: 'center',
  },

  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--type-xs)',
    fontWeight: 500,
    backgroundColor: 'var(--sh-pill-bg)',
    color: 'var(--sh-pill-text)',
  },

  badgeGreen: {
    backgroundColor: 'var(--sh-success-bg)',
    color: 'var(--sh-success-text)',
  },

  badgeOrange: {
    backgroundColor: 'var(--sh-warning-bg)',
    color: 'var(--sh-warning-text)',
  },

  badgeRed: {
    backgroundColor: 'var(--sh-danger-bg)',
    color: 'var(--sh-danger-text)',
  },

  button: {
    padding: '0.5rem 1rem',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: PAGE_FONT,
  },

  buttonPrimary: {
    backgroundColor: 'var(--sh-brand)',
    color: 'white',
    ':hover': {
      backgroundColor: 'var(--sh-brand-hover)',
    },
  },

  buttonSecondary: {
    backgroundColor: 'transparent',
    color: 'var(--sh-brand)',
    border: `1px solid var(--sh-brand)`,
    ':hover': {
      backgroundColor: 'var(--sh-brand-soft)',
    },
  },

  buttonSmall: {
    padding: '0.375rem 0.75rem',
    fontSize: 'var(--type-xs)',
  },

  buttonDanger: {
    backgroundColor: 'var(--sh-danger)',
    color: 'white',
    ':hover': {
      opacity: 0.9,
    },
  },

  actionButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--sh-modal-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  modalContent: {
    backgroundColor: 'var(--sh-surface)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: 'var(--elevation-3)',
  },

  formGroup: {
    marginBottom: 'var(--space-4)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  textarea: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    minHeight: '100px',
    resize: 'vertical',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  select: {
    width: '100%',
    padding: '0.625rem',
    border: `1px solid var(--sh-input-border)`,
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--type-sm)',
    fontFamily: PAGE_FONT,
    color: 'var(--sh-input-text)',
    backgroundColor: 'var(--sh-input-bg)',
    cursor: 'pointer',
    ':focus': {
      outline: 'none',
      borderColor: 'var(--sh-input-focus)',
      boxShadow: 'var(--sh-input-focus-ring)',
    },
  },

  formActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'flex-end',
    marginTop: 'var(--space-6)',
  },

  recentActivityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  activityItem: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    fontSize: 'var(--type-sm)',
  },

  activityTime: {
    color: 'var(--sh-muted)',
    fontSize: 'var(--type-xs)',
    marginTop: 'var(--space-1)',
  },

  memberGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 'var(--space-4)',
  },

  memberCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    textAlign: 'center',
  },

  memberAvatar: {
    width: '3rem',
    height: '3rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--sh-avatar-bg)',
    color: 'var(--sh-avatar-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    margin: '0 auto var(--space-2) auto',
  },

  memberName: {
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-1)',
    wordBreak: 'break-word',
  },

  sessionCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    marginBottom: 'var(--space-3)',
  },

  sessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: 'var(--space-3)',
  },

  sessionTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },

  sessionDetails: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-subtext)',
    marginTop: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  discussionPost: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
    border: `1px solid var(--sh-border)`,
    marginBottom: 'var(--space-3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: 'var(--sh-surface)',
      borderColor: 'var(--sh-brand)',
    },
  },

  discussionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: 'var(--space-2)',
  },

  discussionTitle: {
    fontSize: 'var(--type-base)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },

  discussionMeta: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
    marginTop: 'var(--space-2)',
  },

  expandedContent: {
    paddingTop: 'var(--space-4)',
    borderTop: `1px solid var(--sh-border)`,
    marginTop: 'var(--space-4)',
  },

  repliesList: {
    marginTop: 'var(--space-4)',
    paddingLeft: 'var(--space-4)',
    borderLeft: `2px solid var(--sh-border)`,
  },

  reply: {
    marginBottom: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--sh-soft)',
    borderRadius: 'var(--radius)',
  },

  replyAuthor: {
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-heading)',
    marginBottom: 'var(--space-1)',
  },

  replyContent: {
    fontSize: 'var(--type-sm)',
    color: 'var(--sh-text)',
    marginBottom: 'var(--space-2)',
  },

  replyTime: {
    fontSize: 'var(--type-xs)',
    color: 'var(--sh-muted)',
  },

  filterTabs: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    borderBottom: `1px solid var(--sh-border)`,
    paddingBottom: 'var(--space-3)',
  },

  filterTab: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--sh-subtext)',
    cursor: 'pointer',
    fontSize: 'var(--type-sm)',
    fontWeight: 500,
    fontFamily: PAGE_FONT,
    transition: 'all 0.2s ease',
  },

  filterTabActive: {
    color: 'var(--sh-brand)',
    borderColor: 'var(--sh-brand)',
  },

  loading: {
    padding: 'var(--space-6)',
    textAlign: 'center',
    color: 'var(--sh-muted)',
  },

  error: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--sh-danger-bg)',
    borderRadius: 'var(--radius)',
    color: 'var(--sh-danger-text)',
    fontSize: 'var(--type-sm)',
    marginBottom: 'var(--space-4)',
  },
}

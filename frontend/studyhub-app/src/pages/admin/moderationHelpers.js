export const SUB_TABS = [
  ['overview', 'Overview'],
  ['cases', 'Cases'],
  ['strikes', 'Strikes'],
  ['appeals', 'Appeals'],
  ['restrictions', 'Restrictions'],
]

export function statusPill(status) {
  const map = {
    pending:   { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
    dismissed: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    confirmed: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    approved:  { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', border: 'var(--sh-success-border)' },
    rejected:  { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    active:    { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    lifted:    { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    expired:   { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    decayed:   { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
  }
  const s = map[status] || map.pending
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${s.border}`,
    background: s.bg,
    color: s.color,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'capitalize',
  }
}

export function createState() {
  return { loading: false, loaded: false, error: '', page: 1, total: 0, items: [] }
}

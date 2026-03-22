export const SUB_TABS = [
  ['cases', 'Cases'],
  ['strikes', 'Strikes'],
  ['appeals', 'Appeals'],
  ['restrictions', 'Restrictions'],
]

export function statusPill(status) {
  const map = {
    pending:   { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    dismissed: { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    confirmed: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    approved:  { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    rejected:  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    active:    { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    lifted:    { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    expired:   { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    decayed:   { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
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

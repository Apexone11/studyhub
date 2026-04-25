import './admin-primitives.css'

const STATUS_MAP = {
  pending: 'pending',
  confirmed: 'confirmed',
  dismissed: 'dismissed',
  reversed: 'reversed',
  approved: 'approved',
  rejected: 'rejected',
  active: 'active',
  decayed: 'decayed',
  expired: 'expired',
  lifted: 'lifted',
  clean: 'active-success',
  info: 'info',
}

export default function AdminPill({ status, children }) {
  const variant = STATUS_MAP[status] || 'info'
  return <span className={`admin-pill admin-pill--${variant}`}>{children || status}</span>
}

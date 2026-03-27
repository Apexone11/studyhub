import { AdminCard, AdminTable, AdminPill } from './components'
import { formatDateTime } from './adminConstants'

export default function RestrictionsSubTab({ state, onLift, onPageChange }) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'type', label: 'Type', render: (r) => r.type },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '\u2014' },
    { key: 'status', label: 'Status', render: (r) => {
      const isActive = !r.endsAt || new Date(r.endsAt) > new Date()
      if (!isActive) return <AdminPill status="lifted">Lifted</AdminPill>
      return <AdminPill status="active">Active</AdminPill>
    }},
    { key: 'endsAt', label: 'Until', render: (r) => r.endsAt ? formatDateTime(r.endsAt) : 'Permanent' },
    { key: 'actions', label: 'Actions', render: (r) => {
      const isActive = !r.endsAt || new Date(r.endsAt) > new Date()
      if (!isActive) return <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Lifted</span>
      return (
        <button className="admin-btn admin-btn--success admin-btn--sm" onClick={() => onLift(r.id)}>Lift</button>
      )
    }},
  ]

  return (
    <AdminCard flush>
      {state.loading ? (
        <div className="admin-loading">Loading restrictions...</div>
      ) : state.error ? (
        <div className="admin-error" style={{ margin: 16 }}>{state.error}</div>
      ) : (
        <>
          <AdminTable columns={columns} rows={state.items} emptyText="No restrictions found." />
          {state.total > 1 && (
            <div className="admin-pager">
              <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page <= 1} onClick={() => onPageChange(state.page - 1)}>Prev</button>
              <span>Page {state.page} of {state.total}</span>
              <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page >= state.total} onClick={() => onPageChange(state.page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </AdminCard>
  )
}

import { AdminCard, AdminTable, AdminPill } from '../components'
import { formatDateTime, formatLabel } from '../adminConstants'

export default function AppealsSubTab({
  state,
  appealStatus,
  onAppealStatusChange,
  onReviewAppeal,
  onPageChange,
}) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'case', label: 'Case', render: (r) => `#${r.caseId}` },
    { key: 'category', label: 'Category', render: (r) => formatLabel(r.reasonCategory, '\u2014') },
    {
      key: 'reason',
      label: 'Reason',
      render: (r) => (
        <span
          style={{
            maxWidth: 220,
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {r.reason}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <AdminPill status={r.status}>{formatLabel(r.status)}</AdminPill>,
    },
    { key: 'createdAt', label: 'Submitted', render: (r) => formatDateTime(r.createdAt) },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => {
        if (r.status !== 'pending')
          return <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Reviewed</span>
        return (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="admin-btn admin-btn--success admin-btn--sm"
              onClick={() => onReviewAppeal(r.id, 'approve')}
            >
              Approve
            </button>
            <button
              className="admin-btn admin-btn--danger admin-btn--sm"
              onClick={() => onReviewAppeal(r.id, 'reject')}
            >
              Reject
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="admin-filters">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            className={`admin-filter-btn ${appealStatus === s ? 'admin-filter-btn--active' : ''}`}
            onClick={() => onAppealStatusChange(s)}
          >
            {formatLabel(s)}
          </button>
        ))}
      </div>

      <AdminCard flush>
        {state.loading ? (
          <div className="admin-loading">Loading appeals...</div>
        ) : state.error ? (
          <div className="admin-error" style={{ margin: 16 }}>
            {state.error}
          </div>
        ) : (
          <>
            <AdminTable columns={columns} rows={state.items} emptyText="No appeals found." />
            {state.total > 1 && (
              <div className="admin-pager">
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={state.page <= 1}
                  onClick={() => onPageChange(state.page - 1)}
                >
                  Prev
                </button>
                <span>
                  Page {state.page} of {state.total}
                </span>
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={state.page >= state.total}
                  onClick={() => onPageChange(state.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </AdminCard>
    </div>
  )
}

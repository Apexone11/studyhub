import { AdminCard, AdminTable, AdminPill } from '../components'
import UserSearchInput from '../components/UserSearchInput'
import AdminInput from '../components/AdminInput'
import { formatDateTime } from '../adminConstants'

export default function StrikesSubTab({
  state, strikeForm, strikeSaving, strikeError,
  onStrikeFormChange, onSubmitStrike, onPageChange,
}) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'reason', label: 'Reason', render: (r) => (
      <span style={{ maxWidth: 300, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.reason}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <AdminPill status={r.decayedAt ? 'decayed' : 'active'}>
        {r.decayedAt ? 'Decayed' : 'Active'}
      </AdminPill>
    )},
    { key: 'caseId', label: 'Case', render: (r) => r.caseId ? `#${r.caseId}` : '\u2014' },
    { key: 'issuedAt', label: 'Issued', render: (r) => formatDateTime(r.issuedAt) },
    { key: 'expiresAt', label: 'Expires', render: (r) => formatDateTime(r.expiresAt) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AdminCard title="Issue New Strike">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <UserSearchInput
            value={strikeForm._selectedUser || null}
            onChange={(user) => onStrikeFormChange({
              ...strikeForm,
              userId: user ? user.id : '',
              _selectedUser: user,
            })}
          />
          <AdminInput
            label="Reason"
            placeholder="Describe the violation (10-1000 characters)"
            value={strikeForm.reason}
            onChange={(e) => onStrikeFormChange({ ...strikeForm, reason: e.target.value })}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{
              fontSize: 12, color: 'var(--sh-muted)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Case ID will be auto-assigned
            </span>
            <button
              className="admin-btn admin-btn--primary"
              disabled={strikeSaving || !strikeForm.userId || strikeForm.reason.length < 10}
              onClick={onSubmitStrike}
            >
              {strikeSaving ? 'Issuing...' : 'Issue Strike'}
            </button>
          </div>
          {strikeError && <div className="admin-error">{strikeError}</div>}
        </div>
      </AdminCard>

      <AdminCard title="Strike History" flush>
        {state.loading ? (
          <div className="admin-loading">Loading strikes...</div>
        ) : state.error ? (
          <div className="admin-error" style={{ margin: 16 }}>{state.error}</div>
        ) : (
          <>
            <AdminTable columns={columns} rows={state.items} emptyText="No strikes issued yet." />
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
    </div>
  )
}

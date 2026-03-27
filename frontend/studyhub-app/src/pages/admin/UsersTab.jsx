import { API } from '../../config'
import { Pager } from './AdminWidgets'
import { tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'

export default function UsersTab({ usersState, currentUserId, patchRole, deleteUser, loadPagedData }) {
  async function handleTrustLevelChange(userId, trustLevel) {
    try {
      await fetch(`${API}/api/admin/users/${userId}/trust-level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trustLevel }),
      })
      void loadPagedData('users', usersState.page)
    } catch { /* silent */ }
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--sh-muted)', marginBottom: 14 }}>
        {usersState.total} total users
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--sh-soft)' }}>
              {['Username', 'Email', 'Role', 'Trust', 'Sheets', 'Joined', 'Staff Verified', 'Actions'].map((header) => (
                <th key={header} style={tableHeadStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersState.items.length === 0 && (
              <tr><td colSpan={8} className="admin-empty">No users found.</td></tr>
            )}
            {usersState.items.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid var(--sh-border)' }}>
                <td style={tableCellStrong}>{record.username}</td>
                <td style={tableCell}>{record.email || '—'}</td>
                <td style={tableCell}>{record.role}</td>
                <td style={tableCell}>
                  <select
                    value={record.trustLevel || 'new'}
                    onChange={(e) => void handleTrustLevelChange(record.id, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--sh-border)' }}
                  >
                    <option value="new">New</option>
                    <option value="trusted">Trusted</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </td>
                <td style={tableCell}>{record._count?.studySheets ?? 0}</td>
                <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(record.isStaffVerified)}
                    onChange={async () => {
                      try {
                        await fetch(`${API}/api/admin/users/${record.id}/staff-verified`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ isStaffVerified: !record.isStaffVerified }),
                        })
                        loadPagedData('users', usersState.page)
                      } catch { /* swallow */ }
                    }}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--sh-brand)' }}
                  />
                </td>
                <td style={{ ...tableCell, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {record.role === 'student' ? (
                    <button type="button" onClick={() => void patchRole(record.id, 'admin')} style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                      Make admin
                    </button>
                  ) : (
                    <button type="button" onClick={() => void patchRole(record.id, 'student')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                      Revoke admin
                    </button>
                  )}
                  {record.id !== currentUserId ? (
                    <button type="button" onClick={() => void deleteUser(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={usersState.page} total={usersState.total} onChange={(page) => void loadPagedData('users', page)} />
    </>
  )
}

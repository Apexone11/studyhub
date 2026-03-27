import { Pager } from './AdminWidgets'
import { tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'

export default function UsersTab({ usersState, currentUserId, patchRole, deleteUser, loadPagedData }) {
  return (
    <>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
        {usersState.total} total users
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Username', 'Email', 'Role', 'Sheets', 'Joined', 'Actions'].map((header) => (
                <th key={header} style={tableHeadStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersState.items.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">No users found.</td></tr>
            )}
            {usersState.items.map((record) => (
              <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tableCellStrong}>{record.username}</td>
                <td style={tableCell}>{record.email || '—'}</td>
                <td style={tableCell}>{record.role}</td>
                <td style={tableCell}>{record._count?.studySheets ?? 0}</td>
                <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
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

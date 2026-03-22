import { tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

export default function RestrictionsSubTab({
  restrictionsState, loadRestrictions, liftRestriction, formatDateTime,
}) {
  return (
    <>
      {restrictionsState.error ? (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>{restrictionsState.error}</div>
      ) : null}

      {restrictionsState.loading && restrictionsState.items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
      ) : restrictionsState.items.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['ID', 'User', 'Type', 'Reason', 'Status', 'Until', 'Actions'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restrictionsState.items.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tableCellStrong}>{r.id}</td>
                  <td style={tableCell}>{r.user?.username || r.userId || '—'}</td>
                  <td style={tableCell}>{r.type || '—'}</td>
                  <td style={{ ...tableCell, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '—'}</td>
                  <td style={tableCell}>
                    <span style={statusPill(r.liftedAt ? 'lifted' : r.expiresAt && new Date(r.expiresAt) < new Date() ? 'expired' : 'active')}>
                      {r.liftedAt ? 'Lifted' : r.expiresAt && new Date(r.expiresAt) < new Date() ? 'Expired' : 'Active'}
                    </span>
                  </td>
                  <td style={tableCell}>{r.expiresAt ? formatDateTime(r.expiresAt) : 'Permanent'}</td>
                  <td style={tableCell}>
                    {!r.liftedAt ? (
                      <button type="button" onClick={() => liftRestriction(r.id)} style={pillButton('#f0fdf4', '#16a34a', '#bbf7d0')}>Lift</button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Lifted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!restrictionsState.loading && restrictionsState.loaded) ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>No restrictions found.</div>
      ) : null}

      <Pager page={restrictionsState.page} total={restrictionsState.total} onChange={(p) => void loadRestrictions(p)} />
    </>
  )
}

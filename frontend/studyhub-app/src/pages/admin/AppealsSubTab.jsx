import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

export default function AppealsSubTab({
  appealsState, appealStatus, setAppealStatus,
  loadAppeals, reviewAppeal, formatDateTime,
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} type="button" onClick={() => setAppealStatus(s)}
            style={{ padding: '5px 10px', borderRadius: 6, border: appealStatus === s ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: appealStatus === s ? '#dbeafe' : '#fff', color: appealStatus === s ? '#1e40af' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      {appealsState.error ? (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>{appealsState.error}</div>
      ) : null}

      {appealsState.loading && appealsState.items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
      ) : appealsState.items.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['ID', 'User', 'Strike', 'Reason', 'Status', 'Submitted', 'Actions'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appealsState.items.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tableCellStrong}>{a.id}</td>
                  <td style={tableCell}>{a.user?.username || a.userId || '—'}</td>
                  <td style={tableCell}>#{a.strikeId || '—'}</td>
                  <td style={{ ...tableCell, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason || '—'}</td>
                  <td style={tableCell}><span style={statusPill(a.status)}>{a.status}</span></td>
                  <td style={tableCell}>{formatDateTime(a.createdAt)}</td>
                  <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.status === 'pending' ? (
                      <>
                        <button type="button" onClick={() => reviewAppeal(a.id, 'approve')} style={pillButton('#f0fdf4', '#16a34a', '#bbf7d0')}>Approve</button>
                        <button type="button" onClick={() => reviewAppeal(a.id, 'reject')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>Reject</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Reviewed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!appealsState.loading && appealsState.loaded) ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>No {appealStatus} appeals found.</div>
      ) : null}

      <Pager page={appealsState.page} total={appealsState.total} onChange={(p) => void loadAppeals(p)} />
    </>
  )
}

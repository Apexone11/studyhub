import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

const filterBtn = (active) => ({
  padding: '5px 10px',
  borderRadius: 6,
  border: active ? '1px solid var(--sh-brand)' : '1px solid var(--sh-border)',
  background: active ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
  color: active ? 'var(--sh-brand)' : 'var(--sh-muted)',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
  textTransform: 'capitalize',
})

export default function AppealsSubTab({
  appealsState, appealStatus, setAppealStatus,
  loadAppeals, reviewAppeal, formatDateTime,
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} type="button" onClick={() => setAppealStatus(s)} style={filterBtn(appealStatus === s)}>
            {s}
          </button>
        ))}
      </div>

      {appealsState.error ? (
        <div style={{ color: 'var(--sh-danger-text)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>{appealsState.error}</div>
      ) : null}

      {appealsState.loading && appealsState.items.length === 0 ? (
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      ) : appealsState.items.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--sh-soft)' }}>
                {['ID', 'User', 'Case', 'Category', 'Reason', 'Status', 'Submitted', 'Actions'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appealsState.items.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--sh-soft)' }}>
                  <td style={tableCellStrong}>{a.id}</td>
                  <td style={tableCell}>{a.user?.username || a.userId || '—'}</td>
                  <td style={tableCell}>#{a.caseId || '—'}</td>
                  <td style={tableCell}>
                    {a.reasonCategory ? (
                      <span style={{ fontSize: 11, textTransform: 'capitalize', color: 'var(--sh-subtext)' }}>
                        {a.reasonCategory.replace(/_/g, ' ')}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...tableCell, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason || '—'}</td>
                  <td style={tableCell}><span style={statusPill(a.status)}>{a.status}</span></td>
                  <td style={tableCell}>{formatDateTime(a.createdAt)}</td>
                  <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.status === 'pending' ? (
                      <>
                        <button type="button" onClick={() => reviewAppeal(a.id, 'approve')} style={pillButton('var(--sh-success-bg)', 'var(--sh-success-text)', 'var(--sh-success-border)')}>Approve</button>
                        <button type="button" onClick={() => reviewAppeal(a.id, 'reject')} style={pillButton('var(--sh-danger-bg)', 'var(--sh-danger-text)', 'var(--sh-danger-border)')}>Reject</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>Reviewed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!appealsState.loading && appealsState.loaded) ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>No {appealStatus} appeals found.</div>
      ) : null}

      <Pager page={appealsState.page} total={appealsState.total} onChange={(p) => void loadAppeals(p)} />
    </>
  )
}

import { FONT, tableHeadStyle, tableCell, tableCellStrong, inputStyle, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

export default function StrikesSubTab({
  strikesState, strikeForm, setStrikeForm, strikeSaving, strikeError,
  submitStrike, loadStrikes, formatDateTime,
}) {
  return (
    <>
      {/* New Strike Form */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', marginBottom: 18, background: '#f8fafc' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, fontFamily: FONT }}>Issue New Strike</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>User ID</label>
            <input value={strikeForm.userId} onChange={(e) => setStrikeForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="User ID" style={{ ...inputStyle, width: 100 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Reason</label>
            <input value={strikeForm.reason} onChange={(e) => setStrikeForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Reason for strike" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Case ID (optional)</label>
            <input value={strikeForm.caseId} onChange={(e) => setStrikeForm((f) => ({ ...f, caseId: e.target.value }))}
              placeholder="Case ID" style={{ ...inputStyle, width: 100 }} />
          </div>
          <button type="button" onClick={submitStrike} disabled={strikeSaving}
            style={{ ...pillButton('#eff6ff', '#1d4ed8', '#bfdbfe'), opacity: strikeSaving ? 0.5 : 1 }}>
            {strikeSaving ? 'Saving...' : 'Issue Strike'}
          </button>
        </div>
        {strikeError ? <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>{strikeError}</div> : null}
      </div>

      {/* Strikes Table */}
      {strikesState.error ? (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>{strikesState.error}</div>
      ) : null}

      {strikesState.loading && strikesState.items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
      ) : strikesState.items.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['ID', 'User', 'Reason', 'Status', 'Issued', 'Decayed'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikesState.items.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tableCellStrong}>{s.id}</td>
                  <td style={tableCell}>{s.user?.username || s.userId || '—'}</td>
                  <td style={tableCell}>{s.reason || '—'}</td>
                  <td style={tableCell}>
                    <span style={statusPill(s.decayedAt ? 'decayed' : 'active')}>{s.decayedAt ? 'Decayed' : 'Active'}</span>
                  </td>
                  <td style={tableCell}>{formatDateTime(s.createdAt)}</td>
                  <td style={tableCell}>{s.decayedAt ? formatDateTime(s.decayedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!strikesState.loading && strikesState.loaded) ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>No strikes found.</div>
      ) : null}

      <Pager page={strikesState.page} total={strikesState.total} onChange={(p) => void loadStrikes(p)} />
    </>
  )
}

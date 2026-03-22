import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

function renderError(state) {
  if (!state.error) return null
  return (
    <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>
      {state.error}
    </div>
  )
}

function renderLoading(state) {
  if (!state.loading || state.items.length > 0) return null
  return <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
}

function CaseDetail({ expandedCase, expandedCaseLoading, reviewCase, setExpandedCase, setSubTab, setStrikeForm, formatDateTime }) {
  if (expandedCaseLoading) return <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>Loading case details...</div>
  if (!expandedCase) return null
  if (expandedCase._error) {
    return <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2', fontSize: 13, color: '#b91c1c' }}>{expandedCase._error}</div>
  }

  const c = expandedCase
  return (
    <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Case #{c.id}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Type: {c.contentType || 'Unknown'} | Content ID: {c.contentId ?? '—'} | Category: {c.category || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={statusPill(c.status)}>{c.status}</span>
          <button type="button" onClick={() => setExpandedCase(null)} style={pillButton('#fff', '#475569', '#cbd5e1')}>Close</button>
        </div>
      </div>

      <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>REPORTED USER</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{c.user?.username || `User #${c.userId}`}</div>
      </div>

      {typeof c.confidence === 'number' ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>CONFIDENCE SCORE</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.confidence >= 0.7 ? '#dc2626' : c.confidence >= 0.4 ? '#f59e0b' : '#059669' }}>{c.confidence.toFixed(2)}</div>
        </div>
      ) : null}

      {c.flaggedText || c.snippet ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>FLAGGED CONTENT</div>
          <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{c.flaggedText || c.snippet || '—'}</div>
        </div>
      ) : null}

      {c.reviewNote ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>REVIEW NOTE</div>
          <div style={{ fontSize: 13, color: '#475569' }}>{c.reviewNote}</div>
          {c.reviewer ? <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Reviewed by {c.reviewer.username}</div> : null}
        </div>
      ) : null}

      {c.strikes && c.strikes.length > 0 ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>LINKED STRIKES ({c.strikes.length})</div>
          {c.strikes.map((s) => (
            <div key={s.id} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Strike #{s.id}: {s.reason || '—'} {s.decayedAt ? '(decayed)' : '(active)'}</div>
          ))}
        </div>
      ) : null}

      {c.appeals && c.appeals.length > 0 ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>LINKED APPEALS ({c.appeals.length})</div>
          {c.appeals.map((a) => (
            <div key={a.id} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Appeal #{a.id}: {a.status} — {a.reason?.slice(0, 100) || '—'}</div>
          ))}
        </div>
      ) : null}

      {c.status === 'pending' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" onClick={() => reviewCase(c.id, 'confirm')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>Confirm Case</button>
          <button type="button" onClick={() => reviewCase(c.id, 'dismiss')} style={pillButton('#f8fafc', '#475569', '#cbd5e1')}>Dismiss Case</button>
          <button type="button" onClick={() => {
            setSubTab('strikes')
            setStrikeForm({ userId: String(c.userId || ''), reason: `Case #${c.id}: `, caseId: String(c.id) })
          }} style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>Issue Strike</button>
        </div>
      ) : null}

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>Created: {formatDateTime(c.createdAt)} | Updated: {formatDateTime(c.updatedAt)}</div>
    </div>
  )
}

export default function CasesSubTab({
  casesState, caseStatus, setCaseStatus, caseSort, setCaseSort,
  expandedCase, setExpandedCase, expandedCaseLoading,
  loadCaseDetail, loadCases, reviewCase,
  setSubTab, setStrikeForm, formatDateTime,
}) {
  const sortedItems = [...casesState.items].sort((a, b) => {
    if (caseSort === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0)
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['pending', 'confirmed', 'dismissed'].map((s) => (
            <button key={s} type="button" onClick={() => setCaseStatus(s)}
              style={{ padding: '5px 10px', borderRadius: 6, border: caseStatus === s ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: caseStatus === s ? '#dbeafe' : '#fff', color: caseStatus === s ? '#1e40af' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
        <select value={caseSort} onChange={(e) => setCaseSort(e.target.value)}
          style={{ borderRadius: 8, border: '1px solid #e2e8f0', padding: '5px 10px', fontSize: 11, color: '#334155', fontFamily: FONT }}>
          <option value="date">Sort by date</option>
          <option value="confidence">Sort by confidence</option>
        </select>
      </div>

      {renderError(casesState)}
      {renderLoading(casesState)}

      {sortedItems.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['ID', 'Type', 'User', 'Score', 'Status', 'Flagged At', 'Actions'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: expandedCase?.id === c.id ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
                  onClick={() => void loadCaseDetail(c.id)}>
                  <td style={tableCellStrong}>{c.id}</td>
                  <td style={tableCell}>{c.contentType || '—'}</td>
                  <td style={tableCell}>{c.user?.username || c.userId || '—'}</td>
                  <td style={tableCell}>{typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '—'}</td>
                  <td style={tableCell}><span style={statusPill(c.status)}>{c.status}</span></td>
                  <td style={tableCell}>{formatDateTime(c.createdAt)}</td>
                  <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    {c.status === 'pending' ? (
                      <>
                        <button type="button" onClick={() => reviewCase(c.id, 'confirm')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>Confirm</button>
                        <button type="button" onClick={() => reviewCase(c.id, 'dismiss')} style={pillButton('#f8fafc', '#475569', '#cbd5e1')}>Dismiss</button>
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
      ) : (!casesState.loading && casesState.loaded) ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>No {caseStatus} cases found.</div>
      ) : null}

      <CaseDetail
        expandedCase={expandedCase} expandedCaseLoading={expandedCaseLoading}
        reviewCase={reviewCase} setExpandedCase={setExpandedCase}
        setSubTab={setSubTab} setStrikeForm={setStrikeForm} formatDateTime={formatDateTime}
      />

      <Pager page={casesState.page} total={casesState.total} onChange={(p) => void loadCases(p)} />
    </>
  )
}

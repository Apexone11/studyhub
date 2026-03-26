import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'

function renderError(state) {
  if (!state.error) return null
  return (
    <div style={{ color: 'var(--sh-danger-text)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>
      {state.error}
    </div>
  )
}

function renderLoading(state) {
  if (!state.loading || state.items.length > 0) return null
  return <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
}

const SOURCE_BADGE = {
  auto: { bg: 'var(--sh-info-bg)', color: 'var(--sh-info-text)', label: 'Auto' },
  user_report: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', label: 'Report' },
}

function sourceBadge(source) {
  const s = SOURCE_BADGE[source] || { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', label: source || '—' }
  return {
    display: 'inline-flex',
    padding: '3px 8px',
    borderRadius: 6,
    background: s.bg,
    color: s.color,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
  }
}

function CaseDetail({
  expandedCase, expandedCaseLoading, reviewCase, setExpandedCase,
  setSubTab, setStrikeForm, formatDateTime, claimCase, unclaimCase,
}) {
  if (expandedCaseLoading) return <div style={{ color: 'var(--sh-muted)', fontSize: 13, marginTop: 12 }}>Loading case details...</div>
  if (!expandedCase) return null
  if (expandedCase._error) {
    return <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--sh-danger-border)', borderRadius: 12, background: 'var(--sh-danger-bg)', fontSize: 13, color: 'var(--sh-danger-text)' }}>{expandedCase._error}</div>
  }

  const c = expandedCase
  return (
    <div style={{ marginTop: 14, border: '1px solid var(--sh-border)', borderRadius: 14, padding: '16px 18px', background: 'var(--sh-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}>Case #{c.id}</div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            Type: {c.contentType || 'Unknown'} | Content ID: {c.contentId ?? '—'} | Category: {c.category || c.reasonCategory || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={sourceBadge(c.source)}>{SOURCE_BADGE[c.source]?.label || c.source}</span>
          <span style={statusPill(c.status)}>{c.status}</span>
          <button type="button" onClick={() => setExpandedCase(null)} style={pillButton('var(--sh-surface)', 'var(--sh-muted)', 'var(--sh-border)')}>Close</button>
        </div>
      </div>

      {/* Reported user */}
      <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
        <div style={metaLabel}>REPORTED USER</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>{c.user?.username || `User #${c.userId}`}</div>
      </div>

      {/* Reporter (user reports) */}
      {c.reporter && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>REPORTED BY</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>{c.reporter.username}</div>
        </div>
      )}

      {/* Claim info */}
      <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
        <div style={metaLabel}>CLAIMED BY</div>
        {c.claimedBy ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>{c.claimedBy.username}</span>
            <button type="button" onClick={() => unclaimCase(c.id)} style={pillButton('var(--sh-surface)', 'var(--sh-muted)', 'var(--sh-border)')}>Release claim</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Unclaimed</span>
            {c.status === 'pending' && (
              <button type="button" onClick={() => claimCase(c.id)} style={pillButton('var(--sh-info-bg)', 'var(--sh-info-text)', 'var(--sh-info-border)')}>Claim case</button>
            )}
          </div>
        )}
      </div>

      {/* Reason category */}
      {c.reasonCategory && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>REASON CATEGORY</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textTransform: 'capitalize' }}>{c.reasonCategory.replace(/_/g, ' ')}</div>
        </div>
      )}

      {typeof c.confidence === 'number' ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>CONFIDENCE SCORE</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.confidence >= 0.7 ? 'var(--sh-danger-text)' : c.confidence >= 0.4 ? 'var(--sh-warning-text)' : 'var(--sh-success-text)' }}>{c.confidence.toFixed(2)}</div>
        </div>
      ) : null}

      {c.excerpt || c.flaggedText || c.snippet ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>FLAGGED CONTENT</div>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{c.excerpt || c.flaggedText || c.snippet || '—'}</div>
        </div>
      ) : null}

      {/* Evidence (report note) */}
      {c.evidence?.reportNote && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>REPORTER NOTE</div>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>{c.evidence.reportNote}</div>
        </div>
      )}

      {c.reviewNote ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>REVIEW NOTE</div>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>{c.reviewNote}</div>
          {c.reviewer ? <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 4 }}>Reviewed by {c.reviewer.username}</div> : null}
        </div>
      ) : null}

      {c.strikes && c.strikes.length > 0 ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>LINKED STRIKES ({c.strikes.length})</div>
          {c.strikes.map((s) => (
            <div key={s.id} style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 4 }}>Strike #{s.id}: {s.reason || '—'} {s.decayedAt ? '(decayed)' : '(active)'}</div>
          ))}
        </div>
      ) : null}

      {c.appeals && c.appeals.length > 0 ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>LINKED APPEALS ({c.appeals.length})</div>
          {c.appeals.map((a) => (
            <div key={a.id} style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 4 }}>Appeal #{a.id}: {a.status} — {a.reason?.slice(0, 100) || '—'}</div>
          ))}
        </div>
      ) : null}

      {c.status === 'pending' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" onClick={() => reviewCase(c.id, 'confirm')} style={pillButton('var(--sh-danger-bg)', 'var(--sh-danger-text)', 'var(--sh-danger-border)')}>Confirm Case</button>
          <button type="button" onClick={() => reviewCase(c.id, 'dismiss')} style={pillButton('var(--sh-surface)', 'var(--sh-muted)', 'var(--sh-border)')}>Dismiss Case</button>
          <button type="button" onClick={() => {
            setSubTab('strikes')
            setStrikeForm({ userId: String(c.userId || ''), reason: `Case #${c.id}: `, caseId: String(c.id) })
          }} style={pillButton('var(--sh-info-bg)', 'var(--sh-info-text)', 'var(--sh-info-border)')}>Issue Strike</button>
        </div>
      ) : null}

      <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 10 }}>Created: {formatDateTime(c.createdAt)} | Updated: {formatDateTime(c.updatedAt)}</div>
    </div>
  )
}

const metaLabel = { fontSize: 12, fontWeight: 700, color: 'var(--sh-muted)', marginBottom: 4 }

const filterBtnStyle = (active) => ({
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

export default function CasesSubTab({
  casesState, caseStatus, setCaseStatus,
  caseSource, setCaseSource, caseClaimed, setCaseClaimed,
  caseSort, setCaseSort,
  expandedCase, setExpandedCase, expandedCaseLoading,
  loadCaseDetail, loadCases, reviewCase,
  claimCase, unclaimCase,
  setSubTab, setStrikeForm, formatDateTime,
}) {
  const sortedItems = [...casesState.items].sort((a, b) => {
    if (caseSort === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0)
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })

  return (
    <>
      {/* Status filter row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['pending', 'confirmed', 'dismissed', 'all'].map((s) => (
            <button key={s} type="button" onClick={() => setCaseStatus(s)} style={filterBtnStyle(caseStatus === s)}>
              {s}
            </button>
          ))}
        </div>
        <select value={caseSort} onChange={(e) => setCaseSort(e.target.value)}
          style={{ borderRadius: 8, border: '1px solid var(--sh-border)', padding: '5px 10px', fontSize: 11, color: 'var(--sh-text)', fontFamily: FONT, background: 'var(--sh-surface)' }}>
          <option value="date">Sort by date</option>
          <option value="confidence">Sort by confidence</option>
        </select>
      </div>

      {/* Source + Claimed filter row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)' }}>Source:</span>
          {[['', 'All'], ['auto', 'Auto'], ['user_report', 'Reports']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => setCaseSource(val)} style={filterBtnStyle(caseSource === val)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)' }}>Claimed:</span>
          {[['', 'All'], ['mine', 'Mine'], ['unclaimed', 'Unclaimed'], ['any', 'Any claimed']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => setCaseClaimed(val)} style={filterBtnStyle(caseClaimed === val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {renderError(casesState)}
      {renderLoading(casesState)}

      {sortedItems.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--sh-soft)' }}>
                {['ID', 'Source', 'Type', 'User', 'Score', 'Status', 'Claimed', 'Date', 'Actions'].map((h) => (
                  <th key={h} style={tableHeadStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--sh-soft)', background: expandedCase?.id === c.id ? 'var(--sh-info-bg)' : 'transparent', cursor: 'pointer' }}
                  onClick={() => void loadCaseDetail(c.id)}>
                  <td style={tableCellStrong}>{c.id}</td>
                  <td style={tableCell}><span style={sourceBadge(c.source)}>{SOURCE_BADGE[c.source]?.label || c.source || '—'}</span></td>
                  <td style={tableCell}>{c.contentType || '—'}</td>
                  <td style={tableCell}>{c.user?.username || c.userId || '—'}</td>
                  <td style={tableCell}>{typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '—'}</td>
                  <td style={tableCell}><span style={statusPill(c.status)}>{c.status}</span></td>
                  <td style={tableCell}>{c.claimedBy?.username || '—'}</td>
                  <td style={tableCell}>{formatDateTime(c.createdAt)}</td>
                  <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    {c.status === 'pending' ? (
                      <>
                        <button type="button" onClick={() => reviewCase(c.id, 'confirm')} style={pillButton('var(--sh-danger-bg)', 'var(--sh-danger-text)', 'var(--sh-danger-border)')}>Confirm</button>
                        <button type="button" onClick={() => reviewCase(c.id, 'dismiss')} style={pillButton('var(--sh-surface)', 'var(--sh-muted)', 'var(--sh-border)')}>Dismiss</button>
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
      ) : (!casesState.loading && casesState.loaded) ? (
        <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>No {caseStatus} cases found.</div>
      ) : null}

      <CaseDetail
        expandedCase={expandedCase} expandedCaseLoading={expandedCaseLoading}
        reviewCase={reviewCase} setExpandedCase={setExpandedCase}
        claimCase={claimCase} unclaimCase={unclaimCase}
        setSubTab={setSubTab} setStrikeForm={setStrikeForm} formatDateTime={formatDateTime}
      />

      <Pager page={casesState.page} total={casesState.total} onChange={(p) => void loadCases(p)} />
    </>
  )
}

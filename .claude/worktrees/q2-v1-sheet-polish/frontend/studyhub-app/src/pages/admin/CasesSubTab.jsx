import { useState } from 'react'
import { FONT, tableHeadStyle, tableCell, tableCellStrong, pillButton } from './adminConstants'
import { Pager } from './AdminWidgets'
import { statusPill } from './moderationHelpers'
import ContentPreviewModal from './components/ContentPreviewModal'
import { ExternalLinkIcon } from './components/icons'

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

const MODERATION_STATUS_PILL = {
  clean: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', label: 'Clean' },
  pending_review: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', label: 'Pending review' },
  confirmed_violation: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', label: 'Confirmed violation' },
  removed_by_moderation: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', label: 'Removed' },
  published: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', label: 'Published' },
}

function modStatusPill(status) {
  const s = MODERATION_STATUS_PILL[status] || { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
      {s.label}
    </span>
  )
}

function ContentPreview({ preview, loading, formatDateTime }) {
  if (loading) return <div style={{ fontSize: 12, color: 'var(--sh-muted)', padding: '8px 0' }}>Loading content preview...</div>
  if (!preview) return null

  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--sh-warning-border)', borderRadius: 10, background: 'var(--sh-surface)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--sh-border)', background: 'var(--sh-warning-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-warning-text)' }}>REPORTED CONTENT</span>
          {preview.moderationStatus && modStatusPill(preview.moderationStatus)}
        </div>
        {preview.linkPath && (
          <a href={preview.linkPath} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'var(--sh-info-bg)', color: 'var(--sh-info-text)', fontSize: 11, fontWeight: 700, textDecoration: 'none', border: '1px solid var(--sh-info-border)' }}>
            View content ↗
          </a>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        {/* Owner + timestamp */}
        {(preview.owner || preview.createdAt) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, color: 'var(--sh-muted)' }}>
            {preview.owner && <span>By <strong style={{ color: 'var(--sh-heading)' }}>{preview.owner.username}</strong></span>}
            {preview.createdAt && <span>{formatDateTime(preview.createdAt)}</span>}
          </div>
        )}
        {/* Title */}
        {preview.title && (
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 6 }}>{preview.title}</div>
        )}
        {/* Text content */}
        {preview.text && (
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', padding: '8px 10px', background: 'var(--sh-soft)', borderRadius: 8, border: '1px solid var(--sh-border)' }}>
            {preview.text}
          </div>
        )}
        {/* Attachments */}
        {preview.attachments && preview.attachments.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', marginBottom: 4 }}>ATTACHMENTS</div>
            {preview.attachments.map((att, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--sh-soft)', borderRadius: 6, border: '1px solid var(--sh-border)', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--sh-subtext)', flex: 1 }}>{att.name} <span style={{ color: 'var(--sh-muted)' }}>({att.type})</span></span>
                <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--sh-info-text)', fontWeight: 700, textDecoration: 'none' }}>Preview</a>
                <a href={att.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--sh-info-text)', fontWeight: 700, textDecoration: 'none' }}>Download</a>
              </div>
            ))}
          </div>
        )}
        {!preview.text && !preview.title && (
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontStyle: 'italic' }}>Content may have been deleted.</div>
        )}
      </div>
    </div>
  )
}

function similarityColor(score) {
  if (score >= 0.85) return 'var(--sh-danger-text)'
  if (score >= 0.70) return 'var(--sh-warning-text)'
  return 'var(--sh-muted)'
}

function PlagiarismPanel({ caseId, contentType, apiJson, formatDateTime }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null) // match id for side-by-side

  const canCheck = contentType === 'sheet' || contentType === 'note'

  async function loadMatches() {
    setLoading(true)
    setError('')
    try {
      const result = await apiJson(`/api/admin/moderation/cases/${caseId}/plagiarism`)
      setData(result)
    } catch (err) {
      setError(err.message || 'Could not load plagiarism data.')
    } finally {
      setLoading(false)
    }
  }

  if (!canCheck) return null

  if (!data && !loading) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={loadMatches} style={pillButton('var(--sh-warning-bg)', 'var(--sh-warning-text)', 'var(--sh-warning-border)')}>
          Check for plagiarism
        </button>
      </div>
    )
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 12 }}>Scanning for similar content...</div>
  if (error) return <div style={{ fontSize: 12, color: 'var(--sh-danger-text)', marginBottom: 12 }}>{error}</div>
  if (!data) return null

  const { reported, matches } = data

  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--sh-warning-border)', borderRadius: 10, background: 'var(--sh-surface)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: 'var(--sh-warning-bg)', borderBottom: '1px solid var(--sh-warning-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-warning-text)' }}>
          PLAGIARISM CHECK — {matches.length} {matches.length === 1 ? 'match' : 'matches'} found
        </span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {matches.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>No similar content found in the database.</div>
        )}
        {matches.map((m) => {
          const isExpanded = expanded === `${m.type}-${m.id}`
          return (
            <div key={`${m.type}-${m.id}`} style={{ marginBottom: 8, border: '1px solid var(--sh-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--sh-soft)', cursor: 'pointer', flexWrap: 'wrap' }}
                onClick={() => setExpanded(isExpanded ? null : `${m.type}-${m.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-heading)' }}>
                    {m.type === 'sheet' ? 'Sheet' : 'Note'} #{m.id}
                  </span>
                  {m.title && <span style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>{m.title.length > 50 ? m.title.slice(0, 50) + '...' : m.title}</span>}
                  <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>by {m.authorUsername}</span>
                  {m.isExactMatch && (
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', fontSize: 10, fontWeight: 700 }}>EXACT COPY</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: similarityColor(m.similarity) }}>
                    {Math.round(m.similarity * 100)}%
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{formatDateTime(m.createdAt)}</span>
                  <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sh-border)' }}>
                  <div style={{ padding: '8px 10px', background: 'var(--sh-surface)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-danger-text)', marginBottom: 4 }}>REPORTED (by {reported?.author?.username || '?'})</div>
                    <div style={{ fontSize: 11, color: 'var(--sh-subtext)', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', lineHeight: 1.5 }}>
                      {reported?.textPreview || '(no text)'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'var(--sh-surface)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-info-text)', marginBottom: 4 }}>MATCH (by {m.authorUsername})</div>
                    <div style={{ fontSize: 11, color: 'var(--sh-subtext)', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', lineHeight: 1.5 }}>
                      {m.textPreview || '(no text)'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CaseDetail({
  expandedCase, expandedCaseLoading, reviewCase, setExpandedCase,
  casePreview, casePreviewLoading, apiJson,
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
            {(c.contentType || 'Unknown').replace(/_/g, ' ')} #{c.contentId ?? '—'} | Category: {(c.category || c.reasonCategory || '—').replace(/_/g, ' ')}
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

      {/* Inline content preview — fetched from /cases/:id/preview */}
      <ContentPreview preview={casePreview} loading={casePreviewLoading} formatDateTime={formatDateTime} />

      {/* Fallback excerpt if preview didn't load or content was deleted */}
      {!casePreview && !casePreviewLoading && (c.excerpt || c.flaggedText || c.snippet) ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--sh-border)', borderRadius: 10, background: 'var(--sh-surface)' }}>
          <div style={metaLabel}>FLAGGED CONTENT (excerpt)</div>
          <div style={{ fontSize: 13, color: 'var(--sh-subtext)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{c.excerpt || c.flaggedText || c.snippet || '—'}</div>
        </div>
      ) : null}

      {/* Plagiarism check panel (sheets + notes only) */}
      <PlagiarismPanel caseId={c.id} contentType={c.contentType} apiJson={apiJson} formatDateTime={formatDateTime} />

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
            setStrikeForm({ userId: String(c.userId || ''), reason: `Case #${c.id}: `, _selectedUser: null })
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
  loadCases, reviewCase,
  setSubTab, setStrikeForm, formatDateTime,
}) {
  const [modalCaseId, setModalCaseId] = useState(null)

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
                <tr key={c.id} style={{ borderBottom: '1px solid var(--sh-soft)', background: modalCaseId === c.id ? 'var(--sh-info-bg)' : 'transparent', cursor: 'pointer' }}
                  onClick={() => setModalCaseId(c.id)}>
                  <td style={tableCellStrong}>{c.id}</td>
                  <td style={tableCell}><span style={sourceBadge(c.source)}>{SOURCE_BADGE[c.source]?.label || c.source || '—'}</span></td>
                  <td style={tableCell}>{c.contentType || '—'}</td>
                  <td style={tableCell}>{c.user?.username || c.userId || '—'}</td>
                  <td style={tableCell}>{typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '—'}</td>
                  <td style={tableCell}><span style={statusPill(c.status)}>{c.status}</span></td>
                  <td style={tableCell}>{c.claimedBy?.username || '—'}</td>
                  <td style={tableCell}>{formatDateTime(c.createdAt)}</td>
                  <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setModalCaseId(c.id)}
                      style={{ ...pillButton('var(--sh-soft)', 'var(--sh-muted)', 'var(--sh-border)'), display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      title="View case"
                    >
                      <ExternalLinkIcon size={12} /> View
                    </button>
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

      <ContentPreviewModal
        open={!!modalCaseId}
        onClose={() => setModalCaseId(null)}
        caseId={modalCaseId}
        onConfirm={() => { reviewCase(modalCaseId, 'confirm'); setModalCaseId(null) }}
        onDismiss={() => { reviewCase(modalCaseId, 'dismiss'); setModalCaseId(null) }}
        onIssueStrike={() => {
          setSubTab('strikes')
          setStrikeForm({ userId: '', reason: `Case #${modalCaseId}: `, _selectedUser: null })
          setModalCaseId(null)
        }}
      />

      <Pager page={casesState.page} total={casesState.total} onChange={(p) => void loadCases(p)} />
    </>
  )
}

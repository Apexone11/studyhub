/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationTab.jsx — Admin moderation dashboard tab
 *
 * Extracted from AdminPage to keep that file from growing further.
 * Sub-tabs: Cases | Strikes | Appeals | Restrictions
 *
 * Relies on parent-provided helpers (apiJson, setConfirmAction,
 * formatDateTime) so the auth redirect, error handling, and confirm-dialog
 * pattern stay consistent with every other admin tab.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const PAGE_SIZE = 20

/* ── Sub-tab definitions ──────────────────────────────────────────── */
const SUB_TABS = [
  ['cases', 'Cases'],
  ['strikes', 'Strikes'],
  ['appeals', 'Appeals'],
  ['restrictions', 'Restrictions'],
]

/* ── Inline style helpers (mirror AdminPage patterns) ─────────────── */
function pillButton(background, color, borderColor) {
  return {
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${borderColor}`,
    background,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function statusPill(status) {
  const map = {
    pending:   { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    dismissed: { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    confirmed: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    approved:  { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    rejected:  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    active:    { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    lifted:    { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    expired:   { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    decayed:   { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
  }
  const s = map[status] || map.pending
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${s.border}`,
    background: s.bg,
    color: s.color,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'capitalize',
  }
}

const tableHeadStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

const tableCell = {
  padding: '10px 14px',
  color: '#475569',
  verticalAlign: 'top',
}

const tableCellStrong = {
  ...tableCell,
  fontWeight: 700,
  color: '#0f172a',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #dbe1e8',
  fontSize: 13,
  color: '#0f172a',
  fontFamily: FONT,
}

/* ── Small pager (copied from AdminPage) ──────────────────────────── */
function Pager({ page, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE))
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={pagerBtn(page <= 1)}
      >
        Prev
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>Page {page}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        style={pagerBtn(page >= totalPages)}
      >
        Next
      </button>
    </div>
  )
}

function pagerBtn(disabled) {
  return {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: disabled ? '#cbd5e1' : '#475569',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
  }
}

/* ── Helper: default paged state ──────────────────────────────────── */
function createState() {
  return { loading: false, loaded: false, error: '', page: 1, total: 0, items: [] }
}

/* ═════════════════════════════════════════════════════════════════════ */
export default function ModerationTab({ apiJson, setConfirmAction, formatDateTime }) {
  const [subTab, setSubTab] = useState('cases')

  /* Each sub-tab maintains independent pagination state */
  const [casesState, setCasesState] = useState(createState)
  const [strikesState, setStrikesState] = useState(createState)
  const [appealsState, setAppealsState] = useState(createState)
  const [restrictionsState, setRestrictionsState] = useState(createState)

  /* Filter: case status (pending / dismissed / confirmed) */
  const [caseStatus, setCaseStatus] = useState('pending')

  /* Filter: appeal status (pending / approved / rejected) */
  const [appealStatus, setAppealStatus] = useState('pending')

  /* New-strike form state */
  const [strikeForm, setStrikeForm] = useState({ userId: '', reason: '', caseId: '' })
  const [strikeSaving, setStrikeSaving] = useState(false)
  const [strikeError, setStrikeError] = useState('')

  /* ── Loaders ──────────────────────────────────────────────────── */
  const loadCases = useCallback(async (page = 1) => {
    setCasesState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/cases?page=${page}&status=${encodeURIComponent(caseStatus)}`)
      setCasesState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.cases || [] })
    } catch (err) {
      setCasesState((s) => ({ ...s, loading: false, error: err.message || 'Could not load cases.' }))
    }
  }, [apiJson, caseStatus])

  const loadStrikes = useCallback(async (page = 1) => {
    setStrikesState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/strikes?page=${page}`)
      setStrikesState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.strikes || [] })
    } catch (err) {
      setStrikesState((s) => ({ ...s, loading: false, error: err.message || 'Could not load strikes.' }))
    }
  }, [apiJson])

  const loadAppeals = useCallback(async (page = 1) => {
    setAppealsState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/appeals?page=${page}&status=${encodeURIComponent(appealStatus)}`)
      setAppealsState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.appeals || [] })
    } catch (err) {
      setAppealsState((s) => ({ ...s, loading: false, error: err.message || 'Could not load appeals.' }))
    }
  }, [apiJson, appealStatus])

  const loadRestrictions = useCallback(async (page = 1) => {
    setRestrictionsState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/restrictions?page=${page}`)
      setRestrictionsState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.restrictions || [] })
    } catch (err) {
      setRestrictionsState((s) => ({ ...s, loading: false, error: err.message || 'Could not load restrictions.' }))
    }
  }, [apiJson])

  /* Auto-load on sub-tab activation or filter change */
  useEffect(() => {
    if (subTab === 'cases') { void loadCases(1) }
  }, [subTab, loadCases])

  useEffect(() => {
    if (subTab === 'strikes' && !strikesState.loaded && !strikesState.loading) { void loadStrikes(1) }
  }, [subTab, strikesState.loaded, strikesState.loading, loadStrikes])

  useEffect(() => {
    if (subTab === 'appeals') { void loadAppeals(1) }
  }, [subTab, loadAppeals])

  useEffect(() => {
    if (subTab === 'restrictions' && !restrictionsState.loaded && !restrictionsState.loading) { void loadRestrictions(1) }
  }, [subTab, restrictionsState.loaded, restrictionsState.loading, loadRestrictions])

  /* ── Actions ──────────────────────────────────────────────────── */
  function reviewCase(caseId, action) {
    const verb = action === 'dismiss' ? 'Dismiss' : 'Confirm'
    setConfirmAction({
      title: `${verb} this case?`,
      message: action === 'dismiss'
        ? 'The case will be marked as dismissed. No strike will be issued.'
        : 'The case will be confirmed. You can issue a strike separately if needed.',
      variant: action === 'dismiss' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/moderation/cases/${caseId}/review`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        })
        await loadCases(casesState.page)
      },
    })
  }

  async function submitStrike(event) {
    event.preventDefault()
    const userId = Number.parseInt(strikeForm.userId, 10)
    if (!userId || !strikeForm.reason.trim()) {
      setStrikeError('User ID and reason are required.')
      return
    }
    setStrikeSaving(true)
    setStrikeError('')
    try {
      const body = { userId, reason: strikeForm.reason.trim() }
      if (strikeForm.caseId) body.caseId = Number.parseInt(strikeForm.caseId, 10)
      await apiJson('/api/admin/moderation/strikes', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setStrikeForm({ userId: '', reason: '', caseId: '' })
      await loadStrikes(1)
    } catch (err) {
      setStrikeError(err.message || 'Could not issue strike.')
    } finally {
      setStrikeSaving(false)
    }
  }

  function liftRestriction(restrictionId) {
    setConfirmAction({
      title: 'Lift this restriction?',
      message: 'The user will regain full write access immediately.',
      variant: 'default',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/moderation/restrictions/${restrictionId}/lift`, { method: 'PATCH' })
        await loadRestrictions(restrictionsState.page)
      },
    })
  }

  function reviewAppeal(appealId, action) {
    const verb = action === 'approve' ? 'Approve' : 'Reject'
    setConfirmAction({
      title: `${verb} this appeal?`,
      message: action === 'approve'
        ? 'Approving will decay the linked strike, dismiss the case, and may lift any active restriction.'
        : 'The appeal will be marked as rejected.',
      variant: action === 'approve' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/moderation/appeals/${appealId}/review`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        })
        await loadAppeals(appealsState.page)
      },
    })
  }

  /* ── Render helpers ───────────────────────────────────────────── */
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

  /* ── Sub-tab selector (reuses tab button pattern from AdminPage) ─ */
  const subTabSelector = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
      {SUB_TABS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setSubTab(value)}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: subTab === value ? '1px solid #2563eb' : '1px solid #e2e8f0',
            background: subTab === value ? '#eff6ff' : '#fff',
            color: subTab === value ? '#1d4ed8' : '#475569',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  /* ═════════════════ CASES sub-tab ═════════════════════════════════ */
  function renderCases() {
    return (
      <>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['pending', 'confirmed', 'dismissed'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCaseStatus(s)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: caseStatus === s ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                background: caseStatus === s ? '#dbeafe' : '#fff',
                color: caseStatus === s ? '#1e40af' : '#64748b',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {renderError(casesState)}
        {renderLoading(casesState)}

        {casesState.items.length > 0 ? (
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
                {casesState.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tableCellStrong}>{c.id}</td>
                    <td style={tableCell}>{c.contentType || '—'}</td>
                    <td style={tableCell}>{c.user?.username || c.userId || '—'}</td>
                    <td style={tableCell}>{typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '—'}</td>
                    <td style={tableCell}><span style={statusPill(c.status)}>{c.status}</span></td>
                    <td style={tableCell}>{formatDateTime(c.createdAt)}</td>
                    <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.status === 'pending' ? (
                        <>
                          <button type="button" onClick={() => reviewCase(c.id, 'confirm')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                            Confirm
                          </button>
                          <button type="button" onClick={() => reviewCase(c.id, 'dismiss')} style={pillButton('#f8fafc', '#475569', '#cbd5e1')}>
                            Dismiss
                          </button>
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

        <Pager page={casesState.page} total={casesState.total} onChange={(p) => void loadCases(p)} />
      </>
    )
  }

  /* ═════════════════ STRIKES sub-tab ══════════════════════════════ */
  function renderStrikes() {
    return (
      <>
        {/* New strike form */}
        <form onSubmit={submitStrike} style={{ display: 'grid', gap: 10, marginBottom: 20, padding: 16, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Issue New Strike</div>
          <div className="mod-strike-form-grid" style={{ gap: 10 }}>
            <input
              type="number"
              placeholder="User ID"
              value={strikeForm.userId}
              onChange={(e) => setStrikeForm((s) => ({ ...s, userId: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="number"
              placeholder="Case ID (optional)"
              value={strikeForm.caseId}
              onChange={(e) => setStrikeForm((s) => ({ ...s, caseId: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <textarea
            placeholder="Reason for strike (required)"
            value={strikeForm.reason}
            onChange={(e) => setStrikeForm((s) => ({ ...s, reason: e.target.value }))}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          {strikeError ? <div style={{ color: '#b91c1c', fontSize: 12 }}>{strikeError}</div> : null}
          <button type="submit" disabled={strikeSaving} style={{ ...pillButton('#eff6ff', '#1d4ed8', '#bfdbfe'), width: 'fit-content', padding: '8px 16px' }}>
            {strikeSaving ? 'Issuing...' : 'Issue Strike'}
          </button>
        </form>

        {renderError(strikesState)}
        {renderLoading(strikesState)}

        {strikesState.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ID', 'User', 'Reason', 'Expires', 'Status', 'Issued'].map((h) => (
                    <th key={h} style={tableHeadStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strikesState.items.map((s) => {
                  const isActive = !s.decayedAt && (!s.expiresAt || new Date(s.expiresAt) > new Date())
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tableCellStrong}>{s.id}</td>
                      <td style={tableCell}>{s.user?.username || s.userId}</td>
                      <td style={{ ...tableCell, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.reason || '—'}</td>
                      <td style={tableCell}>{formatDateTime(s.expiresAt)}</td>
                      <td style={tableCell}>
                        <span style={statusPill(s.decayedAt ? 'decayed' : isActive ? 'active' : 'expired')}>
                          {s.decayedAt ? 'Decayed' : isActive ? 'Active' : 'Expired'}
                        </span>
                      </td>
                      <td style={tableCell}>{formatDateTime(s.createdAt)}</td>
                    </tr>
                  )
                })}
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

  /* ═════════════════ APPEALS sub-tab ═════════════════════════════ */
  function renderAppeals() {
    return (
      <>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAppealStatus(s)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: appealStatus === s ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                background: appealStatus === s ? '#dbeafe' : '#fff',
                color: appealStatus === s ? '#1e40af' : '#64748b',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {renderError(appealsState)}
        {renderLoading(appealsState)}

        {appealsState.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ID', 'User', 'Case', 'Reason', 'Status', 'Submitted', 'Actions'].map((h) => (
                    <th key={h} style={tableHeadStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appealsState.items.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tableCellStrong}>{a.id}</td>
                    <td style={tableCell}>{a.user?.username || a.userId}</td>
                    <td style={tableCell}>{a.caseId || '—'}</td>
                    <td style={{ ...tableCell, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.reason || '—'}</td>
                    <td style={tableCell}><span style={statusPill(a.status)}>{a.status}</span></td>
                    <td style={tableCell}>{formatDateTime(a.createdAt)}</td>
                    <td style={{ ...tableCell, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.status === 'pending' ? (
                        <>
                          <button type="button" onClick={() => reviewAppeal(a.id, 'approve')} style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}>
                            Approve
                          </button>
                          <button type="button" onClick={() => reviewAppeal(a.id, 'reject')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                            Reject
                          </button>
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

  /* ═════════════════ RESTRICTIONS sub-tab ════════════════════════ */
  function renderRestrictions() {
    return (
      <>
        {renderError(restrictionsState)}
        {renderLoading(restrictionsState)}

        {restrictionsState.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ID', 'User', 'Type', 'Reason', 'Ends At', 'Actions'].map((h) => (
                    <th key={h} style={tableHeadStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restrictionsState.items.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tableCellStrong}>{r.id}</td>
                    <td style={tableCell}>{r.user?.username || r.userId}</td>
                    <td style={tableCell}>{r.type || 'full'}</td>
                    <td style={{ ...tableCell, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason || '—'}</td>
                    <td style={tableCell}>{r.endsAt ? formatDateTime(r.endsAt) : 'Permanent'}</td>
                    <td style={tableCell}>
                      <button type="button" onClick={() => liftRestriction(r.id)} style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}>
                        Lift
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (!restrictionsState.loading && restrictionsState.loaded) ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No active restrictions.</div>
        ) : null}

        <Pager page={restrictionsState.page} total={restrictionsState.total} onChange={(p) => void loadRestrictions(p)} />
      </>
    )
  }

  /* ═════════════════ Main render ═════════════════════════════════ */
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: '22px',
      }}
    >
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#0f172a' }}>Moderation</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
        Content moderation cases, user strikes, appeal reviews, and active restrictions.
      </p>

      {subTabSelector}

      {subTab === 'cases' && renderCases()}
      {subTab === 'strikes' && renderStrikes()}
      {subTab === 'appeals' && renderAppeals()}
      {subTab === 'restrictions' && renderRestrictions()}
    </section>
  )
}

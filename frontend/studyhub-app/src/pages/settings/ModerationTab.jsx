/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationTab.jsx — User-facing moderation status, cases, and appeals
 *
 * Shows the user:
 *   - Restriction status + reason + how to fix
 *   - Their moderation cases (sanitized: no raw scores)
 *   - Their appeals + ability to submit new appeals
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { FONT } from './settingsState'

const SECTION_TABS = ['status', 'cases', 'appeals']
const SECTION_LABELS = { status: 'My Status', cases: 'My Cases', appeals: 'My Appeals' }

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
    confirmed: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    dismissed: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    approved: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', border: 'var(--sh-success-border)' },
    rejected: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--sh-surface)', borderRadius: 14,
      border: '1px solid var(--sh-border)', padding: '20px 22px',
      boxShadow: 'var(--shadow-sm)', ...style,
    }}>
      {children}
    </div>
  )
}

/* ── My Status section ─────────────────────────────────────────── */
function StatusSection({ data }) {
  if (!data) return null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.restricted && data.restriction && (
        <Card style={{ borderColor: 'var(--sh-danger-border)', background: 'var(--sh-danger-bg)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sh-danger-text)', marginBottom: 8 }}>
            Account Restricted
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--sh-danger-text)', lineHeight: 1.6 }}>
            Your account is currently restricted from creating or modifying content.
          </p>
          {data.restriction.reason && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--sh-danger-text)', lineHeight: 1.6 }}>
              <strong>Reason:</strong> {data.restriction.reason}
            </p>
          )}
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--sh-danger-text)', lineHeight: 1.6 }}>
            <strong>Since:</strong> {formatDate(data.restriction.startsAt)}
            {data.restriction.endsAt && <> &middot; <strong>Until:</strong> {formatDate(data.restriction.endsAt)}</>}
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--sh-danger-text)', lineHeight: 1.6 }}>
            <strong>How to resolve:</strong> If you believe this is a mistake, you can appeal any linked strike
            from the &ldquo;My Appeals&rdquo; tab. Appeals are reviewed by our team.
          </p>
        </Card>
      )}

      {!data.restricted && (
        <Card>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sh-success-text)', marginBottom: 4 }}>
            Account in Good Standing
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            No restrictions on your account.
          </p>
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>{data.activeStrikes}</div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>Active Strikes</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>{data.cases?.length || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>Cases</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>{data.appeals?.length || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>Appeals</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── My Cases section ──────────────────────────────────────────── */
function CasesSection({ data }) {
  const cases = data?.cases || []

  if (cases.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>No moderation cases on your account.</p>
      </Card>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cases.map((c) => (
        <Card key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                Case #{c.id}
              </span>
              <StatusPill status={c.status} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{formatDate(c.createdAt)}</span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 6 }}>
            <strong>Type:</strong> {c.contentType?.replace(/_/g, ' ')}
            {c.reasonCategory && <> &middot; <strong>Category:</strong> {c.reasonCategory.replace(/_/g, ' ')}</>}
          </div>

          {c.excerpt && (
            <div style={{
              fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6,
              background: 'var(--sh-soft)', borderRadius: 8, padding: '8px 12px',
              borderLeft: '3px solid var(--sh-warning-border)',
              wordBreak: 'break-word',
            }}>
              {c.excerpt.length > 300 ? c.excerpt.slice(0, 300) + '...' : c.excerpt}
            </div>
          )}

          {c.status === 'confirmed' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sh-danger-text)', lineHeight: 1.6 }}>
              This content was confirmed as a policy violation. If a strike was issued, you may appeal it from the Appeals tab.
            </p>
          )}
          {c.status === 'dismissed' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sh-success-text)', lineHeight: 1.6 }}>
              This case was reviewed and dismissed. No action was taken.
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}

/* ── My Appeals section ────────────────────────────────────────── */
function AppealsSection({ data, onSubmitAppeal }) {
  const appeals = data?.appeals || []
  const strikes = data?.strikes || []
  const activeStrikes = strikes.filter((s) => !s.decayedAt && new Date(s.expiresAt) > new Date())
  const appealableCaseIds = activeStrikes.map((s) => s.caseId).filter(Boolean)

  const [showForm, setShowForm] = useState(false)
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [appealReason, setAppealReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMsg, setFormMsg] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedCaseId || appealReason.trim().length < 20) return
    setSubmitting(true)
    setFormMsg(null)
    const result = await onSubmitAppeal(Number(selectedCaseId), appealReason.trim())
    setSubmitting(false)
    if (result.ok) {
      setFormMsg({ type: 'success', text: 'Appeal submitted successfully.' })
      setAppealReason('')
      setSelectedCaseId('')
      setShowForm(false)
    } else {
      setFormMsg({ type: 'error', text: result.error })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {appealableCaseIds.length > 0 && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            width: 'fit-content', padding: '10px 18px', borderRadius: 10,
            border: 'none', background: 'var(--sh-brand)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          Submit an Appeal
        </button>
      )}

      {formMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: formMsg.type === 'error' ? 'var(--sh-danger-bg)' : 'var(--sh-success-bg)',
          color: formMsg.type === 'error' ? 'var(--sh-danger-text)' : 'var(--sh-success-text)',
          border: `1px solid ${formMsg.type === 'error' ? 'var(--sh-danger-border)' : 'var(--sh-success-border)'}`,
        }}>
          {formMsg.text}
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sh-heading)', marginBottom: 12 }}>
              New Appeal
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sh-subtext)', marginBottom: 6 }}>
              Case to appeal
            </label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--sh-input-border)', background: 'var(--sh-input-bg)',
                color: 'var(--sh-input-text)', fontFamily: FONT, marginBottom: 12,
              }}
            >
              <option value="">Select a case...</option>
              {appealableCaseIds.map((id) => (
                <option key={id} value={id}>Case #{id}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sh-subtext)', marginBottom: 6 }}>
              Why should this be reconsidered? (20-2000 characters)
            </label>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Explain why you believe this action was a mistake..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--sh-input-border)', background: 'var(--sh-input-bg)',
                color: 'var(--sh-input-text)', fontFamily: FONT, resize: 'vertical',
                marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={submitting || !selectedCaseId || appealReason.trim().length < 20}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: 'var(--sh-brand)', color: '#fff', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Appeal'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: '1px solid var(--sh-border)', background: 'var(--sh-surface)',
                  color: 'var(--sh-subtext)', cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {appeals.length === 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>No appeals submitted.</p>
        </Card>
      )}

      {appeals.map((a) => (
        <Card key={a.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                Appeal #{a.id} (Case #{a.caseId})
              </span>
              <StatusPill status={a.status} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{formatDate(a.createdAt)}</span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            {a.reason}
          </p>
          {a.reviewNote && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sh-info-text)', lineHeight: 1.6 }}>
              <strong>Admin response:</strong> {a.reviewNote}
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}

/* ── Main ModerationTab ────────────────────────────────────────── */
export default function ModerationTab() {
  const [section, setSection] = useState('status')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/moderation/my-status`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to load moderation status.')
      const json = await res.json()
      setData(json)
    } catch {
      setError('Could not load moderation status. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmitAppeal(caseId, reason) {
    try {
      const res = await fetch(`${API}/api/moderation/appeals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, reason }),
      })
      const json = await res.json()
      if (!res.ok) return { ok: false, error: json.error || 'Failed to submit appeal.' }
      await loadData()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error. Please try again.' }
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ height: 80, background: 'var(--sh-soft)', borderRadius: 14, marginBottom: 12 }} />
        <div style={{ height: 60, background: 'var(--sh-soft)', borderRadius: 14 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
        background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border)',
      }}>
        {error}
        <button
          type="button"
          onClick={loadData}
          style={{
            marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: 'none',
            background: 'var(--sh-danger)', color: '#fff', fontSize: 12,
            fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>
        Reports &amp; Moderation
      </h2>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {SECTION_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: section === s ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: section === s ? '#fff' : 'var(--sh-subtext)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {section === 'status' && <StatusSection data={data} />}
      {section === 'cases' && <CasesSection data={data} />}
      {section === 'appeals' && <AppealsSection data={data} onSubmitAppeal={handleSubmitAppeal} />}
    </div>
  )
}

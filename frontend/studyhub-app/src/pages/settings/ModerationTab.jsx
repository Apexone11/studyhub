/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationTab.jsx — User-facing moderation status, cases, and appeals
 *
 * Shows the user:
 *   - Restriction status + reason + how to fix
 *   - Their moderation cases with inline appeal button
 *   - Their appeals history with outcomes
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { FONT } from './settingsState'

const SECTION_TABS = ['status', 'cases', 'appeals']
const SECTION_LABELS = { status: 'My Status', cases: 'My Cases', appeals: 'My Appeals' }

const APPEAL_CATEGORIES = [
  { value: 'educational_context', label: 'Educational context', hint: 'What course/topic was this for? Why is it relevant to your studies?' },
  { value: 'false_positive', label: 'False positive / misunderstanding', hint: 'Why do you believe this was incorrectly flagged?' },
  { value: 'not_me', label: 'Not me / compromised account', hint: 'Describe what happened with your account.' },
  { value: 'content_edited', label: 'I edited the content', hint: 'What changes did you make to address the concern?' },
  { value: 'other', label: 'Other', hint: 'Provide any relevant context or explanation.' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
    confirmed: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)', border: 'var(--sh-danger-border)' },
    dismissed: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
    reversed: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)', border: 'var(--sh-success-border)' },
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

/* ── Appeal Modal ──────────────────────────────────────────────── */
function AppealModal({ caseData, onClose, onSubmit }) {
  const [category, setCategory] = useState('')
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectedCategory = APPEAL_CATEGORIES.find((c) => c.value === category)
  const canSubmit = category && reason.trim().length >= 20 && acknowledged && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    const result = await onSubmit(caseData.id, category, reason.trim())
    setSubmitting(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.5)', padding: 16,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--sh-surface)', borderRadius: 16,
          border: '1px solid var(--sh-border)', padding: '24px 28px',
          maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(15,23,42,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
            Appeal Decision
          </h3>
          <button type="button" onClick={onClose} style={{
            border: 'none', background: 'none', fontSize: 18, color: 'var(--sh-muted)',
            cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
          }}>&times;</button>
        </div>

        {/* Case context */}
        <div style={{
          padding: '10px 12px', borderRadius: 8, background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)', marginBottom: 16, fontSize: 12, color: 'var(--sh-subtext)',
        }}>
          <strong>Case #{caseData.id}</strong> — {caseData.contentType?.replace(/_/g, ' ')}
          {caseData.reasonCategory && <> &middot; {caseData.reasonCategory.replace(/_/g, ' ')}</>}
          {caseData.excerpt && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sh-muted)', borderLeft: '3px solid var(--sh-warning-border)', paddingLeft: 8 }}>
              {caseData.excerpt.length > 200 ? caseData.excerpt.slice(0, 200) + '...' : caseData.excerpt}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Reason category chips */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--sh-subtext)', marginBottom: 8 }}>
            Why should this be reconsidered?
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {APPEAL_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: category === cat.value ? '2px solid var(--sh-brand)' : '1px solid var(--sh-border)',
                  background: category === cat.value ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
                  color: category === cat.value ? 'var(--sh-brand)' : 'var(--sh-subtext)',
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Guided prompt */}
          {selectedCategory && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, background: 'var(--sh-info-bg)',
              border: '1px solid var(--sh-info-border)', marginBottom: 12,
              fontSize: 12, color: 'var(--sh-info-text)', fontWeight: 600,
            }}>
              {selectedCategory.hint}
            </div>
          )}

          {/* Explanation textarea */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--sh-subtext)', marginBottom: 6 }}>
            Your explanation (20–2000 characters)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Be specific — explain the intent, the academic context, and what you'd change..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--sh-input-border)', background: 'var(--sh-input-bg)',
              color: 'var(--sh-input-text)', fontFamily: FONT, resize: 'vertical',
              marginBottom: 4, boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginBottom: 12, textAlign: 'right' }}>
            {reason.trim().length}/2000
          </div>

          {/* Acknowledgement */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)',
          }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--sh-brand)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.5 }}>
              I acknowledge the community guidelines and will avoid actions that may violate them in the future.
            </span>
          </label>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12,
              background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
              border: '1px solid var(--sh-danger-border)',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: '1px solid var(--sh-border)', background: 'var(--sh-surface)',
              color: 'var(--sh-subtext)', cursor: 'pointer', fontFamily: FONT,
            }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: canSubmit ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: canSubmit ? '#fff' : 'var(--sh-muted)', fontSize: 13,
              fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: FONT,
            }}>
              {submitting ? 'Submitting...' : 'Submit Appeal'}
            </button>
          </div>
        </form>
      </div>
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
            <strong>How to resolve:</strong> You can appeal confirmed cases directly from the
            &ldquo;My Cases&rdquo; tab. Appeals are reviewed by our team.
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
function CasesSection({ data, onAppeal }) {
  const cases = data?.cases || []
  const appeals = data?.appeals || []

  if (cases.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>No moderation cases on your account.</p>
      </Card>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cases.map((c) => {
        /* Determine appeal state for this case */
        const caseAppeals = appeals.filter((a) => a.caseId === c.id)
        const pendingAppeal = caseAppeals.find((a) => a.status === 'pending')
        const approvedAppeal = caseAppeals.find((a) => a.status === 'approved')
        const canAppeal = c.status === 'confirmed' && !pendingAppeal && !approvedAppeal

        return (
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

            {/* Status explanations */}
            {c.status === 'pending' && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
                This case is being reviewed. Your content may be temporarily hidden.
              </p>
            )}
            {c.status === 'dismissed' && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sh-success-text)', lineHeight: 1.6 }}>
                This case was reviewed and dismissed. No action was taken.
              </p>
            )}
            {c.status === 'reversed' && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--sh-success-text)', lineHeight: 1.6 }}>
                Your appeal was approved. Content has been restored.
              </p>
            )}

            {/* Appeal action area */}
            {c.status === 'confirmed' && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sh-border)' }}>
                {canAppeal && (
                  <button
                    type="button"
                    onClick={() => onAppeal(c)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: 'var(--sh-brand)', color: '#fff', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                    }}
                  >
                    Appeal Decision
                  </button>
                )}
                {pendingAppeal && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)',
                  }}>
                    <StatusPill status="pending" />
                    <span style={{ fontSize: 12, color: 'var(--sh-warning-text)', fontWeight: 600 }}>
                      Appeal submitted — awaiting review
                    </span>
                  </div>
                )}
                {approvedAppeal && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)',
                  }}>
                    <StatusPill status="approved" />
                    <span style={{ fontSize: 12, color: 'var(--sh-success-text)', fontWeight: 600 }}>
                      Appeal approved
                    </span>
                  </div>
                )}
                {!canAppeal && !pendingAppeal && !approvedAppeal && caseAppeals.some((a) => a.status === 'rejected') && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)',
                  }}>
                    <StatusPill status="rejected" />
                    <span style={{ fontSize: 12, color: 'var(--sh-danger-text)', fontWeight: 600 }}>
                      Previous appeal was not approved
                    </span>
                    <button
                      type="button"
                      onClick={() => onAppeal(c)}
                      style={{
                        marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: 'var(--sh-surface)', color: 'var(--sh-subtext)', fontSize: 11,
                        fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                      }}
                    >
                      Appeal again
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* ── My Appeals section ────────────────────────────────────────── */
function AppealsSection({ data }) {
  const appeals = data?.appeals || []

  if (appeals.length === 0) {
    return (
      <Card>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--sh-muted)' }}>No appeals submitted yet.</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          If a case was confirmed against your content, you can submit an appeal from the &ldquo;My Cases&rdquo; tab.
        </p>
      </Card>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {appeals.map((a) => (
        <Card key={a.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                Appeal #{a.id}
              </span>
              <StatusPill status={a.status} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{formatDate(a.createdAt)}</span>
          </div>

          {/* Linked case reference */}
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 8 }}>
            Re: Case #{a.caseId}
            {a.reasonCategory && <> &middot; <span style={{ textTransform: 'capitalize' }}>{a.reasonCategory.replace(/_/g, ' ')}</span></>}
          </div>

          {/* User's reason */}
          <div style={{
            fontSize: 12, color: 'var(--sh-subtext)', lineHeight: 1.6,
            background: 'var(--sh-soft)', borderRadius: 8, padding: '8px 12px',
            borderLeft: '3px solid var(--sh-info-border)', marginBottom: 8,
          }}>
            {a.reason}
          </div>

          {/* Outcome */}
          {a.status === 'pending' && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
              Your appeal is being reviewed. We&apos;ll notify you when a decision is made.
            </p>
          )}
          {a.status === 'approved' && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-success-text)', marginBottom: 2 }}>
                Appeal approved
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-success-text)', lineHeight: 1.5 }}>
                The linked strike has been removed and your content has been restored.
              </p>
              {a.reviewNote && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sh-success-text)', lineHeight: 1.5 }}>
                  <strong>Admin note:</strong> {a.reviewNote}
                </p>
              )}
            </div>
          )}
          {a.status === 'rejected' && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-danger-text)', marginBottom: 2 }}>
                Appeal not approved
              </div>
              {a.reviewNote && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sh-danger-text)', lineHeight: 1.5 }}>
                  <strong>Admin response:</strong> {a.reviewNote}
                </p>
              )}
            </div>
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
  const [appealTarget, setAppealTarget] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

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

  async function handleSubmitAppeal(caseId, reasonCategory, reason) {
    try {
      const res = await fetch(`${API}/api/moderation/appeals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, reasonCategory, reason }),
      })
      const json = await res.json()
      if (!res.ok) return { ok: false, error: json.error || 'Failed to submit appeal.' }
      await loadData()
      setSuccessMsg('Appeal submitted successfully. You will be notified when it is reviewed.')
      setTimeout(() => setSuccessMsg(''), 6000)
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

      {/* Success toast */}
      {successMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14,
          background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)',
          border: '1px solid var(--sh-success-border)',
        }}>
          {successMsg}
        </div>
      )}

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
      {section === 'cases' && <CasesSection data={data} onAppeal={setAppealTarget} />}
      {section === 'appeals' && <AppealsSection data={data} />}

      {/* Appeal modal */}
      {appealTarget && (
        <AppealModal
          caseData={appealTarget}
          onClose={() => setAppealTarget(null)}
          onSubmit={handleSubmitAppeal}
        />
      )}
    </div>
  )
}

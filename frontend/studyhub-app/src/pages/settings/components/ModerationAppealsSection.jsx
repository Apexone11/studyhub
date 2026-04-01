/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationAppealsSection.jsx — List of submitted appeals
 * ═══════════════════════════════════════════════════════════════════════════ */
import { HistoryIcon } from '../../admin/components/icons'
import { Card } from './ModerationCard'
import { StatusPill } from './ModerationStatusPill'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AppealsSection({ data }) {
  const appeals = data?.appeals || []

  if (appeals.length === 0) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0', textAlign: 'center' }}>
          <HistoryIcon size={28} style={{ color: 'var(--sh-muted)', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--sh-muted)' }}>No appeals submitted yet</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.6, maxWidth: 340 }}>
            If a case was confirmed against your content, you can submit an appeal from the &ldquo;My Cases&rdquo; tab.
          </p>
        </div>
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
              Your appeal is being reviewed. We will notify you when a decision is made.
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

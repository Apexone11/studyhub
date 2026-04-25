/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationCasesSection.jsx — List of moderation cases
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Card } from './ModerationCard'
import { StatusPill } from './ModerationStatusPill'
import { FONT } from '../settingsState'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CasesSection({ data, onAppeal }) {
  const cases = data?.cases || []
  const appeals = data?.appeals || []

  if (cases.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
          No moderation cases on your account.
        </p>
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  Case #{c.id}
                </span>
                <StatusPill status={c.status} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                {formatDate(c.createdAt)}
              </span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 6 }}>
              <strong>Type:</strong> {c.contentType?.replace(/_/g, ' ')}
              {c.reasonCategory && (
                <>
                  {' '}
                  &middot; <strong>Category:</strong> {c.reasonCategory.replace(/_/g, ' ')}
                </>
              )}
            </div>

            {c.excerpt && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--sh-subtext)',
                  lineHeight: 1.6,
                  background: 'var(--sh-soft)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  borderLeft: '3px solid var(--sh-warning-border)',
                  wordBreak: 'break-word',
                }}
              >
                {c.excerpt.length > 300 ? c.excerpt.slice(0, 300) + '...' : c.excerpt}
              </div>
            )}

            {/* Status explanations */}
            {c.status === 'pending' && (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: 'var(--sh-warning-text)',
                  lineHeight: 1.6,
                }}
              >
                This case is being reviewed. Your content may be temporarily hidden.
              </p>
            )}
            {c.status === 'dismissed' && (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: 'var(--sh-success-text)',
                  lineHeight: 1.6,
                }}
              >
                This case was reviewed and dismissed. No action was taken.
              </p>
            )}
            {c.status === 'reversed' && (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: 'var(--sh-success-text)',
                  lineHeight: 1.6,
                }}
              >
                Your appeal was approved. Content has been restored.
              </p>
            )}

            {/* Appeal action area */}
            {c.status === 'confirmed' && (
              <div
                style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sh-border)' }}
              >
                {canAppeal && (
                  <button
                    type="button"
                    onClick={() => onAppeal(c)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--sh-brand)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                  >
                    Appeal Decision
                  </button>
                )}
                {pendingAppeal && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--sh-warning-bg)',
                      border: '1px solid var(--sh-warning-border)',
                    }}
                  >
                    <StatusPill status="pending" />
                    <span
                      style={{ fontSize: 12, color: 'var(--sh-warning-text)', fontWeight: 600 }}
                    >
                      Appeal submitted — awaiting review
                    </span>
                  </div>
                )}
                {approvedAppeal && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--sh-success-bg)',
                      border: '1px solid var(--sh-success-border)',
                    }}
                  >
                    <StatusPill status="approved" />
                    <span
                      style={{ fontSize: 12, color: 'var(--sh-success-text)', fontWeight: 600 }}
                    >
                      Appeal approved
                    </span>
                  </div>
                )}
                {!canAppeal &&
                  !pendingAppeal &&
                  !approvedAppeal &&
                  caseAppeals.some((a) => a.status === 'rejected') && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--sh-danger-bg)',
                        border: '1px solid var(--sh-danger-border)',
                      }}
                    >
                      <StatusPill status="rejected" />
                      <span
                        style={{ fontSize: 12, color: 'var(--sh-danger-text)', fontWeight: 600 }}
                      >
                        Previous appeal was not approved
                      </span>
                      <button
                        type="button"
                        onClick={() => onAppeal(c)}
                        style={{
                          marginLeft: 'auto',
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'var(--sh-surface)',
                          color: 'var(--sh-subtext)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: FONT,
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

/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationStatusSection.jsx — Current moderation status display
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Card } from './ModerationCard'

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

export function StatusSection({ data }) {
  if (!data) return null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.restricted && data.restriction && (
        <Card style={{ borderColor: 'var(--sh-danger-border)', background: 'var(--sh-danger-bg)' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 15,
              color: 'var(--sh-danger-text)',
              marginBottom: 8,
            }}
          >
            Account Restricted
          </div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              color: 'var(--sh-danger-text)',
              lineHeight: 1.6,
            }}
          >
            Your account is currently restricted from creating or modifying content.
          </p>
          {data.restriction.reason && (
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 13,
                color: 'var(--sh-danger-text)',
                lineHeight: 1.6,
              }}
            >
              <strong>Reason:</strong> {data.restriction.reason}
            </p>
          )}
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 12,
              color: 'var(--sh-danger-text)',
              lineHeight: 1.6,
            }}
          >
            <strong>Since:</strong> {formatDate(data.restriction.startsAt)}
            {data.restriction.endsAt && (
              <>
                {' '}
                &middot; <strong>Until:</strong> {formatDate(data.restriction.endsAt)}
              </>
            )}
          </p>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 13,
              color: 'var(--sh-danger-text)',
              lineHeight: 1.6,
            }}
          >
            <strong>How to resolve:</strong> You can appeal confirmed cases directly from the
            &ldquo;My Cases&rdquo; tab. Appeals are reviewed by our team.
          </p>
        </Card>
      )}

      {!data.restricted && (
        <Card>
          <div
            style={{
              fontWeight: 800,
              fontSize: 15,
              color: 'var(--sh-success-text)',
              marginBottom: 4,
            }}
          >
            Account in Good Standing
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
            No restrictions on your account.
          </p>
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>
              {data.activeStrikes}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
              Active Strikes
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>
              {data.cases?.length || 0}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>Cases</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>
              {data.appeals?.length || 0}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>Appeals</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

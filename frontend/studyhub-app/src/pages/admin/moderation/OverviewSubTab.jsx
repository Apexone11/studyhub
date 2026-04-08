import { FONT } from '../adminConstants'
import { statusPill } from './moderationHelpers'

export default function OverviewSubTab({ data, loading, formatDateTime, onNavigateCase }) {
  if (loading) return <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading overview...</div>
  if (!data) return <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Could not load overview data.</div>

  const { totalPending, sourceBreakdown, claimedBreakdown, recentResolved, abuseDetectionPending } = data

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Pending Cases" value={totalPending} color="var(--sh-warning-text)" bg="var(--sh-warning-bg)" />
        <StatCard label="Auto-detected" value={sourceBreakdown?.auto || 0} color="var(--sh-info-text)" bg="var(--sh-info-bg)" />
        <StatCard label="User Reports" value={sourceBreakdown?.user_report || 0} color="var(--sh-brand)" bg="var(--sh-soft)" />
        <StatCard label="Abuse Signals" value={abuseDetectionPending || 0} color="#dc2626" bg="var(--sh-danger-bg)" />
      </div>

      {/* Claimed breakdown */}
      {claimedBreakdown && claimedBreakdown.length > 0 && (
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Active Admin Claims</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {claimedBreakdown.map((item) => (
              <div key={item.adminId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--sh-soft)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                  {item.adminUsername}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)' }}>
                  {item.pendingClaimed} pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent resolved */}
      {recentResolved && recentResolved.length > 0 && (
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Recently Resolved</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {recentResolved.map((c) => (
              <div
                key={c.id}
                onClick={() => onNavigateCase?.(c.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--sh-bg)',
                  cursor: 'pointer',
                  transition: 'background .15s',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', marginRight: 8 }}>#{c.id}</span>
                  <span style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>{c.contentType}</span>
                  {c.source === 'user_report' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-brand)', marginLeft: 8, textTransform: 'uppercase' }}>report</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={statusPill(c.status)}>{c.status}</span>
                  {c.reviewer && (
                    <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>by {c.reviewer.username}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{formatDateTime(c.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{
      padding: '16px 18px',
      borderRadius: 14,
      border: '1px solid var(--sh-border)',
      background: bg,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: FONT }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const cardStyle = {
  padding: '16px 18px',
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
}

const sectionTitle = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--sh-heading)',
}

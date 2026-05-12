/* ═══════════════════════════════════════════════════════════════════════════
 * ContributionGraph.jsx — 90-day activity heatmap for the profile.
 *
 * Wraps the shared <ActivityHeatmap/> with:
 *   • Loading skeleton (matches the 13-week × 7-day grid footprint)
 *   • Empty state when the user has no activity
 *   • Section card chrome + heading
 *
 * The underlying ActivityHeatmap already provides the per-day <title> tooltip
 * (native browser hover tooltip — accessible without extra JS) and respects
 * `prefers-reduced-motion` via its lack of animations.
 * ═══════════════════════════════════════════════════════════════════════════ */
import ActivityHeatmap from '../../components/ActivityHeatmap'
import { cardStyle, sectionHeadingStyle } from './profileConstants'

const WEEKS = 13 // ≈ 90 days

function ContributionSkeleton() {
  // 13 weeks × 7 days at 13px cells + 3px gap. Mirrors the SVG used in the
  // real component so the layout doesn't shift after data lands.
  const CELL = 13
  const GAP = 3
  return (
    <div aria-hidden="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="sh-skeleton" style={{ height: 13, width: 220, borderRadius: 6 }} />
      </div>
      <div style={{ display: 'flex', gap: GAP }}>
        {Array.from({ length: WEEKS }).map((_, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            {Array.from({ length: 7 }).map((__, di) => (
              <div
                key={di}
                className="sh-skeleton"
                style={{ width: CELL, height: CELL, borderRadius: 3 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ContributionEmpty({ isOwner }) {
  return (
    <div
      data-testid="contribution-graph-empty"
      style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: 'var(--sh-muted)',
        fontSize: 13,
        lineHeight: 1.6,
        border: '1px dashed var(--sh-border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 4 }}>
        No activity in the last 90 days
      </div>
      <div>
        {isOwner
          ? 'Create a sheet, leave a review, or comment on a note to start a streak.'
          : 'This user has not contributed yet in the last 90 days.'}
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {Array}  props.data    Daily activity rows from /api/users/:u/activity
 * @param {boolean} [props.loading]   Show skeleton instead of the graph
 * @param {boolean} [props.isOwner]   Adjust empty-state copy
 */
export default function ContributionGraph({ data, loading, isOwner }) {
  const hasActivity =
    Array.isArray(data) &&
    data.some((row) => {
      const total =
        (row?.commits || 0) + (row?.sheets || 0) + (row?.reviews || 0) + (row?.comments || 0)
      return total > 0
    })

  return (
    <div style={cardStyle} data-testid="contribution-graph">
      <h2 style={{ ...sectionHeadingStyle, marginBottom: 12 }}>Activity (last 90 days)</h2>
      {loading ? (
        <ContributionSkeleton />
      ) : hasActivity ? (
        <ActivityHeatmap data={data} weeks={WEEKS} />
      ) : (
        <ContributionEmpty isOwner={!!isOwner} />
      )}
    </div>
  )
}

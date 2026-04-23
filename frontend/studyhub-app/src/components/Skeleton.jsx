/* ═══════════════════════════════════════════════════════════════════════════
 * Skeleton — Reusable loading placeholder with shimmer animation
 *
 * Usage:
 *   <Skeleton width="100%" height={20} />
 *   <Skeleton circle size={40} />
 *   <SkeletonCard />
 *   <SkeletonList count={5} />
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Base skeleton block with shimmer.
 * @param {{ width?: string|number, height?: string|number, circle?: boolean, size?: number, borderRadius?: number, style?: object }} props
 */
export function Skeleton({ width = '100%', height = 16, circle, size, borderRadius = 8, style }) {
  const w = circle ? size || height : width
  const h = circle ? size || height : height
  return (
    <div
      className="sh-skeleton"
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: circle ? '50%' : borderRadius,
        ...style,
      }}
    />
  )
}

/** Card-shaped skeleton with header row + content lines. */
export function SkeletonCard({ style }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface, #fff)',
        borderRadius: 16,
        border: '1px solid var(--sh-border, #e2e8f0)',
        padding: '20px 22px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Skeleton circle size={36} />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="25%" height={10} />
        </div>
      </div>
      <Skeleton width="70%" height={16} style={{ marginBottom: 10 }} />
      <Skeleton width="100%" height={12} style={{ marginBottom: 6 }} />
      <Skeleton width="85%" height={12} />
    </div>
  )
}

/** Repeated skeleton lines (for lists). */
export function SkeletonList({ count = 4, gap = 12, style }) {
  return (
    <div style={{ display: 'grid', gap, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
          <Skeleton circle size={32} />
          <div style={{ flex: 1 }}>
            <Skeleton width={`${55 + (i % 3) * 15}%`} height={13} style={{ marginBottom: 6 }} />
            <Skeleton width={`${30 + (i % 2) * 20}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Profile page skeleton. */
export function SkeletonProfile() {
  return (
    <div>
      <div
        style={{
          background: 'var(--sh-surface, #fff)',
          borderRadius: 18,
          border: '1px solid var(--sh-border, #e2e8f0)',
          padding: 28,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <Skeleton circle size={72} />
          <div style={{ flex: 1 }}>
            <Skeleton width="30%" height={22} style={{ marginBottom: 8 }} />
            <Skeleton width="20%" height={12} style={{ marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 24 }}>
              <Skeleton width={60} height={40} borderRadius={10} />
              <Skeleton width={60} height={40} borderRadius={10} />
              <Skeleton width={60} height={40} borderRadius={10} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

/** Sheet cards grid skeleton. */
export function SkeletonSheetGrid({ count = 4 }) {
  return (
    <div className="sheets-card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

/** Feed skeleton with multiple post cards. */
export function SkeletonFeed({ count = 3 }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={{ padding: '22px 24px' }} />
      ))}
    </div>
  )
}

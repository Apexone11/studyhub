/**
 * CitationSparkline.jsx — Decorative trend SVG for paper-card top-right.
 *
 * v1 renders a deterministic shape based on the citationCount (no real
 * time-series data yet). aria-hidden because it is redundant with the
 * adjacent citation count badge (per L4-LOW-2).
 */

export default function CitationSparkline({ citationCount = 0 }) {
  // Build a path string with a few peaks based on the cite count.
  // The shape is decorative; aria-hidden is on the SVG.
  const seed = Math.max(1, Math.log10(citationCount + 10))
  const points = []
  for (let i = 0; i < 8; i += 1) {
    const x = (i / 7) * 60 + 2
    // Pseudo-random but deterministic sin-based bumps.
    const y = 12 - Math.sin((i + seed) * 0.9) * 6 - (i / 7) * (seed * 0.6)
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const path = `M ${points.join(' L ')}`
  return (
    <svg className="scholar-sparkline" viewBox="0 0 64 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

/**
 * CitationSparkline.jsx — Tiny per-year citation trend SVG.
 *
 * Pure SVG line chart, no external dep. Renders width=60 × height=14 by
 * default. The most-recent data point is rendered as a dotted marker to
 * communicate "still being cited" without resorting to color alone.
 *
 * Input contract:
 *   data: Array<{ year: number, count: number }> — typically the last
 *         ~10 calendar years. Order does not matter; we sort by year.
 *
 * Accessibility:
 *   - <title> element provides a screen-reader summary ("Citations from
 *     2014 to 2024").
 *   - role="img" so SR users hear it as a single graphic, not skipped
 *     decorative SVG.
 *
 * Reduced motion:
 *   - The stroke-draw animation is gated behind `(prefers-reduced-motion:
 *     no-preference)` in CSS. JS does not animate; CSS handles the gate.
 *
 * Returns null when data is empty/null so the card layout collapses
 * cleanly without an empty SVG slot.
 */

const DEFAULT_WIDTH = 60
const DEFAULT_HEIGHT = 14
const PADDING_X = 1
const PADDING_Y = 2

export default function CitationSparkline({
  data,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}) {
  if (!Array.isArray(data) || data.length === 0) return null

  const cleaned = data
    .filter((d) => d && Number.isFinite(d.year) && Number.isFinite(d.count) && d.count >= 0)
    .sort((a, b) => a.year - b.year)

  if (cleaned.length === 0) return null

  // Single point — render a centered dot rather than a degenerate line.
  if (cleaned.length === 1) {
    const cx = width / 2
    const cy = height / 2
    const yearLabel = String(cleaned[0].year)
    return (
      <svg
        className="citation-sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        focusable="false"
      >
        <title>{`Citations in ${yearLabel}`}</title>
        <circle cx={cx} cy={cy} r={1.5} fill="var(--sh-accent, var(--sh-brand))" />
      </svg>
    )
  }

  const counts = cleaned.map((d) => d.count)
  const maxCount = Math.max(...counts, 1)
  const minYear = cleaned[0].year
  const maxYear = cleaned[cleaned.length - 1].year

  const innerW = width - PADDING_X * 2
  const innerH = height - PADDING_Y * 2

  const points = cleaned.map((d, i) => {
    const x = PADDING_X + (i / (cleaned.length - 1)) * innerW
    // Invert Y so higher counts sit toward the top of the chart.
    const y = PADDING_Y + (1 - d.count / maxCount) * innerH
    return { x, y, year: d.year, count: d.count }
  })

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const last = points[points.length - 1]
  const yearRange = minYear === maxYear ? `${minYear}` : `${minYear} to ${maxYear}`

  return (
    <svg
      className="citation-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      focusable="false"
    >
      <title>{`Citations from ${yearRange}`}</title>
      <path
        className="citation-sparkline__line"
        d={pathD}
        fill="none"
        stroke="var(--sh-accent, var(--sh-brand))"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        className="citation-sparkline__head"
        cx={last.x}
        cy={last.y}
        r={1.25}
        fill="none"
        stroke="var(--sh-accent, var(--sh-brand))"
        strokeWidth="1"
        strokeDasharray="1 1"
      />
    </svg>
  )
}

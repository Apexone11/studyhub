/**
 * SourceStatusStrip.jsx — per-source coverage chips for federated search.
 *
 * Scholar fans a query out to 4 rate-limited upstream indexes. When one
 * of them is throttled the results are silently thinner — this strip
 * makes that visible instead of hiding it in a bare "X throttled" string
 * (honest-loading pattern; the per-source token buckets live in
 * backend/src/modules/scholar/rateBucket.js).
 *
 * Props:
 *   throttled    — array of adapter slugs the backend skipped this query
 *   activeSource — the `?source=` filter slug; when set, only that chip
 *                  renders (the others were never queried)
 */
import { SCHOLAR_SOURCES } from './scholarConstants'

function IconCheck() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export default function SourceStatusStrip({ throttled = [], activeSource = '' }) {
  const throttledSet = new Set(Array.isArray(throttled) ? throttled : [])
  const sources = activeSource
    ? SCHOLAR_SOURCES.filter((s) => s.slug === activeSource)
    : SCHOLAR_SOURCES
  if (sources.length === 0) return null

  return (
    <div className="scholar-source-strip" role="status" aria-label="Sources searched">
      {sources.map((s) => {
        const isThrottled = throttledSet.has(s.slug)
        return (
          <span
            key={s.slug}
            className={`scholar-source-strip__chip${
              isThrottled ? ' scholar-source-strip__chip--throttled' : ''
            }`}
            title={
              isThrottled
                ? `${s.label} is rate-limited right now — its results are missing from this page. Search again in a moment.`
                : `${s.label} answered this search`
            }
          >
            {isThrottled ? <IconClock /> : <IconCheck />}
            {s.label}
            {isThrottled && <span className="scholar-source-strip__note">throttled</span>}
          </span>
        )
      })}
    </div>
  )
}

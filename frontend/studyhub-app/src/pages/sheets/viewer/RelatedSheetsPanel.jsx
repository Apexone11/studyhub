import { Link } from 'react-router-dom'
import { panelStyle } from './sheetViewerConstants'

export default function RelatedSheetsPanel({ sheet, relatedSheets }) {
  if (!relatedSheets || relatedSheets.length === 0) return null

  const visible = relatedSheets.slice(0, 6)
  const hasMore = relatedSheets.length > 6

  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>
        {sheet?.course?.code ? `More from ${sheet.course.code}` : 'Related sheets'}
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((related) => (
          <Link
            key={related.id}
            to={`/sheets/${related.id}`}
            style={{
              display: 'block',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)',
              textDecoration: 'none',
              color: 'var(--sh-text)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 2 }}>
              {related.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', display: 'flex', gap: 12 }}>
              <span>by {related.author?.username || 'Unknown'}</span>
              <span>{related.stars || 0} stars</span>
              {related.forks > 0 ? <span>{related.forks} forks</span> : null}
            </div>
          </Link>
        ))}
      </div>
      {(hasMore || sheet?.course?.id) && (
        <div style={{ marginTop: 12 }}>
          {sheet?.course?.id ? (
            <Link
              to={`/sheets?courseId=${sheet.course.id}`}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-brand)', textDecoration: 'none' }}
            >
              Browse all {sheet.course.code} sheets →
            </Link>
          ) : hasMore ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-muted)' }}>
              View more related sheets
            </span>
          ) : null}
        </div>
      )}
    </section>
  )
}

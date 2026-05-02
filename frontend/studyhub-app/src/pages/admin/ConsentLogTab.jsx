/* ═══════════════════════════════════════════════════════════════════════════
 * ConsentLogTab — admin view of CreatorAuditConsent rows.
 *
 * Lists who consented to creator-audit, when, the doc version they
 * accepted, the acceptance method (user / backfill / seed), and
 * revocation state. Read-only by design — soft-delete revocations
 * happen via the user's own Settings flow, not from here. The admin
 * surface exists for legal disputes + auditor walkthroughs.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import { Pager } from './AdminWidgets'
import { tableHeadStyle, tableCell, tableCellStrong, formatDateTime } from './adminConstants'

const PAGE_SIZE = 20

export default function ConsentLogTab() {
  const [page, setPage] = useState(1)
  const [revokedOnly, setRevokedOnly] = useState(false)
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const url = `${API}/api/admin/creator-audit-consents?page=${page}${
      revokedOnly ? '&revoked=true' : ''
    }`
    // Defer the loading-state flip a tick so the effect doesn't
    // synchronously call setState before the fetch microtask runs —
    // satisfies react-hooks/set-state-in-effect.
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        setError('')
      }
    })
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((body) => {
        if (cancelled) return
        setData({
          rows: Array.isArray(body.rows) ? body.rows : [],
          total: body.total || 0,
          pages: body.pages || 1,
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load consent log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, revokedOnly])

  function methodLabel(method) {
    switch (method) {
      case 'user':
        return 'User accepted'
      case 'backfill':
        return 'Backfill (system)'
      case 'seed':
        return 'Seed (dev only)'
      default:
        return method || '—'
    }
  }

  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, color: 'var(--sh-heading)' }}>
            Creator Audit Consent Log
          </h2>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 4 }}>
            {data.total} total {revokedOnly ? 'revoked ' : ''}rows
          </div>
        </div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--sh-subtext)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={revokedOnly}
            onChange={(e) => {
              setRevokedOnly(e.target.checked)
              setPage(1)
            }}
            style={{ accentColor: 'var(--sh-brand)' }}
          />
          Show revoked only
        </label>
      </div>

      {error ? (
        <div style={{ color: 'var(--sh-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--sh-soft)' }}>
              {['User', 'Accepted', 'Doc Version', 'Method', 'Revoked'].map((header) => (
                <th key={header} style={tableHeadStyle}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-empty">
                  No consent rows found.
                </td>
              </tr>
            )}
            {data.rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--sh-border)' }}>
                <td style={tableCellStrong}>{row.user?.username || `#${row.userId}`}</td>
                <td style={tableCell}>{formatDateTime(row.acceptedAt)}</td>
                <td style={tableCell}>{row.docVersion}</td>
                <td style={tableCell}>{methodLabel(row.acceptanceMethod)}</td>
                <td style={tableCell}>
                  {row.revokedAt ? (
                    <span style={{ color: 'var(--sh-warning)' }}>
                      {formatDateTime(row.revokedAt)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--sh-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
    </section>
  )
}

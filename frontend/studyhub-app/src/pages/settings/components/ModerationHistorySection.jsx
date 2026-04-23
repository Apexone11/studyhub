/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationHistorySection.jsx — Historical log of moderation actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { API } from '../../../config'
import { FONT } from '../settingsState'
import { Card } from './ModerationCard'

const ACTION_LABELS = {
  case_opened: 'Content flagged for review',
  case_confirmed: 'Violation confirmed',
  case_dismissed: 'Case dismissed',
  strike_issued: 'Strike issued',
  strike_decayed: 'Strike removed',
  strike_expired: 'Strike expired',
  appeal_submitted: 'Appeal submitted',
  appeal_approved: 'Appeal approved',
  appeal_rejected: 'Appeal rejected',
  restriction_applied: 'Account restricted',
  restriction_lifted: 'Restriction lifted',
  content_purged: 'Content permanently removed',
}

export function HistorySection() {
  const [page, setPage] = useState(1)
  const [log, setLog] = useState({ items: [], totalPages: 1 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(`${API}/api/moderation/my-log?page=${page}`, {
          credentials: 'include',
        })
        const data = await r.json()
        if (!cancelled) setLog(data)
      } catch {
        // fetch errors are non-fatal
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page])

  if (loading)
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)' }}>
        Loading history...
      </div>
    )

  if (!log.items || log.items.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)' }}>
          No moderation history.
        </div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {log.items.map((entry) => (
        <Card key={entry.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)' }}>
                {ACTION_LABELS[entry.action] || entry.action}
              </div>
              {entry.reason && (
                <div style={{ fontSize: 13, color: 'var(--sh-subtext)', marginTop: 4 }}>
                  {entry.reason}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
              {new Date(entry.createdAt).toLocaleDateString()}
            </div>
          </div>
        </Card>
      ))}
      {log.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-subtext)',
              fontSize: 13,
              fontWeight: 700,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontFamily: FONT,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: '32px' }}>
            Page {page} of {log.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= log.totalPages}
            onClick={() => setPage((p) => Math.min(log.totalPages, p + 1))}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-surface)',
              color: 'var(--sh-subtext)',
              fontSize: 13,
              fontWeight: 700,
              cursor: page >= log.totalPages ? 'not-allowed' : 'pointer',
              fontFamily: FONT,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

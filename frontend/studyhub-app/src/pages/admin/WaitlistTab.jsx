/**
 * WaitlistTab — Admin dashboard for viewing, filtering, inviting, and
 * exporting waitlist signups. Lazy-loaded from AdminPage.
 *
 * Endpoints:
 *   GET    /api/admin/waitlist        (list)
 *   GET    /api/admin/waitlist/stats  (stat cards)
 *   POST   /api/admin/waitlist/export (CSV download)
 *   POST   /api/admin/waitlist/invite (single invite)
 *   POST   /api/admin/waitlist/invite-batch (batch invite)
 *   DELETE /api/admin/waitlist/:id    (remove)
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders, FONT } from './adminConstants'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { showToast } from '../../lib/toast'

const TIERS = ['all', 'pro', 'institution']
const STATUSES = ['all', 'waiting', 'invited', 'converted', 'removed']
const PAGE_SIZE = 30

export default function WaitlistTab() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tierFilter, setTierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [actingOn, setActingOn] = useState(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())

      const res = await fetch(`${API}/api/admin/waitlist?${params}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Could not load waitlist.'))
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [page, tierFilter, statusFilter, search])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/waitlist/stats`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(res, {})
      if (res.ok) setStats(data)
    } catch {
      // Non-fatal
    }
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])
  useEffect(() => { loadStats() }, [loadStats])

  async function handleInvite(id) {
    if (actingOn) return
    setActingOn(id)
    try {
      const res = await fetch(`${API}/api/admin/waitlist/invite`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
      const data = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Could not invite.'))
      showToast('Invitation sent.', 'success')
      void loadEntries()
      void loadStats()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setActingOn(null)
    }
  }

  async function handleRemove(id) {
    if (!window.confirm('Remove this waitlist entry?')) return
    setActingOn(id)
    try {
      const res = await fetch(`${API}/api/admin/waitlist/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Could not remove.')
      showToast('Entry removed.', 'info')
      void loadEntries()
      void loadStats()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setActingOn(null)
    }
  }

  async function handleExport() {
    try {
      const res = await fetch(`${API}/api/admin/waitlist/export`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Export failed.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'studyhub-waitlist.csv'
      a.click()
      URL.revokeObjectURL(url)
      showToast('CSV downloaded.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleBatchInvite() {
    const tier = tierFilter === 'all' ? 'pro' : tierFilter
    const count = window.prompt(`Invite the first N "${tier}" waitlist entries (max 500):`, '50')
    if (!count) return
    try {
      const res = await fetch(`${API}/api/admin/waitlist/invite-batch`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ tier, count: Number.parseInt(count, 10) || 50 }),
      })
      const data = await readJsonSafely(res, {})
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Batch invite failed.'))
      showToast(`${data.invited} invitations sent.`, 'success')
      void loadEntries()
      void loadStats()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  return (
    <section style={{ background: 'var(--sh-surface)', borderRadius: 18, border: '1px solid var(--sh-border)', padding: 22, fontFamily: FONT }}>
      <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800, color: 'var(--sh-heading)' }}>
        Waitlist {stats ? <span style={{ fontSize: 13, color: 'var(--sh-muted)', fontWeight: 600 }}>({stats.total} total)</span> : null}
      </h2>

      {/* Stat cards */}
      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Total', value: stats.total, color: 'var(--sh-brand)' },
            { label: 'Pro', value: stats.pro, color: 'var(--sh-info)' },
            { label: 'Institution', value: stats.institution, color: 'var(--sh-success)' },
            { label: 'Waiting', value: stats.waiting, color: 'var(--sh-warning)' },
            { label: 'Invited', value: stats.invited, color: 'var(--sh-brand-accent)' },
          ].map((card) => (
            <div key={card.label} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Filters + actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by email..."
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--sh-border)', background: 'var(--sh-surface)', color: 'var(--sh-heading)', fontSize: 12, flex: '1 1 180px', minWidth: 140, fontFamily: FONT }}
        />
        <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {TIERS.map((t) => <option key={t} value={t}>{t === 'all' ? 'All tiers' : t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <button onClick={handleExport} style={actionBtnStyle}>Export CSV</button>
        <button onClick={handleBatchInvite} style={{ ...actionBtnStyle, background: 'var(--sh-brand)', color: 'var(--sh-btn-primary-text, #fff)' }}>Batch Invite</button>
      </div>

      {/* Table */}
      {loading ? <div style={{ color: 'var(--sh-muted)', fontSize: 13, padding: 16 }}>Loading...</div> : null}
      {!loading && entries.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)' }}>No entries match your filters.</div> : null}

      {entries.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Email', 'Tier', 'Status', 'Signed up', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--sh-border)', color: 'var(--sh-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={cellStyle}>{entry.email}</td>
                  <td style={cellStyle}><span style={tierBadge(entry.tier)}>{entry.tier}</span></td>
                  <td style={cellStyle}><span style={statusBadge(entry.status)}>{entry.status}</span></td>
                  <td style={cellStyle}>{new Date(entry.createdAt).toLocaleDateString()}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {entry.status === 'waiting' ? (
                        <button onClick={() => handleInvite(entry.id)} disabled={actingOn === entry.id} style={smallBtnStyle}>Invite</button>
                      ) : null}
                      <button onClick={() => handleRemove(entry.id)} disabled={actingOn === entry.id} style={{ ...smallBtnStyle, color: 'var(--sh-danger)' }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={smallBtnStyle}>Previous</button>
          <span style={{ fontSize: 12, color: 'var(--sh-muted)', padding: '6px 0' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={smallBtnStyle}>Next</button>
        </div>
      ) : null}
    </section>
  )
}

const selectStyle = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)', color: 'var(--sh-heading)', fontSize: 12, fontFamily: 'inherit',
}

const actionBtnStyle = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)', color: 'var(--sh-heading)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const cellStyle = {
  padding: '8px 10px', borderBottom: '1px solid var(--sh-soft)', color: 'var(--sh-heading)',
}

const smallBtnStyle = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)', color: 'var(--sh-heading)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

function tierBadge(tier) {
  const bg = tier === 'institution' ? 'var(--sh-success-bg)' : 'var(--sh-info-bg)'
  const color = tier === 'institution' ? 'var(--sh-success-text)' : 'var(--sh-brand)'
  return { padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: bg, color }
}

function statusBadge(status) {
  const map = {
    waiting: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)' },
    invited: { bg: 'var(--sh-info-bg)', color: 'var(--sh-brand)' },
    converted: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' },
    removed: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)' },
  }
  const s = map[status] || map.waiting
  return { padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.color }
}

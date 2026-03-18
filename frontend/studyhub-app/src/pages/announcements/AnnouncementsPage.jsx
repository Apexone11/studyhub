/* ═══════════════════════════════════════════════════════════════════════════
 * AnnouncementsPage.jsx — Official announcements feed with admin posting
 *
 * Layout: Uses PageShell (sidebar + main) with full-width announcement cards.
 * Pinned announcements get a distinctive yellow highlight with pin indicator.
 * Admin users see a toggleable post form at the top.
 *
 * Polling: Announcements refresh every 20 seconds via useLivePolling.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import { IconPlus } from '../../components/Icons'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT, authHeaders, timeAgo } from '../shared/pageUtils'

export default function AnnouncementsPage() {
  const { user } = useSession()
  const isAdmin = user?.role === 'admin'

  /* ── State ───────────────────────────────────────────────────────────── */
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')

  /* ── Live polling (20s interval) ─────────────────────────────────────── */
  async function loadAnnouncements({ signal, startTransition } = {}) {
    try {
      const response = await fetch(`${API}/api/announcements`, { signal })
      if (!response.ok) return
      const data = await response.json()
      startTransition(() => {
        setAnnouncements(Array.isArray(data) ? data : [])
        setLoading(false)
      })
    } catch (error) {
      if (error?.name !== 'AbortError') setLoading(false)
    }
  }

  useLivePolling(loadAnnouncements, { enabled: true, intervalMs: 20000 })

  /* ── Post new announcement (admin only) ──────────────────────────────── */
  async function handlePost(event) {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      setPostError('Title and body are required.')
      return
    }
    setPosting(true)
    setPostError('')
    try {
      const response = await fetch(`${API}/api/announcements`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: title.trim(), body: body.trim(), pinned }),
      })
      const data = await response.json()
      if (!response.ok) { setPostError(data.error || 'Failed to post.'); return }
      setAnnouncements((prev) => [data, ...prev])
      setTitle('')
      setBody('')
      setPinned(false)
      setShowForm(false)
    } catch {
      setPostError('Could not connect to server.')
    } finally {
      setPosting(false)
    }
  }

  /* ── Navbar action button for admin ──────────────────────────────────── */
  const navActions = isAdmin ? (
    <button
      onClick={() => setShowForm((v) => !v)}
      style={{
        fontSize: 12, fontWeight: 700, color: '#fff', padding: '5px 13px',
        background: '#3b82f6', border: 'none', borderRadius: 7, cursor: 'pointer',
        fontFamily: PAGE_FONT, display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      <IconPlus size={13} />
      {showForm ? 'Cancel' : 'Post Announcement'}
    </button>
  ) : null

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'Announcements', to: '/announcements' }]} hideTabs actions={navActions} />} sidebar={<AppSidebar />}>
      {/* Page header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Announcements</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>Official updates from the StudyHub team.</p>
      </div>

      {/* Admin post form */}
      {isAdmin && showForm ? (
        <form onSubmit={handlePost} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 22px', marginBottom: 18, boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>New Announcement</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontFamily: PAGE_FONT, marginBottom: 12, outline: 'none' }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the announcement body…"
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontFamily: PAGE_FONT, resize: 'vertical', outline: 'none', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin this announcement
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {postError ? <span style={{ color: '#dc2626', fontSize: 12 }}>{postError}</span> : null}
              <button type="submit" disabled={posting} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: PAGE_FONT }}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Loading state */}
      {loading ? <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Loading…</div> : null}

      {/* Empty state */}
      {!loading && announcements.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1.5px dashed #cbd5e1', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }}>📢</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>No announcements yet</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Check back later for updates from the StudyHub team.</div>
        </div>
      ) : null}

      {/* Announcement cards */}
      <div style={{ display: 'grid', gap: 12 }}>
        {announcements.map((a) => a.pinned ? (
          /* Pinned announcement card — yellow highlight */
          <article key={a.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: '18px 22px', boxShadow: '0 2px 10px rgba(245,158,11,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', letterSpacing: '.08em', background: '#fef3c7', padding: '2px 8px', borderRadius: 99 }}>📌 PINNED</span>
              <span style={{ fontSize: 11, color: '#b45309' }}>{timeAgo(a.createdAt)}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            <div style={{ fontSize: 12, color: '#b45309' }}>Posted by <strong>{a.author?.username}</strong></div>
          </article>
        ) : (
          /* Regular announcement card */
          <article key={a.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '18px 22px', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {(a.author?.username || '?').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{a.author?.username}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(a.createdAt)}</div>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.body}</div>
          </article>
        ))}
      </div>
    </PageShell>
  )
}

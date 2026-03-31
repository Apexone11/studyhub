/* ═══════════════════════════════════════════════════════════════════════════
 * AnnouncementsPage.jsx — Official announcements feed with admin posting
 *
 * Layout: Uses PageShell (sidebar + main) with full-width announcement cards.
 * Pinned announcements get a distinctive yellow highlight with pin indicator.
 * Admin users see a toggleable post form at the top.
 *
 * Polling: Announcements refresh every 20 seconds via useLivePolling.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import MentionText from '../../components/MentionText'
import { IconPlus } from '../../components/Icons'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { useTutorial } from '../../lib/useTutorial'
import { ANNOUNCEMENTS_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { staggerEntrance } from '../../lib/animations'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonFeed } from '../../components/Skeleton'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT, authHeaders, timeAgo } from '../shared/pageUtils'

export default function AnnouncementsPage() {
  usePageTitle('Announcements')
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

  const cardsRef = useRef(null)
  const animatedRef = useRef(false)

  /* Tutorial */
  const tutorial = useTutorial('announcements', ANNOUNCEMENTS_STEPS, { version: TUTORIAL_VERSIONS.announcements })

  /* Animate cards on first load */
  useEffect(() => {
    if (loading || animatedRef.current || announcements.length === 0) return
    animatedRef.current = true
    if (cardsRef.current) staggerEntrance(cardsRef.current.children, { staggerMs: 70, duration: 400, y: 14 })
  }, [loading, announcements.length])

  /* ── Live polling (20s interval) ─────────────────────────────────────── */
  async function loadAnnouncements({ signal, startTransition } = {}) {
    try {
      const response = await fetch(`${API}/api/announcements`, { signal, credentials: 'include' })
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
        credentials: 'include',
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
        background: 'var(--sh-brand)', border: 'none', borderRadius: 7, cursor: 'pointer',
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
      <div data-tutorial="announcements-header" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sh-heading)', marginBottom: 4 }}>Announcements</h1>
        <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Official updates from the StudyHub team.</p>
      </div>

      {/* Admin post form */}
      {isAdmin && showForm ? (
        <form data-tutorial="announcements-form" onSubmit={handlePost} style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--sh-border)', padding: '20px 22px', marginBottom: 18, boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 14 }}>New Announcement</div>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sh-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin this announcement
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {postError ? <span style={{ color: 'var(--sh-danger)', fontSize: 12 }}>{postError}</span> : null}
              <button type="submit" disabled={posting} style={{ background: 'var(--sh-brand)', color: 'var(--sh-surface)', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: PAGE_FONT }}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Loading state */}
      {loading ? <SkeletonFeed count={3} /> : null}

      {/* Empty state */}
      {!loading && announcements.length === 0 ? (
        <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 16, border: '2px dashed var(--sh-border, #cbd5e1)', padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 6 }}>No announcements yet</div>
          <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.6 }}>Check back later for official updates from the StudyHub team.</div>
        </div>
      ) : null}

      {/* Announcement cards */}
      <div ref={cardsRef} data-tutorial="announcements-list" style={{ display: 'grid', gap: 14 }}>
        {announcements.map((a) => a.pinned ? (
          /* Pinned announcement card — yellow highlight */
          <article key={a.id} className="announcement-card-pinned" style={{ background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(245,158,11,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--sh-warning-text)', letterSpacing: '.08em', background: 'var(--sh-warning-light-bg)', padding: '3px 10px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 2L17.41 3.41 13.34 7.48l2.12 2.12 4.07-4.07L21 7V2h-5zM3.41 20.59l7.07-7.07 2.12 2.12L5.53 22.71l-2.12-2.12z"/></svg>
                PINNED
              </span>
              <span style={{ fontSize: 11, color: 'var(--sh-warning-text)' }}>{timeAgo(a.createdAt)}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--sh-warning-text)', marginBottom: 8 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: 'var(--sh-warning-dark-text)', lineHeight: 1.8, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
              <MentionText text={a.body} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--sh-warning-text)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--sh-warning-text)', color: 'var(--sh-warning-light-bg)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                {(a.author?.username || '?').slice(0, 2).toUpperCase()}
              </span>
              <Link to={`/users/${a.author?.username}`} style={{ fontWeight: 700, color: 'var(--sh-warning-text)', textDecoration: 'none' }}>{a.author?.username}</Link>
            </div>
          </article>
        ) : (
          /* Regular announcement card */
          <article key={a.id} className="announcement-card" style={{ background: 'var(--sh-surface)', borderRadius: 16, border: '1px solid var(--sh-border)', padding: '20px 24px', boxShadow: '0 2px 10px rgba(15,23,42,0.04)', transition: 'box-shadow .15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--sh-heading)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {(a.author?.username || '?').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <Link to={`/users/${a.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}>{a.author?.username}</Link>
                <div style={{ fontSize: 11, color: 'var(--sh-subtext)' }}>{timeAgo(a.createdAt)}</div>
              </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 6 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              <MentionText text={a.body} />
            </div>
          </article>
        ))}
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
    </PageShell>
  )
}

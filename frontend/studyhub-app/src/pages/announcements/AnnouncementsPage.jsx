// AnnouncementsPage keeps the announcement feed and lightweight admin posting tools in one route folder.
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
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')

  // Keep announcements fresh across tabs without forcing users to manually refresh the page.
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
      if (error?.name !== 'AbortError') {
        setLoading(false)
      }
    }
  }

  useLivePolling(loadAnnouncements, {
    enabled: true,
    intervalMs: 20000,
  })

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

      if (!response.ok) {
        setPostError(data.error || 'Failed to post.')
        return
      }

      setAnnouncements((previousAnnouncements) => [data, ...previousAnnouncements])
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

  const navActions = isAdmin ? (
    <button
      onClick={() => setShowForm((current) => !current)}
      style={{ fontSize: 12, fontWeight: 700, color: '#fff', padding: '5px 13px', background: '#3b82f6', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: PAGE_FONT, display: 'flex', alignItems: 'center', gap: 5 }}
    >
      <IconPlus size={13} />
      {showForm ? 'Cancel' : 'Post Announcement'}
    </button>
  ) : null

  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'Announcements', to: '/announcements' }]} hideTabs actions={navActions} />} sidebar={<AppSidebar />}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Announcements</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>Official updates from the StudyHub team.</p>
      </div>

      {isAdmin && showForm ? (
        <form onSubmit={handlePost} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>New Announcement</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: PAGE_FONT, marginBottom: 10, outline: 'none' }}
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Body"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: PAGE_FONT, resize: 'vertical', outline: 'none', marginBottom: 10 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            Pin this announcement
          </label>
          {postError ? <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{postError}</div> : null}
          <button type="submit" disabled={posting} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: PAGE_FONT }}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </form>
      ) : null}

      {loading ? <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Loading…</div> : null}
      {!loading && announcements.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px dashed #cbd5e1', padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No announcements yet.</div>
        </div>
      ) : null}
      {announcements.map((announcement) => (announcement.pinned ? (
        <div key={announcement.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 18px', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e', letterSpacing: '.08em', marginBottom: 8 }}>PINNED</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>{announcement.title}</div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.65, marginBottom: 8 }}>{announcement.body}</div>
          <div style={{ fontSize: 11, color: '#b45309' }}>Posted by <strong>{announcement.author?.username}</strong> · {timeAgo(announcement.createdAt)}</div>
        </div>
      ) : (
        <div key={announcement.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(announcement.createdAt)}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>{announcement.title}</div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.65, marginBottom: 7 }}>{announcement.body}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>by <strong style={{ color: '#64748b' }}>{announcement.author?.username}</strong></div>
        </div>
      )))}
    </PageShell>
  )
}

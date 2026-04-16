// src/mobile/pages/MobileNotesPage.jsx
// Notes browser — paginated list with search, star toggle, and note preview.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from '../lib/animeCompat'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchNotes(page, search) {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (search) params.set('search', search)
  const res = await fetch(`${API}/api/notes?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load notes')
  return res.json()
}

/* ── Time formatting ───────────────────────────────────────────── */

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ── Note card ─────────────────────────────────────────────────── */

function NoteCard({ note, onTap }) {
  const preview = note.content ? note.content.replace(/[#*_`>\-[\]]/g, '').slice(0, 120) : ''

  return (
    <button type="button" className="mob-note-card" onClick={() => onTap(note.id)}>
      <div className="mob-note-card-top">
        <h3 className="mob-note-card-title">{note.title || 'Untitled'}</h3>
        {note.pinned && <span className="mob-note-card-pin" aria-label="Pinned" />}
      </div>

      {preview && <p className="mob-note-card-preview">{preview}</p>}

      <div className="mob-note-card-footer">
        {note.course?.code && <span className="mob-note-card-course">{note.course.code}</span>}
        {note.tags && note.tags.length > 0 && (
          <span className="mob-note-card-tag">{note.tags[0]}</span>
        )}
        <span className="mob-note-card-date">{formatDate(note.updatedAt || note.createdAt)}</span>
      </div>
    </button>
  )
}

/* ── Main component ────────────────────────────────────────────── */

export default function MobileNotesPage() {
  useSession() // ensure auth
  const navigate = useNavigate()

  const [notes, setNotes] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const listRef = useRef(null)
  const searchTimer = useRef(null)

  const load = useCallback(async (p, q) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchNotes(p, q)
      setNotes(data.notes || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page, search)
  }, [page, search, load])

  // Animate entrance
  useEffect(() => {
    if (loading || PREFERS_REDUCED || !listRef.current) return
    anime({
      targets: listRef.current.children,
      translateY: [12, 0],
      opacity: [0, 1],
      duration: 300,
      delay: anime.stagger(40),
      easing: 'easeOutCubic',
    })
  }, [loading])

  const handleSearch = useCallback((e) => {
    const val = e.target.value
    setInputValue(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setSearch(val)
    }, 350)
  }, [])

  const handleNoteTap = useCallback((id) => navigate(`/notes/${id}`), [navigate])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mob-notes">
      <MobileTopBar title="Notes" showBack />

      {/* Search bar */}
      <div className="mob-notes-search">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="mob-notes-search-icon"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="mob-notes-search-input"
          placeholder="Search notes..."
          value={inputValue}
          onChange={handleSearch}
        />
      </div>

      {loading ? (
        <div className="mob-notes-skeleton">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="mob-notes-skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="mob-feed-empty">
          <p className="mob-feed-empty-text">Could not load notes.</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="mob-feed-empty">
          <h3 className="mob-feed-empty-title">{search ? 'No results' : 'No notes yet'}</h3>
          <p className="mob-feed-empty-text">
            {search
              ? 'Try a different search term.'
              : 'Create notes from the web app to see them here.'}
          </p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="mob-notes-list">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} onTap={handleNoteTap} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mob-notes-pagination">
              <button
                type="button"
                className="mob-notes-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="mob-notes-page-info">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="mob-notes-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

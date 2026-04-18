// src/mobile/pages/MobileNoteDetail.jsx
// Read-only single-note viewer for the mobile shell.
//
// Used when a note row is tapped from MobileNotesPage or when a deep link
// like `getstudyhub://note/42` opens the app. Renders title, course tag,
// last-updated timestamp, and content. Edit / share / star actions are
// scoped for Wave 3 — this page is intentionally read-only so Wave 2 can
// ship without the persistence/conflict surface that the web NoteEditor
// owns.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API } from '../../config'
import MobileTopBar from '../components/MobileTopBar'

async function fetchNote(noteId) {
  const res = await fetch(`${API}/api/notes/${encodeURIComponent(noteId)}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'not_found' : 'load_failed')
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.note || data
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

export default function MobileNoteDetail() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchNote(noteId)
      setNote(data)
    } catch (err) {
      setError(err.status === 404 ? 'not_found' : 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    if (!noteId) return
    load()
  }, [noteId, load])

  if (loading) {
    return (
      <>
        <MobileTopBar title="Note" />
        <div
          style={{ padding: '40px 20px', textAlign: 'center' }}
          aria-busy="true"
          role="status"
          aria-label="Loading note"
        >
          <div className="mob-feed-spinner" style={{ margin: '0 auto' }} />
        </div>
      </>
    )
  }

  if (error === 'not_found') {
    return (
      <>
        <MobileTopBar title="Note" />
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-text-muted)' }}>
          <h2 style={{ marginBottom: 8, color: 'var(--sh-text)' }}>Note not found</h2>
          <p>This note may have been deleted or you don&apos;t have access.</p>
          <button
            type="button"
            className="mob-auth-submit"
            onClick={() => navigate('/m/notes')}
            style={{ marginTop: 20 }}
          >
            Back to notes
          </button>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <MobileTopBar title="Note" />
        <div role="alert" style={{ padding: 24, textAlign: 'center', color: 'var(--sh-text)' }}>
          <p>Couldn&apos;t load this note.</p>
          <button
            type="button"
            className="mob-auth-submit"
            onClick={load}
            style={{ marginTop: 16 }}
          >
            Try again
          </button>
        </div>
      </>
    )
  }

  if (!note) return null

  const updatedAt = note.updatedAt || note.createdAt
  const tags = Array.isArray(note.tags) ? note.tags : []

  return (
    <>
      <MobileTopBar title={note.title || 'Untitled note'} />

      <article style={{ padding: '16px 16px 80px' }}>
        <header style={{ marginBottom: 16 }}>
          <h1
            style={{
              fontSize: 22,
              lineHeight: 1.3,
              fontWeight: 700,
              color: 'var(--sh-text)',
              margin: 0,
            }}
          >
            {note.title || 'Untitled note'}
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 8,
              fontSize: 12,
              color: 'var(--sh-text-muted)',
            }}
          >
            {note.course?.code && (
              <span
                style={{
                  background: 'var(--sh-soft)',
                  color: 'var(--sh-text)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {note.course.code}
              </span>
            )}
            {updatedAt && <span>{formatDate(updatedAt)}</span>}
            {note.private && (
              <span style={{ color: 'var(--sh-text-muted)' }} aria-label="Private note">
                Private
              </span>
            )}
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11,
                    color: 'var(--sh-text-muted)',
                    background: 'var(--sh-soft)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--sh-text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {note.content || (
            <span style={{ color: 'var(--sh-text-muted)', fontStyle: 'italic' }}>
              This note is empty.
            </span>
          )}
        </div>
      </article>
    </>
  )
}

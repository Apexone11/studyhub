/* ═══════════════════════════════════════════════════════════════════════════
 * NoteViewerPage.jsx — Read-only view for shared notes at /notes/:id
 * Features: like/dislike, star, download tracking, comments
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import ReportModal from '../../components/ReportModal'
import ModerationBanner from '../../components/ModerationBanner'
import PendingReviewBanner from '../../components/PendingReviewBanner'
import UserAvatar from '../../components/UserAvatar'
import { PAGE_FONT } from '../shared/pageUtils'
import { MarkdownPreview, wordCount, countWordsFromHtml } from './notesConstants'
import NoteCommentSection from './NoteCommentSection'
import { useNoteViewer } from './useNoteViewer'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function isHtmlContent(content) {
  if (!content) return false
  return /<[a-z][\s\S]*>/i.test(content)
}

function downloadNote(title, content) {
  const isHtml = isHtmlContent(content)
  const mimeType = isHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8'
  const ext = isHtml ? '.html' : '.md'
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'note').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Inline SVG icons ────────────────────────────────────────────────────

function IconThumbUp({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

function IconThumbDown({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}

function IconStar({ size = 16, filled }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconDownload({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

const actionBtnStyle = (active, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  borderRadius: 999,
  border: '1px solid var(--sh-border)',
  background: active ? color : 'var(--sh-surface)',
  color: active ? '#fff' : 'var(--sh-subtext)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: PAGE_FONT,
  transition: 'all 0.15s ease',
})

export default function NoteViewerPage() {
  const { user } = useSession()
  const { note, loading, error } = useNoteViewer()
  const [reportOpen, setReportOpen] = useState(false)

  // Local social state
  const [starred, setStarred] = useState(null)
  const [starCount, setStarCount] = useState(null)
  const [reactionState, setReactionState] = useState(null)
  const [downloadCount, setDownloadCount] = useState(null)

  // Initialize from note data
  const isStarred = starred ?? note?.starred ?? false
  const stars = starCount ?? note?.starCount ?? 0
  const likes = reactionState?.likes ?? note?.reactionCounts?.like ?? 0
  const dislikes = reactionState?.dislikes ?? note?.reactionCounts?.dislike ?? 0
  const userReaction =
    reactionState?.userReaction !== undefined
      ? reactionState.userReaction
      : (note?.userReaction ?? null)
  const downloads = downloadCount ?? note?.downloads ?? 0

  const handleStar = useCallback(async () => {
    if (!user || !note) return
    const wasStarred = isStarred
    setStarred(!wasStarred)
    setStarCount((prev) => (prev ?? stars) + (wasStarred ? -1 : 1))

    try {
      await fetch(`${API}/api/notes/${note.id}/star`, {
        method: wasStarred ? 'DELETE' : 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
    } catch {
      setStarred(wasStarred)
      setStarCount((prev) => (prev ?? stars) + (wasStarred ? 1 : -1))
    }
  }, [user, note, isStarred, stars])

  const handleReact = useCallback(
    async (type) => {
      if (!user || !note) return
      const oldType = userReaction
      const newType = oldType === type ? null : type
      let newLikes = likes
      let newDislikes = dislikes
      if (oldType === 'like') newLikes--
      else if (oldType === 'dislike') newDislikes--
      if (newType === 'like') newLikes++
      else if (newType === 'dislike') newDislikes++

      setReactionState({ likes: newLikes, dislikes: newDislikes, userReaction: newType })

      try {
        const res = await fetch(`${API}/api/notes/${note.id}/react`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ type }),
        })
        if (res.ok) {
          const data = await res.json()
          setReactionState({
            likes: data.reactionCounts.like,
            dislikes: data.reactionCounts.dislike,
            userReaction: data.userReaction,
          })
        }
      } catch {
        setReactionState({ likes, dislikes, userReaction: oldType })
      }
    },
    [user, note, userReaction, likes, dislikes],
  )

  const handleDownload = useCallback(async () => {
    if (!note) return
    downloadNote(note.title, note.content)
    setDownloadCount((prev) => (prev ?? downloads) + 1)
    try {
      await fetch(`${API}/api/notes/${note.id}/download`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      /* silent */
    }
  }, [note, downloads])

  if (loading) {
    return (
      <div
        style={{
          fontFamily: PAGE_FONT,
          padding: 40,
          textAlign: 'center',
          color: 'var(--sh-muted)',
        }}
      >
        Loading...
      </div>
    )
  }

  if (error || !note) {
    return (
      <div style={{ fontFamily: PAGE_FONT, padding: 40, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--sh-heading)', marginBottom: 8 }}>Note not found</h2>
        <p style={{ color: 'var(--sh-muted)', marginBottom: 16 }}>
          This note doesn&apos;t exist or is private.
        </p>
        <Link to="/notes" style={{ color: 'var(--sh-info-text)', textDecoration: 'none' }}>
          Back to My Notes
        </Link>
      </div>
    )
  }

  const words = isHtmlContent(note.content)
    ? countWordsFromHtml(note.content)
    : wordCount(note.content)

  return (
    <div style={{ fontFamily: PAGE_FONT, maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/notes"
            style={{ color: 'var(--sh-muted)', textDecoration: 'none', fontSize: 13 }}
          >
            Notes
          </Link>
          <span style={{ color: 'var(--sh-slate-300)' }}>/</span>
        </div>

        <h1
          style={{ fontSize: 26, fontWeight: 800, color: 'var(--sh-heading)', margin: '0 0 12px' }}
        >
          {note.title}
        </h1>

        {/* Author + metadata row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 13,
            color: 'var(--sh-subtext)',
          }}
        >
          {note.author && (
            <Link
              to={`/users/${note.author.username}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--sh-info-text)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              <UserAvatar user={note.author} size={24} />
              {note.author.username}
            </Link>
          )}
          {note.course && (
            <span
              style={{
                background: 'var(--sh-soft)',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {note.course.code}
            </span>
          )}
          <span>{formatDate(note.updatedAt)}</span>
          <span>
            {words} {words === 1 ? 'word' : 'words'}
          </span>
          {!note.private && (
            <span
              style={{
                background: 'var(--sh-success-bg)',
                color: 'var(--sh-success-text)',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Shared
            </span>
          )}
        </div>
      </div>

      {/* Moderation banner (owner only) */}
      {note.isOwner && <ModerationBanner status={note.moderationStatus} />}
      {note.moderationStatus === 'pending_review' && note.isOwner && <PendingReviewBanner />}

      {/* Social actions bar */}
      {!note.private && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Like */}
          {user && (
            <button
              type="button"
              onClick={() => handleReact('like')}
              style={actionBtnStyle(userReaction === 'like', 'var(--sh-success)')}
            >
              <IconThumbUp size={15} />
              Helpful {likes > 0 ? likes : ''}
            </button>
          )}
          {/* Dislike */}
          {user && (
            <button
              type="button"
              onClick={() => handleReact('dislike')}
              style={actionBtnStyle(userReaction === 'dislike', 'var(--sh-danger)')}
            >
              <IconThumbDown size={15} />
              Needs work {dislikes > 0 ? dislikes : ''}
            </button>
          )}
          {/* Star */}
          {user && (
            <button
              type="button"
              onClick={handleStar}
              style={actionBtnStyle(isStarred, 'var(--sh-warning)')}
            >
              <IconStar size={15} filled={isStarred} />
              {stars} {stars === 1 ? 'star' : 'stars'}
            </button>
          )}
          {/* Download */}
          {note.allowDownloads && (
            <button
              type="button"
              onClick={handleDownload}
              style={actionBtnStyle(false, 'var(--sh-info)')}
            >
              <IconDownload size={15} />
              {downloads > 0 ? `${downloads} downloads` : 'Download'}
            </button>
          )}
          {/* Owner: Open in Editor */}
          {note.isOwner && (
            <Link
              to={`/notes?select=${note.id}`}
              style={{
                ...actionBtnStyle(false, 'var(--sh-info)'),
                textDecoration: 'none',
              }}
            >
              Open in Editor
            </Link>
          )}
          {/* Report */}
          {user && !note.isOwner && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={actionBtnStyle(false, 'var(--sh-warning)')}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Report
            </button>
          )}
        </div>
      )}

      {/* Non-shared notes: just show editor link and download */}
      {note.private && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {note.isOwner && (
            <Link
              to={`/notes?select=${note.id}`}
              style={{ ...actionBtnStyle(false, 'var(--sh-info)'), textDecoration: 'none' }}
            >
              Open in Editor
            </Link>
          )}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 10,
          padding: '24px 28px',
          minHeight: 200,
        }}
      >
        {note.content?.trim() ? (
          <MarkdownPreview content={note.content} />
        ) : (
          <p style={{ color: 'var(--sh-muted)', fontStyle: 'italic' }}>This note is empty.</p>
        )}
      </div>

      {/* Comments (visible on shared notes) */}
      {!note.private && (
        <NoteCommentSection
          noteId={note.id}
          isOwner={note.isOwner}
          user={user}
          noteContent={note.content}
        />
      )}

      <ReportModal
        open={reportOpen}
        targetType="note"
        targetId={note.id}
        onClose={() => setReportOpen(false)}
      />
    </div>
  )
}

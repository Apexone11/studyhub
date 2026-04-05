/* ═══════════════════════════════════════════════════════════════════════════
 * NoteViewerPage.jsx — Read-only view for shared notes at /notes/:id
 * Owners see an "Open in Editor" link back to /notes?select=:id
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import ReportModal from '../../components/ReportModal'
import ModerationBanner from '../../components/ModerationBanner'
import PendingReviewBanner from '../../components/PendingReviewBanner'
import { PAGE_FONT } from '../shared/pageUtils'
import { MarkdownPreview, wordCount, countWordsFromHtml } from './notesConstants'
import NoteCommentSection from './NoteCommentSection'
import { useNoteViewer } from './useNoteViewer'
import { useNoteComments } from './useNoteComments'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function isHtmlContent(content) {
  return content && content.trim().includes('<') && !(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(content.trim()))
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

export default function NoteViewerPage() {
  const { user } = useSession()
  const { note, loading, error } = useNoteViewer()
  const { reactToComment: handleReactToComment } = useNoteComments(note?.id)
  const [reportOpen, setReportOpen] = useState(false)

  if (loading) {
    return (
      <div style={{ fontFamily: PAGE_FONT, padding: 40, textAlign: 'center', color: 'var(--sh-slate-400)' }}>
        Loading…
      </div>
    )
  }

  if (error || !note) {
    return (
      <div style={{ fontFamily: PAGE_FONT, padding: 40, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--sh-slate-700)', marginBottom: 8 }}>Note not found</h2>
        <p style={{ color: 'var(--sh-slate-400)', marginBottom: 16 }}>
          This note doesn&apos;t exist or is private.
        </p>
        <Link to="/notes" style={{ color: 'var(--sh-info-text)', textDecoration: 'none' }}>
          Back to My Notes
        </Link>
      </div>
    )
  }

  const words = isHtmlContent(note.content) ? countWordsFromHtml(note.content) : wordCount(note.content)

  return (
    <div style={{ fontFamily: PAGE_FONT, maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Link to="/notes" style={{ color: 'var(--sh-slate-400)', textDecoration: 'none', fontSize: 13 }}>
            Notes
          </Link>
          <span style={{ color: 'var(--sh-slate-300)' }}>/</span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--sh-slate-800)', margin: '0 0 12px' }}>
          {note.title}
        </h1>

        {/* Metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--sh-slate-500)' }}>
          {note.author && (
            <Link
              to={`/users/${note.author.username}`}
              style={{ color: 'var(--sh-info-text)', textDecoration: 'none', fontWeight: 600 }}
            >
              {note.author.username}
            </Link>
          )}
          {note.course && (
            <span style={{
              background: 'var(--sh-soft)',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}>
              {note.course.code}
            </span>
          )}
          <span>{formatDate(note.updatedAt)}</span>
          <span>{words} {words === 1 ? 'word' : 'words'}</span>
          {!note.private && (
            <span style={{
              background: 'var(--sh-success-bg)',
              color: 'var(--sh-success-text)',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}>
              Shared
            </span>
          )}
        </div>
      </div>

      {/* Moderation banner (owner only) */}
      {note.isOwner && <ModerationBanner status={note.moderationStatus} />}
      {note.moderationStatus === 'pending_review' && note.isOwner && (
        <PendingReviewBanner />
      )}

      {/* Actions bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {note.isOwner && (
          <Link
            to={`/notes?select=${note.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--sh-info-bg)',
              color: 'var(--sh-info-text)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Open in Editor
          </Link>
        )}
        {note.allowDownloads && !note.private && (
          <button
            type="button"
            onClick={() => downloadNote(note.title, note.content)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--sh-soft)',
              color: 'var(--sh-slate-700)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Download
          </button>
        )}
        {user && !note.isOwner && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--sh-soft)',
              color: 'var(--sh-warning-text)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            Report
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 10,
        padding: '24px 28px',
        minHeight: 200,
      }}>
        {note.content?.trim() ? (
          <MarkdownPreview content={note.content} />
        ) : (
          <p style={{ color: 'var(--sh-slate-400)', fontStyle: 'italic' }}>This note is empty.</p>
        )}
      </div>

      {/* Comments (visible on shared notes) */}
      {!note.private && (
        <NoteCommentSection noteId={note.id} isOwner={note.isOwner} user={user} noteContent={note.content} onReactToComment={handleReactToComment} />
      )}

      <ReportModal open={reportOpen} targetType="note" targetId={note.id} onClose={() => setReportOpen(false)} />
    </div>
  )
}

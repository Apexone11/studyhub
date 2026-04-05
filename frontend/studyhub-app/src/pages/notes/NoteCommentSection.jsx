/* ═══════════════════════════════════════════════════════════════════════════
 * NoteCommentSection.jsx — Comment thread for note viewer pages
 *
 * Features: expand/collapse, inline anchor badges, resolve/unresolve,
 * @mention rendering, delete by author/owner/admin.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../components/MentionText'
import { PAGE_FONT, timeAgo } from '../shared/pageUtils'
import { useNoteComments } from './useNoteComments'

/**
 * Check if an anchor still exists in the note content. Returns:
 * - 'found' if the anchor text exists at or near its original position
 * - 'moved' if the anchor text exists elsewhere in the content
 * - 'orphaned' if the anchor text can no longer be found
 */
function resolveAnchorStatus(comment, noteContent) {
  if (!comment.anchorText || !noteContent) return 'found'
  const text = comment.anchorText
  const offset = comment.anchorOffset ?? -1

  // Exact position match (within ±20 chars to handle minor edits)
  if (offset >= 0) {
    const searchStart = Math.max(0, offset - 20)
    const idx = noteContent.indexOf(text, searchStart)
    if (idx >= 0 && idx <= offset + 20) return 'found'
  }

  // Context-based re-matching
  if (comment.anchorContext) {
    try {
      const ctx = typeof comment.anchorContext === 'string' ? JSON.parse(comment.anchorContext) : comment.anchorContext
      if (ctx.prefix || ctx.suffix) {
        const searchStr = (ctx.prefix || '') + text + (ctx.suffix || '')
        if (noteContent.includes(searchStr)) return 'found'
        // Partial context match (prefix only or suffix only)
        if (ctx.prefix && noteContent.includes(ctx.prefix + text)) return 'found'
        if (ctx.suffix && noteContent.includes(text + ctx.suffix)) return 'found'
      }
    } catch { /* invalid context JSON — fall through */ }
  }

  // Fallback: text exists somewhere
  if (noteContent.includes(text)) return 'moved'

  return 'orphaned'
}

function CommentReactionsNote({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  const thumbsUpSvg = (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: 3 }}>
      <path d="M2 10.5a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0v-6zM6 10.333v5.43a2 2 0 0 0 .97 1.679V17.5a.5.5 0 1 0 1 0v-.04a2 2 0 0 0 .97-1.679v-.745a2 2 0 0 0 .211-.126c1.04-.678 1.946-.122 2.469.856.653 1.31 1.422 2.105 2.188 2.01.374-.056.695-.481 1.088-1.461.36-.896.748-2.144.948-2.979.179-.633.45-1.559.838-2.form.158-.34.355-.638.57-.88a3 3 0 0 0 .281-1.249A3 3 0 0 0 15.3 9h1.023a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75H15.3a3 3 0 0 0-2.973 2.5H13a.75.75 0 0 0 0 1.5h-.227c.038.58.076 1.254.076 2v1.5a2 2 0 0 0 .053.477c-.038.58-.076 1.254-.076 2 0 .888.106 1.72.282 2.38.168.594.411 1.084.693 1.38" />
    </svg>
  )

  const thumbsDownSvg = (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: 3 }}>
      <path d="M18 9.5a1.5 1.5 0 1 1-3 0v-6a1.5 1.5 0 0 1 3 0v6zM14 9.667v-5.43a2 2 0 0 1-.97-1.679V2.5a.5.5 0 1 1-1 0v.04a2 2 0 0 1-.97 1.679v.745a2 2 0 0 1-.211.126c-1.04.678-1.946.122-2.469-.856-.653-1.31-1.422-2.105-2.188-2.01-.374.056-.695.481-1.088 1.461-.36.896-.748 2.144-.948 2.979-.179.633-.45 1.559-.838 2.form-.158.34-.355.638-.57.88a3 3 0 0 1-.281 1.249A3 3 0 0 1 4.7 11H3.75a.75.75 0 0 1-.75-.75V7.25a.75.75 0 0 1 .75-.75H4.7a3 3 0 0 1 2.973-2.5h.227a.75.75 0 0 1 0 1.5H7a2 2 0 0 1-.053.477c.038.58.076 1.254.076 2v1.5a2 2 0 0 1-.053.477c-.038.58-.076 1.254-.076 2 0 .888-.106 1.72-.282 2.38-.168.594-.411 1.084-.693 1.38" />
    </svg>
  )

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => onReact(commentId, 'like')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          padding: '3px 6px',
          border: 'none',
          borderRadius: '4px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '11px',
          color: userReaction === 'like' ? 'var(--sh-brand)' : 'var(--sh-muted)',
          transition: 'color 0.2s',
          fontFamily: PAGE_FONT,
        }}
      >
        {thumbsUpSvg}
        {likes > 0 ? likes : ''}
      </button>
      <button
        type="button"
        onClick={() => onReact(commentId, 'dislike')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          padding: '3px 6px',
          border: 'none',
          borderRadius: '4px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '11px',
          color: userReaction === 'dislike' ? 'var(--sh-brand)' : 'var(--sh-muted)',
          transition: 'color 0.2s',
          fontFamily: PAGE_FONT,
        }}
      >
        {thumbsDownSvg}
        {dislikes > 0 ? dislikes : ''}
      </button>
    </div>
  )
}

export default function NoteCommentSection({ noteId, isOwner, user, noteContent, onReactToComment }) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const {
    comments, total, loading, posting, error, setError,
    loadComments, postComment, resolveComment, deleteComment,
  } = useNoteComments(noteId)

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) loadComments()
  }

  const handlePost = async () => {
    const text = draft.trim()
    if (!text) return
    if (text.length > 500) { setError('Comment must be 500 characters or fewer.'); return }
    const ok = await postComment(text)
    if (ok) setDraft('')
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: PAGE_FONT, fontSize: 14, fontWeight: 600,
          color: 'var(--sh-slate-600)', display: 'flex', alignItems: 'center', gap: 6, padding: 0,
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '\u25BE' : '\u25B8'}</span>
        {total} {total === 1 ? 'comment' : 'comments'}
      </button>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {/* Comment input (only for logged-in users) */}
          {user && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--sh-info-bg)', color: 'var(--sh-info-text)',
                display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
              }}>
                {(user.username || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); if (error) setError('') }}
                  placeholder="Write a comment..."
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    border: '1px solid var(--sh-border)', borderRadius: 8,
                    padding: '8px 12px', fontFamily: PAGE_FONT, fontSize: 13,
                    color: 'var(--sh-slate-700)', outline: 'none',
                    background: 'var(--sh-surface)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: draft.length > 500 ? 'var(--sh-danger)' : 'var(--sh-slate-400)' }}>
                    {draft.length}/500
                  </span>
                  <button
                    type="button"
                    onClick={handlePost}
                    disabled={posting || !draft.trim()}
                    style={{
                      padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, fontFamily: PAGE_FONT,
                      background: draft.trim() && !posting ? 'var(--sh-brand, #3b82f6)' : 'var(--sh-soft)',
                      color: draft.trim() && !posting ? '#fff' : 'var(--sh-slate-400)',
                      transition: 'all .15s',
                    }}
                  >
                    {posting ? 'Posting...' : 'Comment'}
                  </button>
                </div>
                {error && <div style={{ fontSize: 12, color: 'var(--sh-danger)', marginTop: 4 }}>{error}</div>}
              </div>
            </div>
          )}

          {/* Comment list */}
          {loading && (
            <div style={{ fontSize: 13, color: 'var(--sh-slate-400)', padding: '8px 0' }}>Loading comments...</div>
          )}
          {!loading && comments.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--sh-slate-400)', padding: '8px 0' }}>
              No comments yet.{user ? ' Be the first!' : ''}
            </div>
          )}
          {!loading && comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  user={user}
                  isNoteOwner={isOwner}
                  noteContent={noteContent}
                  noteId={noteId}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                  onReact={user && onReactToComment ? onReactToComment : null}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommentItem({ comment, user, isNoteOwner, noteContent, onResolve, onDelete, onReact }) {
  const anchorStatus = resolveAnchorStatus(comment, noteContent)
  const canDelete = user && (
    user.id === comment.author?.id
    || isNoteOwner
    || user.role === 'admin'
  )
  const canResolve = isNoteOwner || (user && user.role === 'admin')

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 12px',
      background: comment.resolved ? 'var(--sh-soft)' : 'var(--sh-surface)',
      border: '1px solid var(--sh-border)', borderRadius: 8,
      opacity: comment.resolved ? 0.7 : 1,
      transition: 'opacity .15s',
    }}>
      {/* Avatar */}
      {comment.author?.username ? (
        <Link to={`/users/${comment.author.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--sh-info-bg)', color: 'var(--sh-info-text)',
            display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
          }}>
            {comment.author.username[0].toUpperCase()}
          </div>
        </Link>
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--sh-soft)', display: 'grid', placeItems: 'center',
          fontSize: 12, color: 'var(--sh-slate-400)',
        }}>?</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header: author + time + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {comment.author?.username ? (
              <Link
                to={`/users/${comment.author.username}`}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-slate-700)', textDecoration: 'none' }}
              >
                {comment.author.username}
              </Link>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-slate-500)' }}>Unknown</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--sh-slate-400)' }}>{timeAgo(comment.createdAt)}</span>
            {comment.resolved && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)',
              }}>Resolved</span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {canResolve && (
              <button
                type="button"
                onClick={() => onResolve(comment.id, !comment.resolved)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, padding: '2px 6px',
                  color: comment.resolved ? 'var(--sh-warning-text)' : 'var(--sh-success-text)',
                  fontFamily: PAGE_FONT,
                }}
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, padding: '2px 6px',
                  color: 'var(--sh-danger-text)', fontFamily: PAGE_FONT,
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Anchor badge (if inline comment) */}
        {comment.anchorText && (
          <div style={{
            fontSize: 12, fontStyle: 'italic',
            color: anchorStatus === 'orphaned' ? 'var(--sh-danger-text)' : 'var(--sh-slate-500)',
            padding: '4px 8px', marginBottom: 6,
            background: anchorStatus === 'orphaned' ? 'var(--sh-danger-bg)' : 'var(--sh-warning-bg)',
            borderRadius: 4,
            borderLeft: `3px solid ${anchorStatus === 'orphaned' ? 'var(--sh-danger-border)' : 'var(--sh-warning-border)'}`,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            &ldquo;{comment.anchorText}&rdquo;
            {anchorStatus === 'orphaned' && (
              <span style={{ fontSize: 10, fontStyle: 'normal', fontWeight: 600, marginLeft: 6 }}>
                (text changed)
              </span>
            )}
            {anchorStatus === 'moved' && (
              <span style={{ fontSize: 10, fontStyle: 'normal', fontWeight: 600, marginLeft: 6, color: 'var(--sh-info-text)' }}>
                (moved)
              </span>
            )}
          </div>
        )}

        {/* Comment body */}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--sh-slate-700)' }}>
          <MentionText text={comment.content} />
        </p>

        {/* Reactions */}
        {onReact ? (
          <CommentReactionsNote
            commentId={comment.id}
            reactionCounts={comment.reactionCounts}
            userReaction={comment.userReaction}
            onReact={onReact}
          />
        ) : null}
      </div>
    </div>
  )
}

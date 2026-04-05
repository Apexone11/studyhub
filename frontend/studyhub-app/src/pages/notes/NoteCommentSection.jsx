/* ═══════════════════════════════════════════════════════════════════════════
 * NoteCommentSection.jsx — Comment thread for note viewer pages
 *
 * Features: expand/collapse, sub-comments (replies), collapsible reply
 * threads, inline anchor badges, resolve/unresolve, UserAvatar, reactions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../components/MentionText'
import UserAvatar from '../../components/UserAvatar'
import { PAGE_FONT, timeAgo } from '../shared/pageUtils'
import { useNoteComments } from './useNoteComments'

/**
 * Check if an anchor still exists in the note content.
 */
function resolveAnchorStatus(comment, noteContent) {
  if (!comment.anchorText || !noteContent) return 'found'
  const text = comment.anchorText
  const offset = comment.anchorOffset ?? -1

  if (offset >= 0) {
    const searchStart = Math.max(0, offset - 20)
    const idx = noteContent.indexOf(text, searchStart)
    if (idx >= 0 && idx <= offset + 20) return 'found'
  }

  if (comment.anchorContext) {
    try {
      const ctx = typeof comment.anchorContext === 'string' ? JSON.parse(comment.anchorContext) : comment.anchorContext
      if (ctx.prefix || ctx.suffix) {
        const searchStr = (ctx.prefix || '') + text + (ctx.suffix || '')
        if (noteContent.includes(searchStr)) return 'found'
        if (ctx.prefix && noteContent.includes(ctx.prefix + text)) return 'found'
        if (ctx.suffix && noteContent.includes(text + ctx.suffix)) return 'found'
      }
    } catch { /* invalid context JSON */ }
  }

  if (noteContent.includes(text)) return 'moved'
  return 'orphaned'
}

// ── Reaction buttons ────────────────────────────────────────────────────

function CommentReactions({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  const btnStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    border: 'none',
    borderRadius: 6,
    background: active ? 'var(--sh-brand-bg, var(--sh-info-bg))' : 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    color: active ? 'var(--sh-brand)' : 'var(--sh-muted)',
    transition: 'all 0.15s',
    fontFamily: PAGE_FONT,
  })

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
      <button type="button" onClick={() => onReact(commentId, 'like')} style={btnStyle(userReaction === 'like')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
        {likes > 0 ? likes : ''}
      </button>
      <button type="button" onClick={() => onReact(commentId, 'dislike')} style={btnStyle(userReaction === 'dislike')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
        {dislikes > 0 ? dislikes : ''}
      </button>
    </div>
  )
}

// ── Comment input ───────────────────────────────────────────────────────

function CommentInput({ user, placeholder, onSubmit, posting }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const handlePost = async () => {
    const text = draft.trim()
    if (!text) return
    if (text.length > 500) { setError('Comment must be 500 characters or fewer.'); return }
    const ok = await onSubmit(text)
    if (ok) { setDraft(''); setError('') }
  }

  if (!user) return null

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <UserAvatar user={user} size={32} />
      <div style={{ flex: 1 }}>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError('') }}
          placeholder={placeholder || 'Write a comment...'}
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            border: '1px solid var(--sh-border)', borderRadius: 10,
            padding: '10px 14px', fontFamily: PAGE_FONT, fontSize: 13,
            color: 'var(--sh-text)', outline: 'none',
            background: 'var(--sh-surface)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: draft.length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)' }}>
            {draft.length}/500
          </span>
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !draft.trim()}
            style={{
              padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: PAGE_FONT,
              background: draft.trim() && !posting ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: draft.trim() && !posting ? '#fff' : 'var(--sh-muted)',
              transition: 'all .15s',
            }}
          >
            {posting ? 'Posting...' : 'Comment'}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--sh-danger)', marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}

// ── Single comment item ─────────────────────────────────────────────────

function CommentItem({ comment, user, isNoteOwner, noteContent, noteId, onResolve, onDelete, onReact, onReply, isReply = false }) {
  const anchorStatus = !isReply ? resolveAnchorStatus(comment, noteContent) : 'found'
  const canDelete = user && (
    user.id === comment.author?.id
    || isNoteOwner
    || user.role === 'admin'
  )
  const canResolve = !isReply && (isNoteOwner || (user && user.role === 'admin'))

  const [showReplyInput, setShowReplyInput] = useState(false)
  const [repliesCollapsed, setRepliesCollapsed] = useState(false)
  const [replyPosting, setReplyPosting] = useState(false)
  const replies = comment.replies || []

  const handleReplySubmit = async (text) => {
    setReplyPosting(true)
    const ok = await onReply(text, comment.id)
    setReplyPosting(false)
    if (ok) setShowReplyInput(false)
    return ok
  }

  return (
    <div style={{ marginBottom: isReply ? 0 : 4 }}>
      <div style={{
        display: 'flex', gap: 10, padding: '12px 14px',
        background: comment.resolved ? 'var(--sh-soft)' : 'var(--sh-surface)',
        border: '1px solid var(--sh-border)', borderRadius: 10,
        opacity: comment.resolved ? 0.7 : 1,
        transition: 'opacity .15s',
      }}>
        {/* Avatar */}
        {comment.author?.username ? (
          <Link to={`/users/${comment.author.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <UserAvatar user={comment.author} size={isReply ? 26 : 30} />
          </Link>
        ) : (
          <div style={{
            width: isReply ? 26 : 30, height: isReply ? 26 : 30, borderRadius: '50%', flexShrink: 0,
            background: 'var(--sh-soft)', display: 'grid', placeItems: 'center',
            fontSize: 12, color: 'var(--sh-muted)',
          }}>?</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              {comment.author?.username ? (
                <Link
                  to={`/users/${comment.author.username}`}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}
                >
                  {comment.author.username}
                </Link>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-muted)' }}>Unknown</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{timeAgo(comment.createdAt)}</span>
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
          {!isReply && comment.anchorText && (
            <div style={{
              fontSize: 12, fontStyle: 'italic',
              color: anchorStatus === 'orphaned' ? 'var(--sh-danger-text)' : 'var(--sh-subtext)',
              padding: '4px 8px', marginBottom: 6,
              background: anchorStatus === 'orphaned' ? 'var(--sh-danger-bg)' : 'var(--sh-warning-bg)',
              borderRadius: 6,
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
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--sh-text)' }}>
            <MentionText text={comment.content} />
          </p>

          {/* Reactions + Reply button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {onReact && (
              <CommentReactions
                commentId={comment.id}
                reactionCounts={comment.reactionCounts}
                userReaction={comment.userReaction}
                onReact={onReact}
              />
            )}
            {user && !isReply && onReply && (
              <button
                type="button"
                onClick={() => setShowReplyInput(!showReplyInput)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', marginTop: 8,
                  fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)',
                  fontFamily: PAGE_FONT, padding: '2px 6px',
                }}
              >
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reply input */}
      {showReplyInput && (
        <div style={{ marginLeft: 40, marginTop: 8 }}>
          <CommentInput
            user={user}
            placeholder="Write a reply..."
            onSubmit={handleReplySubmit}
            posting={replyPosting}
          />
        </div>
      )}

      {/* Replies (sub-comments) */}
      {!isReply && replies.length > 0 && (
        <div style={{ marginLeft: 40, marginTop: 8 }}>
          {/* Collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setRepliesCollapsed(!repliesCollapsed)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)',
              fontFamily: PAGE_FONT, padding: '4px 0', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: repliesCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {repliesCollapsed ? `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>

          {!repliesCollapsed && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              borderLeft: '2px solid var(--sh-border)',
              paddingLeft: 14,
            }}>
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  user={user}
                  isNoteOwner={isNoteOwner}
                  noteContent={noteContent}
                  noteId={noteId}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onReact={onReact}
                  onReply={null}
                  isReply
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main comment section ────────────────────────────────────────────────

export default function NoteCommentSection({ noteId, isOwner, user, noteContent, onReactToComment }) {
  const [expanded, setExpanded] = useState(false)
  const {
    comments, total, loading, posting,
    loadComments, postComment, resolveComment, deleteComment,
  } = useNoteComments(noteId)

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) loadComments()
  }

  const handlePost = async (text) => {
    return postComment(text)
  }

  const handleReply = async (text, parentId) => {
    return postComment(text, { parentId })
  }

  return (
    <div style={{ marginTop: 28 }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: PAGE_FONT, fontSize: 14, fontWeight: 700,
          color: 'var(--sh-subtext)', display: 'flex', alignItems: 'center', gap: 8, padding: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {total} {total === 1 ? 'comment' : 'comments'}
      </button>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          {/* Comment input */}
          <CommentInput user={user} onSubmit={handlePost} posting={posting} />

          {/* Comment list */}
          {loading && (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>Loading comments...</div>
          )}
          {!loading && comments.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>
              No comments yet.{user ? ' Be the first!' : ''}
            </div>
          )}
          {!loading && comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  onReply={handleReply}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

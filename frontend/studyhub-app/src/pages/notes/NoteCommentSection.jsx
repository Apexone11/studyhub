/* ═══════════════════════════════════════════════════════════════════════════
 * NoteCommentSection.jsx — Comment thread for note viewer pages
 *
 * Features: expand/collapse, 3-level nesting, pill bubble style, inline
 * editing, anchor badges, resolve/unresolve, UserAvatar, text-link reactions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import GifSearchPanel from '../../components/GifSearchPanel'
import MentionText from '../../components/MentionText'
import UserAvatar from '../../components/UserAvatar'
import { PAGE_FONT, timeAgo } from '../shared/pageUtils'
import { useNoteComments } from './useNoteComments'

const EDIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const EDIT_STATUS_POLL_MS = 30 * 1000
const AVATAR_SIZES = [34, 28, 24]
const MAX_VISIBLE_REPLIES = 2

const composerGifCardStyle = {
  position: 'relative',
  width: 'min(100%, 220px)',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
}

const composerGifImageStyle = {
  width: '100%',
  maxHeight: 160,
  display: 'block',
  objectFit: 'cover',
}

const postedGifImageStyle = {
  width: 'min(100%, 260px)',
  maxHeight: 220,
  display: 'block',
  objectFit: 'cover',
  borderRadius: 10,
  background: 'var(--sh-soft)',
}

function createGifAttachment(gif) {
  return {
    url: gif.full,
    type: 'gif',
    name: gif.title || 'GIF',
  }
}

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
      const ctx =
        typeof comment.anchorContext === 'string'
          ? JSON.parse(comment.anchorContext)
          : comment.anchorContext
      if (ctx.prefix || ctx.suffix) {
        const searchStr = (ctx.prefix || '') + text + (ctx.suffix || '')
        if (noteContent.includes(searchStr)) return 'found'
        if (ctx.prefix && noteContent.includes(ctx.prefix + text)) return 'found'
        if (ctx.suffix && noteContent.includes(text + ctx.suffix)) return 'found'
      }
    } catch {
      /* invalid context JSON */
    }
  }

  if (noteContent.includes(text)) return 'moved'
  return 'orphaned'
}

// ── Text-link reaction buttons ─────────────────────────────────────────

function CommentReactions({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  const btnStyle = (type) => {
    const active = userReaction === type
    return {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      fontSize: 12,
      fontWeight: 500,
      fontFamily: PAGE_FONT,
      color: active
        ? type === 'like'
          ? 'var(--sh-brand)'
          : 'var(--sh-danger)'
        : 'var(--sh-muted)',
      transition: 'color 0.15s',
    }
  }

  return (
    <>
      <button type="button" onClick={() => onReact(commentId, 'like')} style={btnStyle('like')}>
        Like{likes > 0 ? ` (${likes})` : ''}
      </button>
      <span style={{ color: 'var(--sh-border)' }}>|</span>
      <button
        type="button"
        onClick={() => onReact(commentId, 'dislike')}
        style={btnStyle('dislike')}
      >
        Dislike{dislikes > 0 ? ` (${dislikes})` : ''}
      </button>
    </>
  )
}

// ── Comment input (pill style) ─────────────────────────────────────────

function CommentInput({ user, placeholder, onSubmit, posting }) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [error, setError] = useState('')
  const canSubmit = Boolean(draft.trim() || attachments.length > 0)

  const handleGifSelect = (gif) => {
    setAttachments([createGifAttachment(gif)])
    setShowGifPicker(false)
  }

  const handlePost = async () => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    if (text.length > 500) {
      setError('Comment must be 500 characters or fewer.')
      return
    }
    const ok = await onSubmit(text, attachments)
    if (ok) {
      setDraft('')
      setAttachments([])
      setShowGifPicker(false)
      setError('')
    }
  }

  if (!user) return null

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <UserAvatar user={user} size={32} />
      <div style={{ flex: 1 }}>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError('')
          }}
          placeholder={placeholder || 'Write a comment...'}
          rows={2}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            border: '1px solid var(--sh-border)',
            borderRadius: 20,
            padding: '10px 14px',
            fontFamily: PAGE_FONT,
            fontSize: 13,
            color: 'var(--sh-text)',
            outline: 'none',
            background: 'var(--sh-soft)',
          }}
        />
        {showGifPicker ? (
          <div style={{ marginTop: 8 }}>
            <GifSearchPanel
              onSelect={handleGifSelect}
              onClose={() => setShowGifPicker(false)}
              maxHeight={320}
              previewHeight={96}
            />
          </div>
        ) : null}
        {attachments.length > 0 ? (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {attachments.map((attachment) => (
              <div key={attachment.url} style={composerGifCardStyle}>
                <img
                  src={attachment.url}
                  alt={attachment.name || 'GIF preview'}
                  style={composerGifImageStyle}
                />
                <button
                  type="button"
                  onClick={() => setAttachments([])}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: '#fff',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                color: draft.length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)',
              }}
            >
              {draft.length}/500
            </span>
            <button
              type="button"
              onClick={() => setShowGifPicker((current) => !current)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--sh-border)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: PAGE_FONT,
                background: 'transparent',
                color:
                  showGifPicker || attachments.length > 0 ? 'var(--sh-brand)' : 'var(--sh-text)',
                transition: 'all .15s',
              }}
            >
              GIF
            </button>
          </div>
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !canSubmit}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: PAGE_FONT,
              background: canSubmit && !posting ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: canSubmit && !posting ? '#fff' : 'var(--sh-muted)',
              transition: 'all .15s',
            }}
          >
            {posting ? 'Posting...' : 'Comment'}
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--sh-danger)', marginTop: 4 }}>{error}</div>
        )}
      </div>
    </div>
  )
}

// ── Inline edit textarea ───────────────────────────────────────────────

function InlineEditor({ initialContent, onSave, onCancel }) {
  const [text, setText] = useState(initialContent)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = text.trim()
    if (!trimmed || trimmed === initialContent) {
      onCancel()
      return
    }
    if (trimmed.length > 500) return
    setSaving(true)
    const ok = await onSave(trimmed)
    setSaving(false)
    if (ok) onCancel()
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          border: '1px solid var(--sh-border)',
          borderRadius: 10,
          padding: '8px 12px',
          fontFamily: PAGE_FONT,
          fontSize: 13,
          color: 'var(--sh-text)',
          outline: 'none',
          background: 'var(--sh-surface)',
        }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !text.trim()}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: PAGE_FONT,
            background: 'var(--sh-brand)',
            color: '#fff',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: PAGE_FONT,
            background: 'var(--sh-soft)',
            color: 'var(--sh-muted)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Single comment item (pill bubble, 3-level nesting) ─────────────────

function CommentItem({
  comment,
  user,
  isNoteOwner,
  noteContent,
  noteId,
  depth = 0,
  onResolve,
  onDelete,
  onEdit,
  onReact,
  onReply,
  currentTime,
}) {
  const anchorStatus = depth === 0 ? resolveAnchorStatus(comment, noteContent) : 'found'
  const isOwn = user && user.id === comment.author?.id
  const canDelete = user && (isOwn || isNoteOwner || user.role === 'admin')
  const canResolve = depth === 0 && (isNoteOwner || (user && user.role === 'admin'))
  const createdMs = comment.createdAt ? new Date(comment.createdAt).getTime() : 0
  const canEdit = isOwn && createdMs > 0 && currentTime < createdMs + EDIT_WINDOW_MS
  const wasEdited =
    comment.updatedAt && comment.createdAt && comment.updatedAt !== comment.createdAt

  const [showReplyInput, setShowReplyInput] = useState(false)
  const [repliesCollapsed, setRepliesCollapsed] = useState(false)
  const [replyPosting, setReplyPosting] = useState(false)
  const [editing, setEditing] = useState(false)
  const replies = comment.replies || []
  const avatarSize = AVATAR_SIZES[Math.min(depth, 2)]
  const canReply = depth < 2 && user && onReply

  // Collapse replies when more than MAX_VISIBLE_REPLIES
  const [showAllReplies, setShowAllReplies] = useState(false)
  const visibleReplies = showAllReplies ? replies : replies.slice(0, MAX_VISIBLE_REPLIES)
  const hiddenCount = replies.length - MAX_VISIBLE_REPLIES

  const handleReplySubmit = async (text, attachments) => {
    setReplyPosting(true)
    const ok = await onReply(text, comment.id, attachments)
    setReplyPosting(false)
    if (ok) setShowReplyInput(false)
    return ok
  }

  const handleEditSave = async (newContent) => {
    if (!onEdit) return false
    return onEdit(comment.id, newContent)
  }

  // Action link style
  const actionStyle = (color) => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: PAGE_FONT,
    color: color || 'var(--sh-muted)',
    transition: 'color 0.15s',
  })

  return (
    <div style={{ marginBottom: depth === 0 ? 4 : 0 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Avatar */}
        {comment.author?.username ? (
          <Link
            to={`/users/${comment.author.username}`}
            style={{ textDecoration: 'none', flexShrink: 0, alignSelf: 'flex-start' }}
          >
            <UserAvatar user={comment.author} size={avatarSize} />
          </Link>
        ) : (
          <div
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'var(--sh-soft)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              color: 'var(--sh-muted)',
            }}
          >
            ?
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Pill bubble */}
          <div
            style={{
              background: comment.resolved ? 'var(--sh-soft)' : 'var(--sh-soft)',
              borderRadius: 16,
              padding: '10px 14px',
              opacity: comment.resolved ? 0.7 : 1,
              transition: 'opacity .15s',
            }}
          >
            {/* Author line */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
                flexWrap: 'wrap',
              }}
            >
              {comment.author?.username ? (
                <Link
                  to={`/users/${comment.author.username}`}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sh-heading)',
                    textDecoration: 'none',
                  }}
                >
                  {comment.author.username}
                </Link>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-muted)' }}>
                  Unknown
                </span>
              )}
              {comment.resolved && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'var(--sh-success-bg)',
                    color: 'var(--sh-success-text)',
                  }}
                >
                  Resolved
                </span>
              )}
            </div>

            {/* Anchor badge (if inline comment, depth 0 only) */}
            {depth === 0 && comment.anchorText && (
              <div
                style={{
                  fontSize: 12,
                  fontStyle: 'italic',
                  color:
                    anchorStatus === 'orphaned' ? 'var(--sh-danger-text)' : 'var(--sh-subtext)',
                  padding: '4px 8px',
                  marginBottom: 6,
                  background:
                    anchorStatus === 'orphaned' ? 'var(--sh-danger-bg)' : 'var(--sh-warning-bg)',
                  borderRadius: 6,
                  borderLeft: `3px solid ${anchorStatus === 'orphaned' ? 'var(--sh-danger-border)' : 'var(--sh-warning-border)'}`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                &ldquo;{comment.anchorText}&rdquo;
                {anchorStatus === 'orphaned' && (
                  <span
                    style={{ fontSize: 10, fontStyle: 'normal', fontWeight: 600, marginLeft: 6 }}
                  >
                    (text changed)
                  </span>
                )}
                {anchorStatus === 'moved' && (
                  <span
                    style={{
                      fontSize: 10,
                      fontStyle: 'normal',
                      fontWeight: 600,
                      marginLeft: 6,
                      color: 'var(--sh-info-text)',
                    }}
                  >
                    (moved)
                  </span>
                )}
              </div>
            )}

            {/* Comment body or inline editor */}
            {editing ? (
              <InlineEditor
                initialContent={comment.content}
                onSave={handleEditSave}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--sh-text)' }}>
                <MentionText text={comment.content} />
                {wasEdited && (
                  <span style={{ fontSize: 11, color: 'var(--sh-muted)', marginLeft: 6 }}>
                    (edited)
                  </span>
                )}
              </p>
            )}
            {!editing && comment.attachments && comment.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {comment.attachments.map((attachment) => (
                  <img
                    key={attachment.id || attachment.url}
                    src={attachment.url}
                    alt={attachment.name || 'Comment GIF'}
                    style={postedGifImageStyle}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* Action row: Like | Dislike | Reply | Edit | Resolve/Reopen | Delete | timestamp */}
          {!editing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 4,
                paddingLeft: 4,
              }}
            >
              {onReact && (
                <CommentReactions
                  commentId={comment.id}
                  reactionCounts={comment.reactionCounts}
                  userReaction={comment.userReaction}
                  onReact={onReact}
                />
              )}
              {canReply && (
                <>
                  <span style={{ color: 'var(--sh-border)' }}>|</span>
                  <button
                    type="button"
                    onClick={() => setShowReplyInput(!showReplyInput)}
                    style={actionStyle()}
                  >
                    Reply
                  </button>
                </>
              )}
              {canEdit && (
                <>
                  <span style={{ color: 'var(--sh-border)' }}>|</span>
                  <button type="button" onClick={() => setEditing(true)} style={actionStyle()}>
                    Edit
                  </button>
                </>
              )}
              {canResolve && (
                <>
                  <span style={{ color: 'var(--sh-border)' }}>|</span>
                  <button
                    type="button"
                    onClick={() => onResolve(comment.id, !comment.resolved)}
                    style={actionStyle(
                      comment.resolved ? 'var(--sh-warning-text)' : 'var(--sh-success-text)',
                    )}
                  >
                    {comment.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </>
              )}
              {canDelete && (
                <>
                  <span style={{ color: 'var(--sh-border)' }}>|</span>
                  <button
                    type="button"
                    onClick={() => onDelete(comment.id)}
                    style={actionStyle('var(--sh-danger-text)')}
                  >
                    Delete
                  </button>
                </>
              )}
              <span style={{ fontSize: 11, color: 'var(--sh-muted)', marginLeft: 2 }}>
                {timeAgo(comment.createdAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Reply input */}
      {showReplyInput && (
        <div
          style={{
            marginLeft: 20,
            paddingLeft: 12,
            marginTop: 8,
            borderLeft: '2px solid var(--sh-border)',
          }}
        >
          <CommentInput
            user={user}
            placeholder="Write a reply..."
            onSubmit={handleReplySubmit}
            posting={replyPosting}
          />
        </div>
      )}

      {/* Replies (nested comments) */}
      {replies.length > 0 && (
        <div
          style={{
            marginLeft: 20,
            paddingLeft: 12,
            marginTop: 8,
            borderLeft: '2px solid var(--sh-border)',
          }}
        >
          {/* Collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setRepliesCollapsed(!repliesCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--sh-muted)',
              fontFamily: PAGE_FONT,
              padding: '4px 0',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: repliesCollapsed ? 'rotate(-90deg)' : 'rotate(0)',
                transition: 'transform 0.15s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {repliesCollapsed
              ? `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`
              : `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>

          {!repliesCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  user={user}
                  isNoteOwner={isNoteOwner}
                  noteContent={noteContent}
                  noteId={noteId}
                  depth={depth + 1}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onReact={onReact}
                  onReply={onReply}
                  currentTime={currentTime}
                />
              ))}
              {!showAllReplies && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllReplies(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--sh-brand)',
                    fontFamily: PAGE_FONT,
                    padding: '4px 0',
                    textAlign: 'left',
                  }}
                >
                  Show {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main comment section ────────────────────────────────────────────────

export default function NoteCommentSection({
  noteId,
  isOwner,
  user,
  noteContent,
  onReactToComment,
}) {
  const [expanded, setExpanded] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const {
    comments,
    total,
    loading,
    posting,
    loadComments,
    postComment,
    resolveComment,
    deleteComment,
    editComment,
  } = useNoteComments(noteId)

  useEffect(() => {
    if (!expanded) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, EDIT_STATUS_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [expanded])

  const handleToggle = () => {
    const next = !expanded
    if (next) {
      setCurrentTime(Date.now())
    }
    setExpanded(next)
    if (next) loadComments()
  }

  const handlePost = async (text, attachments) => {
    return postComment(text, { attachments })
  }

  const handleReply = async (text, parentId, attachments) => {
    return postComment(text, { parentId, attachments })
  }

  const handleEdit = async (commentId, newContent) => {
    return editComment(commentId, newContent)
  }

  return (
    <div style={{ marginTop: 28 }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: PAGE_FONT,
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--sh-subtext)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 0,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}
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
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '8px 0' }}>
              Loading comments...
            </div>
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
                  depth={0}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                  onEdit={handleEdit}
                  onReact={user && onReactToComment ? onReactToComment : null}
                  onReply={handleReply}
                  currentTime={currentTime}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

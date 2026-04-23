import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import GifSearchPanel from '../../components/GifSearchPanel'
import MentionText from '../../components/MentionText'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import {
  authHeaders,
  timeAgo,
  FONT,
  commentSectionContainerStyle,
  commentToggleButtonStyle,
  commentExpandedContentStyle,
  commentInputFooterStyle,
  commentMetaTextStyle,
  commentErrorTextStyle,
  commentListStyle,
  commentButtonStyle,
} from './feedConstants'

/* ── Avatar sizes per nesting depth ──────────────────────────────────── */
const AVATAR_SIZES = [34, 28, 24]
const EDIT_WINDOW_MS = 15 * 60 * 1000
const EDIT_STATUS_POLL_MS = 30 * 1000

/* ── Shared action-link base style ───────────────────────────────────── */
const actionLinkBase = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: FONT,
  padding: 0,
  lineHeight: 1,
}

/* ── Hook ────────────────────────────────────────────────────────────── */

function useComments(postId, initialCount = 0) {
  const [comments, setComments] = useState([])
  const [total, setTotal] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!loadedRef.current) {
      setTotal(initialCount)
    }
  }, [initialCount])

  const loadComments = useCallback(async () => {
    if (loadedRef.current) {
      return
    }

    loadedRef.current = true
    setLoading(true)

    try {
      const response = await fetch(
        `${API}/api/feed/posts/${postId}/comments?limit=50&sort=newest`,
        {
          headers: authHeaders(),
          credentials: 'include',
        },
      )
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        loadedRef.current = false
        return
      }

      const nextComments = Array.isArray(data.comments) ? data.comments : []
      setComments(nextComments)
      setTotal(typeof data.total === 'number' ? data.total : nextComments.length)
    } catch {
      loadedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [postId])

  const postComment = useCallback(
    async (text, parentId = null, attachments = []) => {
      const content = text.trim()
      const nextAttachments = Array.isArray(attachments) ? attachments : []

      if (!content && nextAttachments.length === 0) {
        return false
      }

      setPosting(true)
      setError('')

      try {
        const response = await fetch(`${API}/api/feed/posts/${postId}/comments`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ content, parentId, attachments: nextAttachments }),
        })
        const data = await readJsonSafely(response, {})

        if (!response.ok) {
          setError(getApiErrorMessage(data, 'Could not post comment.'))
          return false
        }

        loadedRef.current = true
        if (parentId) {
          // Reply to existing comment - walk up to 3 levels to find the parent
          setComments((current) =>
            current.map((c) => {
              if (c.id === parentId) {
                return {
                  ...c,
                  replies: [...(c.replies || []), data],
                  replyCount: (c.replyCount || 0) + 1,
                }
              }
              // Check depth-1 replies
              if (c.replies) {
                const updatedReplies = c.replies.map((r) => {
                  if (r.id === parentId) {
                    return {
                      ...r,
                      replies: [...(r.replies || []), data],
                      replyCount: (r.replyCount || 0) + 1,
                    }
                  }
                  return r
                })
                if (updatedReplies !== c.replies) {
                  return { ...c, replies: updatedReplies }
                }
              }
              return c
            }),
          )
        } else {
          // Top-level comment
          setComments((current) => [data, ...current])
          setTotal((current) => current + 1)
        }
        return true
      } catch {
        setError('Check your connection and try again.')
        return false
      } finally {
        setPosting(false)
      }
    },
    [postId],
  )

  const deleteComment = useCallback(
    async (commentId) => {
      try {
        const response = await fetch(`${API}/api/feed/posts/${postId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: authHeaders(),
          credentials: 'include',
        })

        if (response.ok) {
          setComments((current) => current.filter((comment) => comment.id !== commentId))
          setTotal((current) => Math.max(0, current - 1))
        }
      } catch {
        /* silent */
      }
    },
    [postId],
  )

  const reactToComment = useCallback(
    async (commentId, type) => {
      try {
        // Optimistic update - walk 3 levels
        setComments((current) =>
          updateCommentInTree(current, commentId, (comment) => {
            const oldType = comment.userReaction
            const newType = oldType === type ? null : type

            let newLikes = comment.reactionCounts?.like || 0
            let newDislikes = comment.reactionCounts?.dislike || 0

            if (oldType === 'like') newLikes -= 1
            else if (oldType === 'dislike') newDislikes -= 1

            if (newType === 'like') newLikes += 1
            else if (newType === 'dislike') newDislikes += 1

            return {
              ...comment,
              userReaction: newType,
              reactionCounts: { like: newLikes, dislike: newDislikes },
            }
          }),
        )

        const response = await fetch(
          `${API}/api/feed/posts/${postId}/comments/${commentId}/react`,
          {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
            body: JSON.stringify({ type }),
          },
        )

        if (!response.ok) {
          await loadComments()
        }
      } catch {
        await loadComments()
      }
    },
    [postId, loadComments],
  )

  const editComment = useCallback(
    async (commentId, content) => {
      try {
        const response = await fetch(`${API}/api/feed/posts/${postId}/comments/${commentId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ content }),
        })

        if (!response.ok) {
          return false
        }

        const data = await readJsonSafely(response, {})

        // Update the comment in the tree (up to 3 levels deep)
        setComments((current) =>
          updateCommentInTree(current, commentId, (comment) => ({
            ...comment,
            content: data.content || content,
            updatedAt: data.updatedAt || new Date().toISOString(),
          })),
        )

        return true
      } catch {
        return false
      }
    },
    [postId],
  )

  return {
    comments,
    total,
    loading,
    posting,
    error,
    setError,
    loadComments,
    postComment,
    deleteComment,
    reactToComment,
    editComment,
  }
}

/* ── Tree helpers ────────────────────────────────────────────────────── */

/** Walk up to 3 levels of comment nesting and apply `fn` to the matched comment. */
function updateCommentInTree(comments, targetId, fn) {
  return comments.map((c) => {
    if (c.id === targetId) return fn(c)
    if (!c.replies) return c
    const updatedL1 = c.replies.map((r1) => {
      if (r1.id === targetId) return fn(r1)
      if (!r1.replies) return r1
      const updatedL2 = r1.replies.map((r2) => (r2.id === targetId ? fn(r2) : r2))
      return { ...r1, replies: updatedL2 }
    })
    return { ...c, replies: updatedL1 }
  })
}

/* ── Pill input wrapper style ────────────────────────────────────────── */
const pillInputStyle = {
  background: 'var(--sh-soft)',
  borderRadius: 20,
  padding: '8px 14px',
}

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

/* ── ReplyInput ──────────────────────────────────────────────────────── */

function ReplyInput({ user, onReply }) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState([])
  const [posting, setPosting] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)

  const hasValue = Boolean(value.trim())
  const canSubmit = hasValue || attachments.length > 0
  const { length } = value

  const handleGifSelect = (gif) => {
    setAttachments([createGifAttachment(gif)])
    setShowGifPicker(false)
  }

  const handleRemoveAttachment = () => {
    setAttachments([])
  }

  const handleSubmit = async () => {
    if (!canSubmit || posting) return
    setPosting(true)
    try {
      const posted = await onReply(value, attachments)
      if (posted !== false) {
        setValue('')
        setAttachments([])
        setShowGifPicker(false)
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8 }}>
      <UserAvatar
        username={user?.username}
        avatarUrl={user?.avatarUrl}
        role={user?.role}
        plan={user?.plan}
        size={28}
      />
      <div style={{ flex: 1 }}>
        <div style={pillInputStyle}>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Write a reply..."
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: FONT,
              color: 'var(--sh-input-text)',
              outline: 'none',
              boxSizing: 'border-box',
              padding: 0,
            }}
          />
        </div>
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
        {attachments.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {attachments.map((att, i) => (
              <div key={i} style={composerGifCardStyle}>
                <img src={att.url} alt={att.name || 'GIF preview'} style={composerGifImageStyle} />
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
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
        )}
        <div style={commentInputFooterStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontSize: 11, color: length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)' }}
            >
              {length}/500
            </span>
            <button
              type="button"
              onClick={() => setShowGifPicker((current) => !current)}
              disabled={posting}
              style={{
                background: 'none',
                border: '1px solid var(--sh-border)',
                borderRadius: 6,
                cursor: posting ? 'not-allowed' : 'pointer',
                color:
                  showGifPicker || attachments.length > 0 ? 'var(--sh-brand)' : 'var(--sh-text)',
                padding: '4px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              title="Add GIF"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
                e.currentTarget.style.borderColor = 'var(--sh-brand)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderColor = 'var(--sh-border)'
              }}
            >
              GIF
            </button>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={posting || !canSubmit}
            style={commentButtonStyle(canSubmit && !posting, posting)}
          >
            {posting ? 'Posting...' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── CommentInput ────────────────────────────────────────────────────── */

function CommentInput({
  user,
  value,
  onChange,
  onSubmit,
  posting,
  error,
  onChangeAttachments,
  attachments,
  isReply,
}) {
  const hasValue = Boolean(value.trim())
  const { length } = value
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [localAttachments, setLocalAttachments] = useState([])

  // Track local attachments for reply inputs
  const displayAttachments = isReply ? localAttachments : attachments
  const canSubmit = hasValue || displayAttachments.length > 0

  const handleGifSelect = (gif) => {
    const nextAttachments = [createGifAttachment(gif)]
    if (isReply) {
      setLocalAttachments(nextAttachments)
    } else {
      onChangeAttachments(nextAttachments)
    }
    setShowGifPicker(false)
  }

  const handleRemoveAttachment = () => {
    if (isReply) {
      setLocalAttachments([])
    } else {
      onChangeAttachments([])
    }
  }

  const handleLocalSubmit = async () => {
    if (isReply) {
      const posted = await onSubmit(value, null, localAttachments)
      if (posted !== false) {
        setLocalAttachments([])
        setShowGifPicker(false)
      }
    } else {
      const posted = await onSubmit(value, null, attachments)
      if (posted !== false) {
        setShowGifPicker(false)
      }
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <UserAvatar
        username={user?.username}
        avatarUrl={user?.avatarUrl}
        role={user?.role}
        plan={user?.plan}
        size={32}
      />
      <div style={{ flex: 1 }}>
        <div style={pillInputStyle}>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={isReply ? 'Write a reply...' : 'Write a comment...'}
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: FONT,
              color: 'var(--sh-input-text)',
              outline: 'none',
              boxSizing: 'border-box',
              padding: 0,
            }}
          />
        </div>
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
        {displayAttachments && displayAttachments.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {displayAttachments.map((att, i) => (
              <div key={i} style={composerGifCardStyle}>
                <img src={att.url} alt={att.name || 'GIF preview'} style={composerGifImageStyle} />
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
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
        )}
        <div style={commentInputFooterStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontSize: 11, color: length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)' }}
            >
              {length}/500
            </span>
            <button
              type="button"
              onClick={() => setShowGifPicker((current) => !current)}
              disabled={posting}
              style={{
                background: 'none',
                border: '1px solid var(--sh-border)',
                borderRadius: 6,
                cursor: posting ? 'not-allowed' : 'pointer',
                color:
                  showGifPicker || displayAttachments.length > 0
                    ? 'var(--sh-brand)'
                    : 'var(--sh-text)',
                padding: '4px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              title="Add GIF"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--sh-soft)'
                e.currentTarget.style.borderColor = 'var(--sh-brand)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderColor = 'var(--sh-border)'
              }}
            >
              GIF
            </button>
          </div>
          <button
            type="button"
            onClick={handleLocalSubmit}
            disabled={posting || !canSubmit}
            style={commentButtonStyle(canSubmit && !posting, posting)}
          >
            {posting ? 'Posting...' : isReply ? 'Reply' : 'Comment'}
          </button>
        </div>
        {error ? <div style={commentErrorTextStyle}>{error}</div> : null}
      </div>
    </div>
  )
}

/* ── CommentReactions (text-link style) ──────────────────────────────── */

function CommentReactions({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  return (
    <>
      <button
        type="button"
        onClick={() => onReact(commentId, 'like')}
        style={{
          ...actionLinkBase,
          color: userReaction === 'like' ? 'var(--sh-brand)' : 'var(--sh-muted)',
        }}
      >
        Like{likes > 0 ? ` ${likes}` : ''}
      </button>
      <button
        type="button"
        onClick={() => onReact(commentId, 'dislike')}
        style={{
          ...actionLinkBase,
          color: userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-muted)',
        }}
      >
        Dislike{dislikes > 0 ? ` ${dislikes}` : ''}
      </button>
    </>
  )
}

/* ── CommentItem (recursive, 3-level nesting) ────────────────────────── */

function CommentItem({
  comment,
  user,
  onDelete,
  onReact,
  onReply,
  onEdit,
  depth = 0,
  currentTime,
}) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(comment.content || '')
  const [saving, setSaving] = useState(false)

  const isOwn = comment.author?.id === user?.id
  const isAdmin = user?.role === 'admin'
  const wasEdited = comment.updatedAt && comment.updatedAt !== comment.createdAt
  const createdMs = comment.createdAt ? new Date(comment.createdAt).getTime() : 0
  const canEdit = isOwn && createdMs > 0 && currentTime < createdMs + EDIT_WINDOW_MS

  const avatarSize = AVATAR_SIZES[Math.min(depth, 2)]
  const replies = comment.replies || []
  const replyCount = comment.replyCount || replies.length
  const canReply = depth < 2 && Boolean(user)

  const handleSaveEdit = async () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === comment.content) {
      setEditing(false)
      return
    }
    setSaving(true)
    const ok = await onEdit(comment.id, trimmed)
    setSaving(false)
    if (ok) {
      setEditing(false)
    }
  }

  const handleCancelEdit = () => {
    setEditValue(comment.content || '')
    setEditing(false)
  }

  const nestingStyle =
    depth > 0 ? { marginLeft: 20, paddingLeft: 12, borderLeft: '2px solid var(--sh-border)' } : {}

  return (
    <div style={{ ...nestingStyle, marginTop: depth > 0 ? 10 : 0 }}>
      <div data-comment-id={comment.id} style={{ display: 'flex', gap: 8 }}>
        {/* Avatar */}
        {comment.author?.username ? (
          <Link
            to={`/users/${comment.author.username}`}
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            <UserAvatar
              username={comment.author.username}
              avatarUrl={comment.author.avatarUrl}
              role={comment.author.role}
              plan={comment.author.plan}
              size={avatarSize}
            />
          </Link>
        ) : (
          <UserAvatar username="?" size={avatarSize} />
        )}

        {/* Content column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Pill bubble */}
          <div style={{ background: 'var(--sh-soft)', borderRadius: 16, padding: '10px 14px' }}>
            {/* Author name */}
            {comment.author?.username ? (
              <Link
                to={`/users/${comment.author.username}`}
                style={{
                  textDecoration: 'none',
                  color: 'var(--sh-text)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {comment.author.username}
              </Link>
            ) : (
              <span style={{ color: 'var(--sh-text)', fontWeight: 600, fontSize: 13 }}>
                Unknown
              </span>
            )}

            {/* Comment body or edit textarea */}
            {editing ? (
              <div style={{ marginTop: 6 }}>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    border: '1px solid var(--sh-border)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 13,
                    fontFamily: FONT,
                    color: 'var(--sh-input-text)',
                    background: 'var(--sh-input-bg)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    style={{
                      ...actionLinkBase,
                      color: 'var(--sh-brand)',
                      fontWeight: 600,
                    }}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    style={{
                      ...actionLinkBase,
                      color: 'var(--sh-muted)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 13,
                  color: 'var(--sh-subtext)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <MentionText text={comment.content} />
              </p>
            )}

            {/* Attachments inside bubble */}
            {!editing && comment.attachments && comment.attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {comment.attachments.map((att) => (
                  <img
                    key={att.id}
                    src={att.url}
                    alt={att.name || 'Comment GIF'}
                    style={postedGifImageStyle}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Action row below the bubble */}
          {!editing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 4,
                flexWrap: 'wrap',
              }}
            >
              {/* Like / Dislike */}
              {user && onReact && (
                <CommentReactions
                  commentId={comment.id}
                  reactionCounts={comment.reactionCounts}
                  userReaction={comment.userReaction}
                  onReact={onReact}
                />
              )}

              {/* Reply */}
              {canReply && (
                <button
                  type="button"
                  onClick={() => setShowReplyInput(!showReplyInput)}
                  style={{ ...actionLinkBase, color: 'var(--sh-muted)' }}
                >
                  {showReplyInput ? 'Cancel' : 'Reply'}
                </button>
              )}

              {/* Edit (15-min window, checked on click) */}
              {canEdit && onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditValue(comment.content || '')
                    setEditing(true)
                  }}
                  style={{ ...actionLinkBase, color: 'var(--sh-muted)' }}
                >
                  Edit
                </button>
              )}

              {/* Delete */}
              {(isOwn || isAdmin) && (
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  style={{ ...actionLinkBase, color: 'var(--sh-danger)' }}
                >
                  Delete
                </button>
              )}

              {/* Timestamp + edited indicator */}
              <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                {timeAgo(comment.createdAt)}
                {wasEdited ? ' (edited)' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Reply input */}
      {showReplyInput && (
        <div style={{ marginLeft: 20 + avatarSize + 8 }}>
          <ReplyInput
            user={user}
            onReply={(text, attachments) => {
              return onReply(text, comment.id, attachments).then((posted) => {
                if (posted !== false) {
                  setShowReplyInput(false)
                }
                return posted
              })
            }}
          />
        </div>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div>
          {replies.length > 2 && (
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              style={{
                ...actionLinkBase,
                color: 'var(--sh-brand)',
                marginLeft: 20,
                marginTop: 6,
              }}
            >
              {showReplies
                ? `Hide ${replyCount > 1 ? `${replyCount} replies` : '1 reply'}`
                : `View ${replyCount > 1 ? `${replyCount} replies` : '1 reply'}`}
            </button>
          )}
          {(replies.length <= 2 || showReplies) &&
            replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                user={user}
                onDelete={onDelete}
                onReact={onReact}
                onReply={onReply}
                onEdit={onEdit}
                depth={depth + 1}
                currentTime={currentTime}
              />
            ))}
        </div>
      )}
    </div>
  )
}

/* ── CommentList ─────────────────────────────────────────────────────── */

function CommentList({ comments, loading, user, onDelete, onReact, onReply, onEdit, currentTime }) {
  if (loading) {
    return <div style={commentMetaTextStyle}>Loading comments...</div>
  }

  if (comments.length === 0) {
    return <div style={commentMetaTextStyle}>No comments yet. Be the first!</div>
  }

  return (
    <div style={commentListStyle}>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          user={user}
          onDelete={onDelete}
          onReact={onReact}
          onReply={onReply}
          onEdit={onEdit}
          currentTime={currentTime}
        />
      ))}
    </div>
  )
}

/* ── Main export ─────────────────────────────────────────────────────── */

export default function CommentSection({
  postId,
  commentCount,
  user,
  targetCommentId,
  alwaysExpanded = false,
}) {
  const [expanded, setExpanded] = useState(() => Boolean(targetCommentId) || alwaysExpanded)
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState([])
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const {
    comments,
    total,
    loading,
    posting,
    error,
    setError,
    loadComments,
    postComment,
    deleteComment,
    reactToComment,
    editComment,
  } = useComments(postId, commentCount || 0)

  useEffect(() => {
    if (targetCommentId || alwaysExpanded) {
      loadComments()
    }
  }, [targetCommentId, alwaysExpanded, loadComments])

  useEffect(() => {
    if (!expanded) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, EDIT_STATUS_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [expanded])

  useEffect(() => {
    if (!targetCommentId || loading) return
    const el = document.querySelector(`[data-comment-id="${targetCommentId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'box-shadow 0.3s'
      el.style.boxShadow = '0 0 0 3px var(--sh-info-border)'
      setTimeout(() => {
        el.style.boxShadow = ''
      }, 2000)
    }
  }, [targetCommentId, loading])

  const handleToggle = () => {
    const next = !expanded
    if (next) {
      setCurrentTime(Date.now())
    }
    setExpanded(next)
    if (next) {
      loadComments()
    }
  }

  const handlePost = async () => {
    const text = newComment.trim()
    if (!text && attachments.length === 0) return false
    if (text.length > 500) {
      setError('Comment must be 500 characters or fewer.')
      return false
    }

    const posted = await postComment(text, null, attachments)
    if (posted) {
      setNewComment('')
      setAttachments([])
    }
    return posted
  }

  const handleReply = async (text, parentId, replyAttachments) => {
    return postComment(text, parentId, replyAttachments)
  }

  const handleChangeAttachments = (nextAttachments) => {
    setAttachments(Array.isArray(nextAttachments) ? nextAttachments : [])
  }

  const commentContent = (
    <div style={commentExpandedContentStyle}>
      <CommentInput
        user={user}
        value={newComment}
        onChange={(value) => {
          setNewComment(value)
          if (error) {
            setError('')
          }
        }}
        onSubmit={handlePost}
        posting={posting}
        error={error}
        onChangeAttachments={handleChangeAttachments}
        attachments={attachments}
      />
      <CommentList
        comments={comments}
        loading={loading}
        user={user}
        onDelete={deleteComment}
        onReact={user ? reactToComment : null}
        onReply={user ? handleReply : null}
        onEdit={user ? editComment : null}
        currentTime={currentTime}
      />
    </div>
  )

  // When alwaysExpanded (opened via FeedCard Comment button), skip the
  // redundant toggle header and show the input + comments directly.
  if (alwaysExpanded) {
    return <div style={commentSectionContainerStyle}>{commentContent}</div>
  }

  return (
    <div style={commentSectionContainerStyle}>
      <button type="button" onClick={handleToggle} style={commentToggleButtonStyle}>
        {expanded ? '\u25BE' : '\u25B8'} {total} {total === 1 ? 'comment' : 'comments'}
      </button>
      {expanded && commentContent}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../components/MentionText'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { Avatar } from './FeedWidgets'
import {
  authHeaders,
  timeAgo,
  commentSectionContainerStyle,
  commentToggleButtonStyle,
  commentExpandedContentStyle,
  commentInputRowStyle,
  commentTextareaStyle,
  commentInputFooterStyle,
  commentMetaTextStyle,
  commentErrorTextStyle,
  commentListStyle,
  commentItemStyle,
  commentHeaderStyle,
  commentAuthorStyle,
  commentTimestampStyle,
  commentDeleteButtonStyle,
  commentBodyStyle,
  commentButtonStyle,
} from './feedConstants'

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
      const response = await fetch(`${API}/api/feed/posts/${postId}/comments?limit=50&sort=newest`, {
        headers: authHeaders(),
        credentials: 'include',
      })
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

  const postComment = useCallback(async (text, parentId = null, attachments = []) => {
    const content = text.trim()

    if (!content) {
      return false
    }

    setPosting(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/feed/posts/${postId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ content, parentId, attachments }),
      })
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        setError(getApiErrorMessage(data, 'Could not post comment.'))
        return false
      }

      loadedRef.current = true
      if (parentId) {
        // Reply to existing comment - update the parent comment with the new reply
        setComments((current) =>
          current.map((comment) => {
            if (comment.id === parentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), data],
                replyCount: (comment.replyCount || 0) + 1,
              }
            }
            return comment
          })
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
  }, [postId])

  const deleteComment = useCallback(async (commentId) => {
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
  }, [postId])

  const reactToComment = useCallback(async (commentId, type) => {
    try {
      // Optimistic update
      setComments((current) =>
        current.map((comment) => {
          if (comment.id !== commentId) return comment

          const oldType = comment.userReaction
          const newType = oldType === type ? null : type

          const oldLikes = comment.reactionCounts.like
          const oldDislikes = comment.reactionCounts.dislike

          let newLikes = oldLikes
          let newDislikes = oldDislikes

          // Remove old reaction
          if (oldType === 'like') newLikes -= 1
          else if (oldType === 'dislike') newDislikes -= 1

          // Add new reaction
          if (newType === 'like') newLikes += 1
          else if (newType === 'dislike') newDislikes += 1

          return {
            ...comment,
            userReaction: newType,
            reactionCounts: { like: newLikes, dislike: newDislikes },
          }
        })
      )

      const response = await fetch(`${API}/api/feed/posts/${postId}/comments/${commentId}/react`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type }),
      })

      if (!response.ok) {
        // Revert on error
        await loadComments()
      }
    } catch {
      // Revert on error
      await loadComments()
    }
  }, [postId, loadComments])

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
  }
}

function ReplyInput({ user, onReply }) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState([])
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const hasValue = Boolean(value.trim())
  const { length } = value

  const handleImageSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch(`${API}/api/upload/comment-image`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setAttachments((current) => [...current, { url: data.url, type: 'image', name: file.name }])
      }
    } catch {
      /* error */
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveAttachment = (index) => {
    setAttachments((current) => current.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!hasValue || posting || uploading) return
    setPosting(true)
    try {
      await onReply(value, attachments)
      setValue('')
      setAttachments([])
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={commentInputRowStyle}>
      <Avatar username={user?.username} role={user?.role} size={32} />
      <div style={{ flex: 1 }}>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Write a reply..."
          rows={2}
          style={commentTextareaStyle}
        />
        {attachments.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {attachments.map((att, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden' }}>
                <img
                  src={att.url}
                  alt="attachment"
                  style={{ maxWidth: '100px', maxHeight: '100px', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(i)}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '20px',
                    height: '20px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: 11, color: length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)' }}>
              {length}/500
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: uploading ? 'var(--sh-muted)' : 'var(--sh-text)',
                fontSize: '16px',
                padding: '4px 8px',
              }}
              title="Attach image"
            >
              {uploading ? '...' : 'Image'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={posting || uploading || !hasValue}
            style={commentButtonStyle(hasValue && !uploading && !posting, posting)}
          >
            {posting ? 'Posting...' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CommentInput({ user, value, onChange, onSubmit, posting, error, onAttachImage, attachments, isReply }) {
  const hasValue = Boolean(value.trim())
  const { length } = value
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [localAttachments, setLocalAttachments] = useState([])

  // Track local attachments for reply inputs
  const displayAttachments = isReply ? localAttachments : attachments

  const handleImageSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch(`${API}/api/upload/comment-image`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        if (isReply) {
          setLocalAttachments((current) => [...current, { url: data.url, type: 'image', name: file.name }])
        } else {
          onAttachImage({
            url: data.url,
            type: 'image',
            name: file.name,
          })
        }
      }
    } catch {
      /* error */
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveAttachment = (index) => {
    if (isReply) {
      setLocalAttachments((current) => current.filter((_, i) => i !== index))
    } else {
      const newAttachments = [...attachments]
      newAttachments.splice(index, 1)
      onAttachImage(null, true, newAttachments)
    }
  }

  const handleLocalSubmit = () => {
    if (isReply) {
      onSubmit(value, null, localAttachments)
      setLocalAttachments([])
    } else {
      onSubmit(value, null, attachments)
    }
  }

  return (
    <div style={commentInputRowStyle}>
      <Avatar username={user?.username} role={user?.role} size={32} />
      <div style={{ flex: 1 }}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={isReply ? "Write a reply..." : "Write a comment..."}
          rows={2}
          style={commentTextareaStyle}
        />
        {displayAttachments && displayAttachments.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {displayAttachments.map((att, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden' }}>
                <img
                  src={att.url}
                  alt="attachment"
                  style={{ maxWidth: '100px', maxHeight: '100px', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(i)}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '20px',
                    height: '20px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: 11, color: length > 500 ? 'var(--sh-danger)' : 'var(--sh-muted)' }}>
              {length}/500
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: uploading ? 'var(--sh-muted)' : 'var(--sh-text)',
                fontSize: '16px',
                padding: '4px 8px',
              }}
              title="Attach image"
            >
              {uploading ? '...' : 'Image'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLocalSubmit}
            disabled={posting || uploading || !hasValue}
            style={commentButtonStyle(hasValue && !uploading && !posting, posting)}
          >
            {posting ? 'Posting...' : isReply ? 'Reply' : 'Comment'}
          </button>
        </div>
        {error ? <div style={commentErrorTextStyle}>{error}</div> : null}
      </div>
    </div>
  )
}

function CommentReactions({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  const thumbsUpSvg = (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: 4 }}>
      <path d="M2 10.5a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0v-6zM6 10.333v5.43a2 2 0 0 0 .97 1.679V17.5a.5.5 0 1 0 1 0v-.04a2 2 0 0 0 .97-1.679v-.745a2 2 0 0 0 .211-.126c1.04-.678 1.946-.122 2.469.856.653 1.31 1.422 2.105 2.188 2.01.374-.056.695-.481 1.088-1.461.36-.896.748-2.144.948-2.979.179-.633.45-1.559.838-2.form.158-.34.355-.638.57-.88a3 3 0 0 0 .281-1.249A3 3 0 0 0 15.3 9h1.023a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75H15.3a3 3 0 0 0-2.973 2.5H13a.75.75 0 0 0 0 1.5h-.227c.038.58.076 1.254.076 2v1.5a2 2 0 0 0 .053.477c-.038.58-.076 1.254-.076 2 0 .888.106 1.72.282 2.38.168.594.411 1.084.693 1.38" />
    </svg>
  )

  const thumbsDownSvg = (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ marginRight: 4 }}>
      <path d="M18 9.5a1.5 1.5 0 1 1-3 0v-6a1.5 1.5 0 0 1 3 0v6zM14 9.667v-5.43a2 2 0 0 1-.97-1.679V2.5a.5.5 0 1 1-1 0v.04a2 2 0 0 1-.97 1.679v.745a2 2 0 0 1-.211.126c-1.04.678-1.946.122-2.469-.856-.653-1.31-1.422-2.105-2.188-2.01-.374.056-.695.481-1.088 1.461-.36.896-.748 2.144-.948 2.979-.179.633-.45 1.559-.838 2.form-.158.34-.355.638-.57.88a3 3 0 0 1-.281 1.249A3 3 0 0 1 4.7 11H3.75a.75.75 0 0 1-.75-.75V7.25a.75.75 0 0 1 .75-.75H4.7a3 3 0 0 1 2.973-2.5h.227a.75.75 0 0 1 0 1.5H7a2 2 0 0 1-.053.477c.038.58.076 1.254.076 2v1.5a2 2 0 0 1-.053.477c-.038.58-.076 1.254-.076 2 0 .888-.106 1.72-.282 2.38-.168.594-.411 1.084-.693 1.38" />
    </svg>
  )

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => onReact(commentId, 'like')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          border: 'none',
          borderRadius: '4px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '12px',
          color: userReaction === 'like' ? 'var(--sh-brand)' : 'var(--sh-muted)',
          transition: 'color 0.2s',
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
          gap: '4px',
          padding: '4px 8px',
          border: 'none',
          borderRadius: '4px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '12px',
          color: userReaction === 'dislike' ? 'var(--sh-brand)' : 'var(--sh-muted)',
          transition: 'color 0.2s',
        }}
      >
        {thumbsDownSvg}
        {dislikes > 0 ? dislikes : ''}
      </button>
    </div>
  )
}

function CommentItem({ comment, user, onDelete, onReact, onReply, isReply = false }) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [showReplies, setShowReplies] = useState(true)

  return (
    <div>
      <div key={comment.id} data-comment-id={comment.id} style={{ ...commentItemStyle, ...(isReply ? { marginLeft: '32px', marginTop: '12px', paddingLeft: '12px', borderLeft: '2px solid var(--sh-border)' } : {}) }}>
        {comment.author?.username ? (
          <Link to={`/users/${comment.author.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Avatar username={comment.author.username} role="student" size={28} />
          </Link>
        ) : (
          <Avatar username="?" role="student" size={28} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={commentHeaderStyle}>
            <div>
              {comment.author?.username ? (
                <Link to={`/users/${comment.author.username}`} style={{ ...commentAuthorStyle, textDecoration: 'none' }}>
                  {comment.author.username}
                </Link>
              ) : (
                <span style={commentAuthorStyle}>Unknown</span>
              )}
              <span style={commentTimestampStyle}>{timeAgo(comment.createdAt)}</span>
            </div>
            {(comment.author?.id === user?.id || user?.role === 'admin') ? (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                style={commentDeleteButtonStyle}
              >
                Delete
              </button>
            ) : null}
          </div>
          <p style={commentBodyStyle}><MentionText text={comment.content} /></p>
          {comment.attachments && comment.attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {comment.attachments.map((att) => (
                <img
                  key={att.id}
                  src={att.url}
                  alt="attachment"
                  style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }}
                />
              ))}
            </div>
          )}
          {user && onReact ? (
            <CommentReactions
              commentId={comment.id}
              reactionCounts={comment.reactionCounts}
              userReaction={comment.userReaction}
              onReact={onReact}
            />
          ) : null}
          {!isReply && user && (
            <button
              type="button"
              onClick={() => setShowReplyInput(!showReplyInput)}
              style={{
                marginTop: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--sh-brand)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0px 4px',
              }}
            >
              {showReplyInput ? 'Cancel' : 'Reply'}
            </button>
          )}
        </div>
      </div>

      {showReplyInput && (
        <ReplyInput
          user={user}
          onReply={(text, attachments) => {
            onReply(text, comment.id, attachments)
            setShowReplyInput(false)
          }}
        />
      )}

      {(comment.replies || []).length > 0 && (
        <div>
          {!isReply && (
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--sh-brand)',
                cursor: 'pointer',
                fontSize: '12px',
                marginLeft: '32px',
                marginTop: '8px',
                padding: '0px 4px',
              }}
            >
              {showReplies ? `Hide ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}` : `Show ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
            </button>
          )}
          {showReplies && comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              user={user}
              onDelete={onDelete}
              onReact={onReact}
              onReply={onReply}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentList({ comments, loading, user, onDelete, onReact, onReply }) {
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
        />
      ))}
    </div>
  )
}

export default function CommentSection({ postId, commentCount, user, targetCommentId }) {
  const [expanded, setExpanded] = useState(() => Boolean(targetCommentId))
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState([])
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
  } = useComments(postId, commentCount || 0)

  useEffect(() => {
    if (targetCommentId) {
      loadComments()
    }
  }, [targetCommentId, loadComments])

  useEffect(() => {
    if (!targetCommentId || loading) return
    const el = document.querySelector(`[data-comment-id="${targetCommentId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'box-shadow 0.3s'
      el.style.boxShadow = '0 0 0 3px var(--sh-info-border)'
      setTimeout(() => { el.style.boxShadow = '' }, 2000)
    }
  }, [targetCommentId, loading])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) {
      loadComments()
    }
  }

  const handlePost = async () => {
    const text = newComment.trim()
    if (!text) return
    if (text.length > 500) {
      setError('Comment must be 500 characters or fewer.')
      return
    }

    const posted = await postComment(text, null, attachments)
    if (posted) {
      setNewComment('')
      setAttachments([])
    }
  }

  const handleReply = async (text, parentId, replyAttachments) => {
    const posted = await postComment(text, parentId, replyAttachments)
    if (posted) {
      // Reply input will be cleared by component
    }
  }

  const handleAttachImage = (attachment, clearAll = false, newAttachments = []) => {
    if (clearAll) {
      setAttachments(newAttachments)
    } else if (attachment) {
      setAttachments((current) => [...current, attachment])
    }
  }

  return (
    <div style={commentSectionContainerStyle}>
      <button type="button" onClick={handleToggle} style={commentToggleButtonStyle}>
        {expanded ? '\u25BE' : '\u25B8'} {total} {total === 1 ? 'comment' : 'comments'}
      </button>

      {expanded && (
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
            onAttachImage={handleAttachImage}
            attachments={attachments}
          />
          <CommentList
            comments={comments}
            loading={loading}
            user={user}
            onDelete={deleteComment}
            onReact={user ? reactToComment : null}
            onReply={user ? handleReply : null}
          />
        </div>
      )}
    </div>
  )
}

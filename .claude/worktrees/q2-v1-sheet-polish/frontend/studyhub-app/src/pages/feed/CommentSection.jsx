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
      const response = await fetch(`${API}/api/feed/posts/${postId}/comments?limit=50`, {
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

  const postComment = useCallback(async (text) => {
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
        body: JSON.stringify({ content }),
      })
      const data = await readJsonSafely(response, {})

      if (!response.ok) {
        setError(getApiErrorMessage(data, 'Could not post comment.'))
        return false
      }

      loadedRef.current = true
      setComments((current) => [data, ...current])
      setTotal((current) => current + 1)
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
  }
}

function CommentInput({ user, value, onChange, onSubmit, posting, error }) {
  const hasValue = Boolean(value.trim())
  const { length } = value

  return (
    <div style={commentInputRowStyle}>
      <Avatar username={user?.username} role={user?.role} size={32} />
      <div style={{ flex: 1 }}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write a comment..."
          rows={2}
          style={commentTextareaStyle}
        />
        <div style={commentInputFooterStyle}>
          <span style={{ fontSize: 11, color: length > 500 ? '#dc2626' : '#94a3b8' }}>
            {length}/500
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={posting || !hasValue}
            style={commentButtonStyle(hasValue, posting)}
          >
            {posting ? 'Posting...' : 'Comment'}
          </button>
        </div>
        {error ? <div style={commentErrorTextStyle}>{error}</div> : null}
      </div>
    </div>
  )
}

function CommentList({ comments, loading, user, onDelete }) {
  if (loading) {
    return <div style={commentMetaTextStyle}>Loading comments...</div>
  }

  if (comments.length === 0) {
    return <div style={commentMetaTextStyle}>No comments yet. Be the first!</div>
  }

  return (
    <div style={commentListStyle}>
      {comments.map((comment) => (
        <div key={comment.id} data-comment-id={comment.id} style={commentItemStyle}>
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
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CommentSection({ postId, commentCount, user, targetCommentId }) {
  const [expanded, setExpanded] = useState(() => Boolean(targetCommentId))
  const [newComment, setNewComment] = useState('')
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

    const posted = await postComment(text)
    if (posted) {
      setNewComment('')
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
          />
          <CommentList
            comments={comments}
            loading={loading}
            user={user}
            onDelete={deleteComment}
          />
        </div>
      )}
    </div>
  )
}

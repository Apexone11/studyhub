/**
 * Renders the comment list + compose form for a single contribution.
 * Designed to sit directly below a DiffViewer. Comments are keyed by
 * (hunkIndex, lineOffset, side) coordinates that match the diff structure.
 *
 * Flow:
 *   1. Parent passes `selected` — the clicked line in the diff — and a
 *      setSelected callback. When selected is non-null, the form appears.
 *   2. User types and clicks "Post". We call the hook's addComment, which
 *      hits POST /api/sheets/contributions/:id/comments and appends the
 *      new comment to the list on success.
 *   3. Users can delete their own comments (or all comments if admin).
 *      The hook also manages this via deleteContributionComment.
 */
import { useState } from 'react'
import { showToast } from '../../../lib/toast'
import { timeAgo } from '../../shared/pageUtils'
import useContributionComments from './useContributionComments'

const MAX_BODY = 1000

export default function ContributionCommentsPanel({
  contributionId,
  currentUser,
  selected,
  onClearSelected,
}) {
  const { comments, loading, error, addComment, removeComment } = useContributionComments(contributionId)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!selected || !body.trim() || posting) return
    setPosting(true)
    try {
      await addComment({
        hunkIndex: selected.hunkIndex,
        lineOffset: selected.lineOffset,
        side: selected.side,
        body: body.trim().slice(0, MAX_BODY),
      })
      setBody('')
      onClearSelected?.()
      showToast('Comment posted.', 'success')
    } catch (err) {
      showToast(err.message || 'Could not post comment.', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(commentId) {
    if (!window.confirm('Delete this comment?')) return
    try {
      await removeComment(commentId)
      showToast('Comment deleted.', 'info')
    } catch (err) {
      showToast(err.message || 'Could not delete comment.', 'error')
    }
  }

  const canDelete = (comment) => {
    if (!currentUser) return false
    if (currentUser.role === 'admin') return true
    return comment.author?.id === currentUser.id
  }

  return (
    <div className="sheet-lab__comments">
      <div className="sheet-lab__comments-header">
        Inline comments {comments.length > 0 ? `(${comments.length})` : ''}
      </div>

      {loading && comments.length === 0 ? (
        <div className="sheet-lab__comment-hint">Loading comments...</div>
      ) : null}

      {error ? (
        <div className="sheet-lab__comment-hint" style={{ color: 'var(--sh-danger)' }}>
          {error}
        </div>
      ) : null}

      {comments.length === 0 && !loading && !error ? (
        <div className="sheet-lab__comment-hint">
          No inline comments yet. Click a line in the diff above to comment on it.
        </div>
      ) : null}

      {comments.map((comment) => (
        <div key={comment.id} className="sheet-lab__comment">
          <div className="sheet-lab__comment-meta">
            <span className="sheet-lab__comment-anchor">
              hunk {comment.hunkIndex + 1} · line {comment.lineOffset + 1} · {comment.side}
            </span>
            <strong style={{ color: 'var(--sh-heading)' }}>
              {comment.author?.username || 'unknown'}
            </strong>
            <span>{timeAgo(comment.createdAt)}</span>
            {canDelete(comment) ? (
              <button
                type="button"
                className="sheet-lab__comment-delete"
                onClick={() => handleDelete(comment.id)}
                aria-label="Delete comment"
              >
                delete
              </button>
            ) : null}
          </div>
          <div className="sheet-lab__comment-body">{comment.body}</div>
        </div>
      ))}

      {selected ? (
        <form className="sheet-lab__comment-form" onSubmit={handleSubmit}>
          <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
            Commenting on{' '}
            <span className="sheet-lab__comment-anchor">
              hunk {selected.hunkIndex + 1} · line {selected.lineOffset + 1} · {selected.side}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
            placeholder="Leave feedback on this line..."
            maxLength={MAX_BODY}
            disabled={posting}
            autoFocus
          />
          <div className="sheet-lab__comment-form-actions">
            <button
              type="button"
              onClick={() => {
                setBody('')
                onClearSelected?.()
              }}
              disabled={posting}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-surface)',
                color: 'var(--sh-muted)',
                fontSize: 11,
                fontWeight: 700,
                cursor: posting ? 'wait' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!body.trim() || posting}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--sh-brand, #6366f1)',
                color: 'var(--sh-btn-primary-text, #fff)',
                fontSize: 11,
                fontWeight: 700,
                cursor: posting ? 'wait' : 'pointer',
                opacity: !body.trim() || posting ? 0.5 : 1,
              }}
            >
              {posting ? 'Posting...' : 'Post comment'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

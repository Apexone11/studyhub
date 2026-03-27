import { useState } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../../components/MentionText'
import { SkeletonCard } from '../../../components/Skeleton'
import { FONT, panelStyle, timeAgo } from './sheetViewerConstants'

export default function SheetCommentsPanel({
  user,
  commentsState,
  commentDraft,
  setCommentDraft,
  commentSaving,
  submitComment,
  deleteComment,
}) {
  const [commentsExpanded, setCommentsExpanded] = useState(commentsState.total <= 3)

  return (
    <section data-tutorial="viewer-comments" style={panelStyle()}>
      <button
        type="button"
        onClick={() => setCommentsExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, margin: '0 0 12px', fontFamily: FONT,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--sh-heading)' }}>
          Comments{commentsState.total > 0 ? ` (${commentsState.total})` : ''}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
          {commentsExpanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {commentsExpanded && (
        <>
          {!user ? (
            <div style={{
              textAlign: 'center', padding: '16px 12px',
              borderRadius: 12, border: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)', marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>
                Join the conversation
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                Sign in to leave comments, corrections, and study tips.
              </div>
              <Link to="/login" style={{
                display: 'inline-block', padding: '7px 16px', borderRadius: 8,
                background: 'var(--sh-brand)', color: 'var(--sh-btn-primary-text)',
                fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}>
                Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submitComment} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Share a clarification, correction, or study tip…"
                rows={3}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  borderRadius: 12,
                  border: '1px solid var(--sh-input-border)',
                  padding: 12,
                  font: 'inherit',
                  background: 'var(--sh-input-bg)',
                  color: 'var(--sh-input-text)',
                }}
              />
              <div>
                <button
                  type="submit"
                  disabled={commentSaving}
                  style={{
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--sh-btn-primary-bg)',
                    color: 'var(--sh-btn-primary-text)',
                    fontWeight: 800,
                    fontSize: 13,
                    padding: '10px 14px',
                    cursor: commentSaving ? 'wait' : 'pointer',
                    fontFamily: FONT,
                  }}
                >
                  {commentSaving ? 'Posting...' : 'Post comment'}
                </button>
              </div>
            </form>
          )}

          {commentsState.loading ? (
            <SkeletonCard style={{ padding: 16, minHeight: 60 }} />
          ) : commentsState.comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>No comments yet</div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
                Be the first to leave feedback — corrections, study tips, and clarifications help everyone.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {commentsState.comments.map((comment) => (
                <div key={comment.id} style={{ borderTop: '1px solid var(--sh-soft)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                    <Link to={`/users/${comment.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}>
                      {comment.author?.username || 'Unknown'}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{timeAgo(comment.createdAt)}</span>
                      {user && (user.id === comment.author?.id || user.role === 'admin') ? (
                        <button
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          style={{
                            padding: '2px 8px', borderRadius: 6, border: '1px solid var(--sh-danger-border)',
                            background: 'var(--sh-surface)', color: 'var(--sh-danger)', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', fontFamily: FONT,
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    <MentionText text={comment.content} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

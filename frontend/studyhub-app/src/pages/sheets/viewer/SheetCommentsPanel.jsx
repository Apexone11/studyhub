import { useState } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../../components/MentionText'
import { SkeletonCard } from '../../../components/Skeleton'
import { FONT, panelStyle, timeAgo } from './sheetViewerConstants'

function CommentReactionsSheet({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
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
          fontFamily: FONT,
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
          fontFamily: FONT,
        }}
      >
        {thumbsDownSvg}
        {dislikes > 0 ? dislikes : ''}
      </button>
    </div>
  )
}

export default function SheetCommentsPanel({
  user,
  commentsState,
  commentDraft,
  setCommentDraft,
  commentSaving,
  submitComment,
  deleteComment,
  onReactToComment,
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
                  {user && onReactToComment ? (
                    <CommentReactionsSheet
                      commentId={comment.id}
                      reactionCounts={comment.reactionCounts}
                      userReaction={comment.userReaction}
                      onReact={onReactToComment}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

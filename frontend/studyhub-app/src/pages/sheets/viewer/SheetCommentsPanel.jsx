import { useState } from 'react'
import { Link } from 'react-router-dom'
import GifSearchPanel from '../../../components/GifSearchPanel'
import MentionText from '../../../components/MentionText'
import { SkeletonCard } from '../../../components/Skeleton'
import UserAvatar from '../../../components/UserAvatar'
import { FONT, panelStyle, timeAgo } from './sheetViewerConstants'

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

function CommentReactionsSheet({ commentId, reactionCounts = {}, userReaction = null, onReact }) {
  const likes = reactionCounts.like || 0
  const dislikes = reactionCounts.dislike || 0

  const btnBase = {
    fontSize: 12,
    fontWeight: 500,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'color 0.2s',
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => onReact(commentId, 'like')}
        style={{
          ...btnBase,
          color: userReaction === 'like' ? 'var(--sh-brand)' : 'var(--sh-muted)',
        }}
      >
        Like{likes > 0 ? ` ${likes}` : ''}
      </button>
      <button
        type="button"
        onClick={() => onReact(commentId, 'dislike')}
        style={{
          ...btnBase,
          color: userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-muted)',
        }}
      >
        Dislike{dislikes > 0 ? ` ${dislikes}` : ''}
      </button>
    </div>
  )
}

export default function SheetCommentsPanel({
  user,
  commentsState,
  commentDraft,
  setCommentDraft,
  commentAttachments,
  setCommentAttachments,
  commentSaving,
  submitComment,
  deleteComment,
  onReactToComment,
}) {
  const [commentsExpanded, setCommentsExpanded] = useState(commentsState.total <= 3)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const canSubmit = Boolean(commentDraft.trim() || commentAttachments.length > 0)

  const handleGifSelect = (gif) => {
    setCommentAttachments([createGifAttachment(gif)])
    setShowGifPicker(false)
  }

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
          {user ? (
            <form onSubmit={submitComment} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
              <UserAvatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                role={user.role}
                plan={user.plan}
                size={34}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Share a clarification, correction, or study tip..."
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 20,
                    border: 'none',
                    padding: '10px 14px',
                    font: 'inherit',
                    background: 'var(--sh-soft)',
                    color: 'var(--sh-input-text)',
                    fontSize: 13,
                  }}
                />
                {showGifPicker ? (
                  <GifSearchPanel onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} maxHeight={320} previewHeight={96} />
                ) : null}
                {commentAttachments.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {commentAttachments.map((attachment) => (
                      <div key={attachment.url} style={composerGifCardStyle}>
                        <img src={attachment.url} alt={attachment.name || 'GIF preview'} style={composerGifImageStyle} />
                        <button
                          type="button"
                          onClick={() => setCommentAttachments([])}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
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
                <div>
                  <button
                    type="button"
                    onClick={() => setShowGifPicker((current) => !current)}
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--sh-border)',
                      background: 'transparent',
                      color: showGifPicker || commentAttachments.length > 0 ? 'var(--sh-brand)' : 'var(--sh-text)',
                      fontWeight: 700,
                      fontSize: 12,
                      padding: '9px 12px',
                      cursor: 'pointer',
                      fontFamily: FONT,
                      marginRight: 8,
                    }}
                  >
                    GIF
                  </button>
                  <button
                    type="submit"
                    disabled={commentSaving || !canSubmit}
                    style={{
                      borderRadius: 10,
                      border: 'none',
                      background: canSubmit && !commentSaving ? 'var(--sh-btn-primary-bg)' : 'var(--sh-soft)',
                      color: canSubmit && !commentSaving ? 'var(--sh-btn-primary-text)' : 'var(--sh-muted)',
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
                {commentsState.error ? (
                  <div style={{ fontSize: 12, color: 'var(--sh-danger)', lineHeight: 1.5 }}>
                    {commentsState.error}
                  </div>
                ) : null}
              </div>
            </form>
          ) : (
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
          )}

          {commentsState.loading ? (
            <SkeletonCard style={{ padding: 16, minHeight: 60 }} />
          ) : commentsState.comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>No comments yet</div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
                Be the first to leave feedback -- corrections, study tips, and clarifications help everyone.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {commentsState.comments.map((comment) => (
                <div key={comment.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Link to={`/users/${comment.author?.username}`} style={{ flexShrink: 0 }}>
                    <UserAvatar
                      username={comment.author?.username}
                      avatarUrl={comment.author?.avatarUrl}
                      role={comment.author?.role}
                      plan={comment.author?.plan}
                      size={34}
                    />
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      background: 'var(--sh-soft)',
                      borderRadius: 16,
                      padding: '10px 14px',
                    }}>
                      <Link
                        to={`/users/${comment.author?.username}`}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--sh-text)',
                          textDecoration: 'none',
                          fontFamily: FONT,
                        }}
                      >
                        {comment.author?.username || 'Unknown'}
                      </Link>
                      <div style={{
                        fontSize: 13,
                        color: 'var(--sh-subtext)',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        marginTop: 2,
                      }}>
                        <MentionText text={comment.content} />
                      </div>
                      {comment.attachments && comment.attachments.length > 0 ? (
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 4,
                      paddingLeft: 4,
                    }}>
                      {user && onReactToComment ? (
                        <CommentReactionsSheet
                          commentId={comment.id}
                          reactionCounts={comment.reactionCounts}
                          userReaction={comment.userReaction}
                          onReact={onReactToComment}
                        />
                      ) : null}
                      <span style={{ fontSize: 12, color: 'var(--sh-muted)', fontFamily: FONT }}>
                        {timeAgo(comment.createdAt)}
                      </span>
                      {user && (user.id === comment.author?.id || user.role === 'admin') ? (
                        <button
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--sh-danger)',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
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

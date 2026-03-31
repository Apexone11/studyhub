import { memo } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../components/MentionText'
import PendingReviewBanner from '../../components/PendingReviewBanner'
import {
  IconDownload,
  IconEye,
  IconFork,
  IconStar,
  IconStarFilled,
} from '../../components/Icons'
import { attachmentEndpoints, attachmentPreviewKind } from './feedHelpers'
import { popScale } from '../../lib/animations'
import { Avatar } from './FeedWidgets'
import CommentSection from './CommentSection'
import {
  FONT,
  timeAgo,
  courseColor,
  actionButton,
  linkButton,
  pillStyle,
} from './feedConstants'

function FeedCardInner({
  item,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  isPostMenuOpen,
  onTogglePostMenu,
  isDeletingPost,
  currentUser,
  onReport,
  targetCommentId,
}) {
  const isSheet = item.type === 'sheet'
  const isPost = item.type === 'post'
  const isNote = item.type === 'note'
  const reaction = item.reactions || { likes: 0, dislikes: 0, userReaction: null }
  const urls = attachmentEndpoints(item)
  const previewKind = attachmentPreviewKind(item)

  return (
    <article className="sh-card" data-post-id={item.id}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {item.author?.username ? (
          <Link to={`/users/${item.author.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Avatar username={item.author.username} role="student" avatarUrl={item.author.avatarUrl} />
          </Link>
        ) : (
          <Avatar username={item.type} role="student" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {item.author?.username ? (
                  <Link to={`/users/${item.author.username}`} style={{ fontWeight: 800, color: 'var(--sh-heading)', fontSize: 14, textDecoration: 'none' }}>
                    {item.author.username}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 800, color: 'var(--sh-heading)', fontSize: 14 }}>StudyHub</span>
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    color: item.type === 'announcement' ? '#b45309' : item.type === 'note' ? '#8b5cf6' : courseColor(item.course?.code),
                  }}
                >
                  {item.type}
                </span>
                {item.course?.code ? (
                  <span style={{ fontSize: 11, color: 'var(--sh-subtext)' }}>{item.course.code}</span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>{timeAgo(item.createdAt)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.linkPath && item.type !== 'post' ? (
                <Link to={item.linkPath} style={{ fontSize: 12, color: 'var(--sh-brand)', fontWeight: 700, textDecoration: 'none' }}>
                  Open
                </Link>
              ) : null}
              {(isPost && currentUser) ? (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => onTogglePostMenu(isPostMenuOpen ? null : item.id)}
                    className="feed-post-menu-btn"
                    style={{
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-surface)',
                      borderRadius: 8,
                      color: 'var(--sh-muted)',
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                    aria-label="Post actions"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                  </button>
                  {isPostMenuOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: 36,
                        right: 0,
                        minWidth: 160,
                        borderRadius: 12,
                        border: '1px solid var(--sh-border)',
                        background: 'var(--sh-surface)',
                        boxShadow: 'var(--elevation-3)',
                        padding: 4,
                        zIndex: 3,
                      }}
                    >
                      {item.author?.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => { onTogglePostMenu(null); onReport?.(item.type === 'post' ? 'post' : item.type === 'note' ? 'note' : 'sheet', item.id) }}
                          className="feed-post-menu-item"
                          style={{
                            width: '100%',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sh-warning-text)',
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: 'left',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontFamily: FONT,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'background .15s',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                          Report
                        </button>
                      )}
                      {canDeletePost ? (
                        <button
                          type="button"
                          onClick={() => onDeletePost(item)}
                          disabled={isDeletingPost}
                          className="feed-post-delete-btn"
                          style={{
                            width: '100%',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sh-danger)',
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: 'left',
                            padding: '8px 12px',
                            cursor: isDeletingPost ? 'wait' : 'pointer',
                            fontFamily: FONT,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'background .15s',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          {isDeletingPost ? 'Deleting…' : 'Delete post'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {item.moderationStatus === 'pending_review' && currentUser?.id === item.author?.id && (
            <PendingReviewBanner />
          )}
          {item.title ? <h3 style={{ margin: '0 0 10px', color: 'var(--sh-heading)', fontSize: 19 }}>{item.title}</h3> : null}
          <p style={{ margin: 0, color: 'var(--sh-subtext)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            <MentionText text={item.body || item.content || item.preview || item.description || 'No content yet.'} />
          </p>

          {urls ? (
            <section
              style={{
                marginTop: 14,
                border: '1px solid var(--sh-border)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--sh-soft)',
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 10 }}>
                Attachment: <span style={{ color: 'var(--sh-text)', fontWeight: 700 }}>{item.attachmentName || 'Attachment'}</span>
              </div>
              <div
                style={{
                  border: '1px solid var(--sh-border)',
                  borderRadius: 10,
                  background: 'var(--sh-surface)',
                  overflow: 'hidden',
                  maxHeight: 300,
                }}
              >
                {previewKind === 'image' ? (
                  <img
                    src={urls.previewUrl}
                    alt={item.attachmentName || 'Attachment preview'}
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: 'var(--sh-soft)' }}
                  />
                ) : (
                  <iframe
                    src={urls.previewUrl}
                    title={`Attachment preview ${item.id}`}
                    sandbox="allow-same-origin"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    style={{ width: '100%', height: 300, border: 'none', background: 'var(--sh-surface)' }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <Link to={urls.fullPreviewPath} style={linkButton()}>
                  <IconEye size={14} />
                  Full preview
                </Link>
                {item.allowDownloads !== false ? (
                  <a href={urls.downloadUrl} style={linkButton()}>
                    <IconDownload size={14} />
                    Download original
                  </a>
                ) : (
                  <span style={pillStyle()}>Downloads disabled</span>
                )}
              </div>
            </section>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {isSheet ? (
              <button type="button" onClick={(e) => { popScale(e.currentTarget); onStar(item) }} style={actionButton(item.starred ? '#f59e0b' : '#475569')}>
                {item.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                {item.stars || 0} stars
              </button>
            ) : null}
            {isSheet ? (
              <Link to={item.linkPath} style={linkButton()}>
                <IconDownload size={14} />
                View sheet
              </Link>
            ) : null}
            {isPost ? (
              <button type="button" onClick={(e) => { popScale(e.currentTarget); onReact(item, 'like') }} style={actionButton(reaction.userReaction === 'like' ? '#16a34a' : '#475569')}>
                Like {reaction.likes || 0}
              </button>
            ) : null}
            {isPost ? (
              <button type="button" onClick={(e) => { popScale(e.currentTarget); onReact(item, 'dislike') }} style={actionButton(reaction.userReaction === 'dislike' ? '#dc2626' : '#475569')}>
                Dislike {reaction.dislikes || 0}
              </button>
            ) : null}
            {isSheet ? (
              <button type="button" onClick={(e) => { popScale(e.currentTarget); onReact(item, 'like') }} style={actionButton(reaction.userReaction === 'like' ? '#16a34a' : '#475569')}>
                Helpful {reaction.likes || 0}
              </button>
            ) : null}
            {isSheet ? (
              <button type="button" onClick={(e) => { popScale(e.currentTarget); onReact(item, 'dislike') }} style={actionButton(reaction.userReaction === 'dislike' ? '#dc2626' : '#475569')}>
                Needs work {reaction.dislikes || 0}
              </button>
            ) : null}
            {isNote ? (
              <Link to={item.linkPath} style={linkButton()}>
                <IconEye size={14} />
                Read note
              </Link>
            ) : null}
            {isNote && item.commentCount > 0 ? (
              <span style={pillStyle()}>{item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}</span>
            ) : null}
            {item.downloads ? <span style={pillStyle()}>{item.downloads} downloads</span> : null}
            {item.forks ? <span style={pillStyle()}><IconFork size={13} /> {item.forks} forks</span> : null}
          </div>

          {/* Comment section for posts */}
          {isPost && (
            <CommentSection postId={item.id} commentCount={item.commentCount || 0} user={currentUser} targetCommentId={targetCommentId} />
          )}
        </div>
      </div>
    </article>
  )
}

function feedCardPropsAreEqual(prev, next) {
  return (
    prev.item === next.item
    && prev.canDeletePost === next.canDeletePost
    && prev.isPostMenuOpen === next.isPostMenuOpen
    && prev.isDeletingPost === next.isDeletingPost
    && prev.currentUser === next.currentUser
    && prev.targetCommentId === next.targetCommentId
  )
}

const FeedCard = memo(FeedCardInner, feedCardPropsAreEqual)
export default FeedCard

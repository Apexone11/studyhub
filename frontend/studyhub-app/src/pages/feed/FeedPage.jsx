/* ═══════════════════════════════════════════════════════════════════════════
 * FeedPage.jsx — Social feed with posts, sheet shares, and announcements
 *
 * Layout (responsive via CSS class `app-three-col-grid` in responsive.css):
 *   Desktop: sidebar (250px) | feed column (flex) | leaderboard aside (300px)
 *   Tablet:  sidebar trigger (auto) | feed | aside (280px)
 *   Phone:   single stacked column
 *
 * Features: live polling, post composer with attachments, per-course filters,
 * inline search, leaderboard panels, like/star/helpful reactions (anime.js).
 *
 * Tutorial: First-visit Joyride walkthrough highlights composer, filters,
 * search, and leaderboards. Re-trigger via floating "?" button.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import MentionText from '../../components/MentionText'
import {
  IconDownload,
  IconEye,
  IconFork,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconUpload,
  IconX,
} from '../../components/Icons'
import { API } from '../../config'
import { attachmentEndpoints, attachmentPreviewKind, canUserDeletePost } from './feedHelpers'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'
import { staggerEntrance, popScale } from '../../lib/animations'
import { SkeletonFeed } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { FEED_STEPS } from '../../lib/tutorialSteps'

/* ── Shared constants ──────────────────────────────────────────────────── */
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const FILTERS = ['all', 'posts', 'sheets', 'announcements']
const commentSectionContainerStyle = {
  marginTop: 14,
  borderTop: '1px solid #f1f5f9',
  paddingTop: 12,
}
const commentToggleButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
  fontFamily: FONT,
}
const commentExpandedContentStyle = { marginTop: 12 }
const commentInputRowStyle = { display: 'flex', gap: 8, marginBottom: 12 }
const commentTextareaStyle = {
  width: '100%',
  resize: 'vertical',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: FONT,
  color: '#0f172a',
  boxSizing: 'border-box',
}
const commentInputFooterStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 6,
}
const commentMetaTextStyle = { color: '#94a3b8', fontSize: 13, padding: '8px 0' }
const commentErrorTextStyle = { color: '#dc2626', fontSize: 12, marginTop: 4 }
const commentListStyle = { display: 'grid', gap: 8 }
const commentItemStyle = {
  display: 'flex',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 10,
  background: '#f8fafc',
}
const commentHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 8 }
const commentAuthorStyle = { fontSize: 12, fontWeight: 700, color: '#0f172a' }
const commentTimestampStyle = { fontSize: 11, color: '#94a3b8', marginLeft: 8 }
const commentDeleteButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  fontSize: 11,
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: FONT,
}
const commentBodyStyle = {
  margin: '2px 0 0',
  fontSize: 13,
  color: '#475569',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
}

function commentButtonStyle(hasValue, posting) {
  return {
    borderRadius: 8,
    border: 'none',
    background: hasValue ? '#3b82f6' : '#e2e8f0',
    color: hasValue ? '#fff' : '#94a3b8',
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: posting || !hasValue ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
  }
}

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function courseColor(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  const palette = {
    CMSC: '#8b5cf6',
    MATH: '#10b981',
    ENGL: '#f59e0b',
    PHYS: '#0ea5e9',
    BIOL: '#ec4899',
    HIST: '#6366f1',
    ECON: '#14b8a6',
    CHEM: '#f97316',
  }
  return palette[prefix] || '#2563eb'
}

function Avatar({ username, role, size = 42 }) {
  const initials = (username || '?').slice(0, 2).toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: role === 'admin' ? '#2563eb' : '#0f172a',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.35,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function Panel({ title, children, helper }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, color: '#0f172a', fontWeight: 800 }}>{title}</h2>
          {helper ? <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>{helper}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function LeaderboardPanel({ title, items, renderLabel, empty }) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <div
              key={`${title}-${item.id || item.username || index}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                paddingBottom: 10,
                borderBottom: index === items.length - 1 ? 'none' : '1px solid #f1f5f9',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{renderLabel(item)}</div>
                {'author' in item && item.author?.username ? (
                  <div style={{ fontSize: 12, color: '#64748b' }}>by {item.author.username}</div>
                ) : null}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap' }}>
                {item.count ?? item.stars ?? item.downloads ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function EmptyFeed({ message }) {
  return (
    <div
      style={{
        background: 'var(--sh-surface, #fff)',
        borderRadius: 18,
        border: '2px dashed var(--sh-border, #cbd5e1)',
        padding: '52px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 6 }}>{message}</div>
      <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.6 }}>Posts from your classmates and followed users will appear here.</div>
    </div>
  )
}

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
      setError('Could not connect to the server.')
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
        <div key={comment.id} style={commentItemStyle}>
          <Avatar username={comment.author?.username} role="student" size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={commentHeaderStyle}>
              <div>
                <span style={commentAuthorStyle}>{comment.author?.username || 'Unknown'}</span>
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

function CommentSection({ postId, commentCount, user }) {
  const [expanded, setExpanded] = useState(false)
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

function FeedCard({
  item,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  isPostMenuOpen,
  onTogglePostMenu,
  isDeletingPost,
  currentUser,
}) {
  const isSheet = item.type === 'sheet'
  const isPost = item.type === 'post'
  const reaction = item.reactions || { likes: 0, dislikes: 0, userReaction: null }
  const urls = attachmentEndpoints(item)
  const previewKind = attachmentPreviewKind(item)

  return (
    <article
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e2e8f0',
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Avatar username={item.author?.username || item.type} role="student" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
                  {item.author?.username || 'StudyHub'}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    color: item.type === 'announcement' ? '#b45309' : courseColor(item.course?.code),
                  }}
                >
                  {item.type}
                </span>
                {item.course?.code ? (
                  <span style={{ fontSize: 11, color: '#64748b' }}>{item.course.code}</span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{timeAgo(item.createdAt)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.linkPath && item.type !== 'post' ? (
                <Link to={item.linkPath} style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                  Open
                </Link>
              ) : null}
              {isPost && canDeletePost ? (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => onTogglePostMenu(isPostMenuOpen ? null : item.id)}
                    className="feed-post-menu-btn"
                    style={{
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      borderRadius: 8,
                      color: '#94a3b8',
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
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                        padding: 4,
                        zIndex: 3,
                      }}
                    >
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
                          color: '#dc2626',
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
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {item.title ? <h3 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 19 }}>{item.title}</h3> : null}
          <p style={{ margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            <MentionText text={item.body || item.content || item.preview || item.description || 'No content yet.'} />
          </p>

          {urls ? (
            <section
              style={{
                marginTop: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                background: '#f8fafc',
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                Attachment: <span style={{ color: '#334155', fontWeight: 700 }}>{item.attachmentName || 'Attachment'}</span>
              </div>
              <div
                style={{
                  border: '1px solid #dbe2ef',
                  borderRadius: 10,
                  background: '#fff',
                  overflow: 'hidden',
                  maxHeight: 300,
                }}
              >
                {previewKind === 'image' ? (
                  <img
                    src={urls.previewUrl}
                    alt={item.attachmentName || 'Attachment preview'}
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#f8fafc' }}
                  />
                ) : (
                  <iframe
                    src={urls.previewUrl}
                    title={`Attachment preview ${item.id}`}
                    loading="lazy"
                    style={{ width: '100%', height: 300, border: 'none', background: '#fff' }}
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
            {item.downloads ? <span style={pillStyle()}>{item.downloads} downloads</span> : null}
            {item.forks ? <span style={pillStyle()}><IconFork size={13} /> {item.forks} forks</span> : null}
          </div>

          {/* Comment section for posts */}
          {isPost && (
            <CommentSection postId={item.id} commentCount={item.commentCount || 0} user={currentUser} />
          )}
        </div>
      </div>
    </article>
  )
}

function actionButton(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function pillStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    padding: '8px 12px',
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  }
}

export default function FeedPage() {
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()
  const [feedState, setFeedState] = useState({ items: [], total: 0, loading: true, error: '', partial: false, degradedSections: [] })
  const [leaderboards, setLeaderboards] = useState({ stars: [], downloads: [], contributors: [], error: '' })
  const [composer, setComposer] = useState({ content: '', courseId: '' })
  const [composeState, setComposeState] = useState({ saving: false, error: '' })
  const [attachedFile, setAttachedFile] = useState(null)
  const fileInputRef = useRef(null)
  const feedListRef = useRef(null)
  const feedAnimatedRef = useRef(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // item to confirm-delete
  const [openPostMenuId, setOpenPostMenuId] = useState(null)
  const [deletingPostIds, setDeletingPostIds] = useState({})

  /* Tutorial popup — first-visit or re-trigger via button */
  const tutorial = useTutorial('feed', FEED_STEPS)

  const activeFilter = FILTERS.includes(searchParams.get('filter')) ? searchParams.get('filter') : 'all'
  const search = searchParams.get('search') || ''

  const setQueryParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const loadFeed = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())
    const params = new URLSearchParams({ limit: '24' })
    if (search) params.set('search', search)

    try {
      const response = await fetch(`${API}/api/feed?${params.toString()}`, {
        headers: authHeaders(),
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        return
      }

      if (response.status === 403) {
        apply(() => {
          setFeedState((current) => ({
            ...current,
            loading: false,
            error: getApiErrorMessage(data, 'Access to the feed is temporarily restricted.'),
          }))
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load the feed.'))
      }

      apply(() => {
        setFeedState({
          items: Array.isArray(data.items) ? data.items : [],
          total: data.total || 0,
          loading: false,
          error: '',
          partial: Boolean(data.partial),
          degradedSections: Array.isArray(data.degradedSections) ? data.degradedSections : [],
        })
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => {
        setFeedState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Could not load the feed.',
        }))
      })
    }
  }, [clearSession, search])

  const loadLeaderboards = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const [starsResponse, downloadsResponse, contributorsResponse] = await Promise.all([
        fetch(`${API}/api/sheets/leaderboard?type=stars`, { headers: authHeaders(), signal }),
        fetch(`${API}/api/sheets/leaderboard?type=downloads`, { headers: authHeaders(), signal }),
        fetch(`${API}/api/sheets/leaderboard?type=contributors`, { headers: authHeaders(), signal }),
      ])

      const [stars, downloads, contributors] = await Promise.all([
        starsResponse.json().catch(() => []),
        downloadsResponse.json().catch(() => []),
        contributorsResponse.json().catch(() => []),
      ])

      apply(() => {
        setLeaderboards({
          stars: Array.isArray(stars) ? stars : [],
          downloads: Array.isArray(downloads) ? downloads : [],
          contributors: Array.isArray(contributors) ? contributors : [],
          error: '',
        })
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => {
        setLeaderboards((current) => ({ ...current, error: 'Leaderboards are temporarily unavailable.' }))
      })
    }
  }, [])

  useLivePolling(loadFeed, {
    enabled: Boolean(user),
    intervalMs: 30000,
    refreshKey: `${search}`,
  })

  useLivePolling(loadLeaderboards, {
    enabled: Boolean(user),
    intervalMs: 60000,
  })

  const visibleItems = useMemo(() => {
    if (activeFilter === 'all') return feedState.items
    const nextType = activeFilter === 'announcements' ? 'announcement' : activeFilter.slice(0, -1)
    return feedState.items.filter((item) => item.type === nextType)
  }, [activeFilter, feedState.items])

  // Animate feed cards on first load
  useEffect(() => {
    if (!feedState.loading && visibleItems.length > 0 && feedListRef.current && !feedAnimatedRef.current) {
      feedAnimatedRef.current = true
      staggerEntrance(feedListRef.current.children, { staggerMs: 50, duration: 450, y: 16 })
    }
  }, [feedState.loading, visibleItems.length])

  const submitPost = async (event) => {
    event.preventDefault()
    if (!composer.content.trim()) {
      setComposeState({ saving: false, error: 'Write something before posting.' })
      return
    }

    setComposeState({ saving: true, error: '' })

    try {
      const response = await fetch(`${API}/api/feed/posts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          content: composer.content.trim(),
          courseId: composer.courseId || null,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not post to the feed.')
      }

      /* Upload attachment if one was selected.
       * Field name MUST be 'attachment' to match the multer config in
       * backend/src/routes/upload.js → attachmentUpload.single('attachment'). */
      let finalPost = data
      if (attachedFile && data.id) {
        try {
          const formData = new FormData()
          formData.append('attachment', attachedFile)
          const uploadRes = await fetch(`${API}/api/upload/post-attachment/${data.id}`, {
            method: 'POST',
            body: formData,
          })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json().catch(() => ({}))
            finalPost = { ...data, ...uploadData }
          }
        } catch {
          // Post was created successfully, attachment upload failed silently
        }
      }

      setComposer({ content: '', courseId: '' })
      setAttachedFile(null)
      setComposeState({ saving: false, error: '' })
      setFeedState((current) => ({
        ...current,
        items: [finalPost, ...current.items],
        total: current.total + 1,
      }))
    } catch (error) {
      setComposeState({ saving: false, error: error.message || 'Could not post to the feed.' })
    }
  }

  const toggleReaction = async (item, type) => {
    const currentType = item.reactions?.userReaction || null
    const nextType = currentType === type ? null : type
    const endpoint = item.type === 'post' ? `${API}/api/feed/posts/${item.id}/react` : `${API}/api/sheets/${item.id}/react`

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: nextType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the reaction.')
      }

      setFeedState((current) => ({
        ...current,
        items: current.items.map((entry) => (
          entry.feedKey === item.feedKey
            ? { ...entry, reactions: data }
            : entry
        )),
      }))
    } catch (error) {
      setFeedState((current) => ({ ...current, error: error.message || 'Could not update the reaction.' }))
    }
  }

  const toggleStar = async (item) => {
    try {
      const response = await fetch(`${API}/api/sheets/${item.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the star.')
      }

      setFeedState((current) => ({
        ...current,
        items: current.items.map((entry) => (
          entry.feedKey === item.feedKey
            ? { ...entry, starred: data.starred, stars: data.stars }
            : entry
        )),
      }))
    } catch (error) {
      setFeedState((current) => ({ ...current, error: error.message || 'Could not update the star.' }))
    }
  }

  const canDeletePost = useCallback((item) => canUserDeletePost(user, item), [user])

  const confirmDeletePost = (item) => {
    if (!canDeletePost(item)) return
    setOpenPostMenuId(null)
    setDeleteTarget(item)
  }

  const deletePost = async (item) => {
    setDeleteTarget(null)

    const previousItems = feedState.items
    const previousTotal = feedState.total
    const removedIndex = previousItems.findIndex((entry) => entry.feedKey === item.feedKey)
    if (removedIndex < 0) return
    const removedItem = previousItems[removedIndex]

    setDeletingPostIds((current) => ({ ...current, [item.id]: true }))
    setFeedState((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.feedKey !== item.feedKey),
      total: Math.max(0, current.total - 1),
      error: '',
    }))

    try {
      const response = await fetch(`${API}/api/feed/posts/${item.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not delete this post.')
      }
    } catch (error) {
      setFeedState((current) => {
        const alreadyRestored = current.items.some((entry) => entry.feedKey === removedItem.feedKey)
        if (alreadyRestored) {
          return { ...current, error: error.message || 'Could not delete this post.' }
        }

        const nextItems = [...current.items]
        nextItems.splice(Math.min(removedIndex, nextItems.length), 0, removedItem)

        return {
          ...current,
          items: nextItems,
          total: Math.max(current.total, previousTotal),
          error: error.message || 'Could not delete this post.',
        }
      })
    } finally {
      setDeletingPostIds((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
    }
  }

  return (
    <>
      <Navbar />
      <div style={{ background: '#edf0f5', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('app', 26, 48)}>
          {/* 3-column responsive grid: sidebar | feed | right panels
           * Desktop: all 3 columns visible
           * Tablet:  sidebar trigger (auto) + feed + right panels
           * Phone:   single column, everything stacked */}
          <div className="app-three-col-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main style={{ display: 'grid', gap: 18 }}>
              <div data-tutorial="feed-composer">
              <Panel title="Share with your classmates" helper="Post class notes, course questions, or links to your latest sheet.">
                <form onSubmit={submitPost} style={{ display: 'grid', gap: 12 }}>
                  <textarea
                    value={composer.content}
                    onChange={(event) => setComposer((current) => ({ ...current, content: event.target.value }))}
                    placeholder="Share an update, mention classmates with @username, or point people to a great sheet..."
                    rows={4}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 14,
                      border: '1px solid #cbd5e1',
                      padding: 14,
                      font: 'inherit',
                      color: '#0f172a',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <select
                      value={composer.courseId}
                      onChange={(event) => setComposer((current) => ({ ...current, courseId: event.target.value }))}
                      style={{ minWidth: 140, maxWidth: 200, borderRadius: 10, border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: 13, fontFamily: FONT }}
                    >
                      <option value="">All courses</option>
                      {(user?.enrollments || []).map((enrollment) => (
                        <option key={enrollment.course.id} value={enrollment.course.id}>
                          {enrollment.course.code}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              setComposeState((s) => ({ ...s, error: 'File must be under 10 MB.' }))
                              return
                            }
                            setAttachedFile(file)
                          }
                          e.target.value = ''
                        }}
                      />
                      <button type="button" onClick={() => fileInputRef.current?.click()} style={linkButton()}>
                        <IconUpload size={14} />
                        Attach file
                      </button>
                      <button
                        type="submit"
                        disabled={composeState.saving}
                        style={{
                          borderRadius: 10,
                          border: 'none',
                          background: '#3b82f6',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 13,
                          padding: '11px 16px',
                          cursor: composeState.saving ? 'wait' : 'pointer',
                          fontFamily: FONT,
                        }}
                      >
                        {composeState.saving ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </div>
                  {attachedFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569' }}>
                      <IconUpload size={12} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>{(attachedFile.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><IconX size={12} /></button>
                    </div>
                  )}
                  {composeState.error ? <div style={{ color: '#dc2626', fontSize: 13 }}>{composeState.error}</div> : null}
                </form>
              </Panel>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div data-tutorial="feed-filters" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setQueryParam('filter', filter === 'all' ? '' : filter)}
                      style={{
                        borderRadius: 999,
                        border: filter === activeFilter ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                        background: filter === activeFilter ? '#eff6ff' : '#fff',
                        color: filter === activeFilter ? '#1d4ed8' : '#475569',
                        padding: '9px 14px',
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <input
                  data-tutorial="feed-search"
                  value={search}
                  onChange={(event) => setQueryParam('search', event.target.value)}
                  placeholder="Search the feed..."
                  style={{
                    maxWidth: 240,
                    borderRadius: 12,
                    border: '1px solid #cbd5e1',
                    padding: '8px 12px',
                    fontSize: 13,
                    fontFamily: FONT,
                  }}
                />
              </div>

              {feedState.partial ? (
                <div
                  style={{
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    borderRadius: 14,
                    padding: '12px 14px',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  Feed loaded in reduced mode. {feedState.degradedSections.join(', ')}.
                </div>
              ) : null}

              {feedState.error ? (
                <div
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: 14,
                    padding: '12px 14px',
                    fontSize: 13,
                  }}
                >
                  {feedState.error}
                </div>
              ) : null}

              {feedState.loading ? (
                <SkeletonFeed count={3} />
              ) : visibleItems.length === 0 ? (
                <EmptyFeed message="No feed items matched this filter." />
              ) : (
                <div ref={feedListRef} style={{ display: 'grid', gap: 14 }}>
                  {visibleItems.map((item) => (
                    <FeedCard
                      key={item.feedKey}
                      item={item}
                      onReact={toggleReaction}
                      onStar={toggleStar}
                      onDeletePost={confirmDeletePost}
                      canDeletePost={canDeletePost(item)}
                      isPostMenuOpen={openPostMenuId === item.id}
                      onTogglePostMenu={setOpenPostMenuId}
                      isDeletingPost={Boolean(deletingPostIds[item.id])}
                      currentUser={user}
                    />
                  ))}
                </div>
              )}
            </main>

            <aside className="feed-aside" data-tutorial="feed-leaderboards" style={{ display: 'grid', gap: 16 }}>
              <LeaderboardPanel
                title="Top Starred"
                items={leaderboards.stars}
                empty="No starred sheets yet."
                renderLabel={(item) => item.title}
              />
              <LeaderboardPanel
                title="Most Downloaded"
                items={leaderboards.downloads}
                empty="No downloads yet."
                renderLabel={(item) => item.title}
              />
              <LeaderboardPanel
                title="Top Contributors"
                items={leaderboards.contributors}
                empty="No contributor activity yet."
                renderLabel={(item) => item.username}
              />
              <Panel title="Version 1 collaboration tips">
                <div style={{ display: 'grid', gap: 10, color: '#475569', fontSize: 13, lineHeight: 1.7 }}>
                  <div>Post updates with @mentions, fork a sheet before improving it, and send contributions back from your fork so the original author can review safely.</div>
                  <Link to="/sheets/upload" style={{ ...linkButton(), justifyContent: 'center' }}>
                    <IconPlus size={13} />
                    New Sheet
                  </Link>
                </div>
              </Panel>
              {leaderboards.error ? <div style={{ color: '#dc2626', fontSize: 13 }}>{leaderboards.error}</div> : null}
            </aside>
          </div>
        </div>
      </div>
      {/* Tutorial popup — first-visit auto-start or re-trigger */}
      <SafeJoyride {...tutorial.joyrideProps} />

      {/* Floating re-trigger button for tutorial */}
      {tutorial.seen && (
        <button
          type="button"
          onClick={tutorial.restart}
          title="Show tutorial"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
            fontFamily: FONT,
          }}
        >
          ?
        </button>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this post?"
        message="This action cannot be undone. The post and any attachments will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deleteTarget && deletePost(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

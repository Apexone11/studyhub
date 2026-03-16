import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AppSidebar from '../components/AppSidebar'
import {
  IconDownload,
  IconFork,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconUpload,
} from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'
import { getStoredUser } from '../lib/session'
import { useLivePolling } from '../lib/useLivePolling'
import { API } from '../config'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

const authHeaders = () => ({
  'Content-Type': 'application/json',
})

const COURSE_COLORS = {
  CMSC: '#8b5cf6',
  MATH: '#10b981',
  ENGL: '#f59e0b',
  PHYS: '#0ea5e9',
  BIOL: '#ec4899',
  HIST: '#6366f1',
  ECON: '#14b8a6',
  CHEM: '#f97316',
}

function courseColor(code = '') {
  return COURSE_COLORS[code.replace(/\d.*/, '').toUpperCase()] || '#3b82f6'
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

function Avatar({ user, size = 38 }) {
  const name = user?.username || '?'
  const initials = name.slice(0, 2).toUpperCase()
  const bg = user?.role === 'admin' ? '#1d4ed8' : '#0f172a'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.34,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function TinyBadge({ text, color = '#64748b', background = '#f1f5f9', border = '#e2e8f0' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 999,
        background,
        color,
        border: `1px solid ${border}`,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  )
}

function actionBtn(active = false, tone = '#64748b') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 9,
    border: `1px solid ${active ? `${tone}30` : '#e2e8f0'}`,
    background: active ? `${tone}12` : '#fff',
    color: active ? tone : '#64748b',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function cardStyles(expanded) {
  return {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: expanded ? '0 14px 40px rgba(15,23,42,0.10)' : '0 2px 10px rgba(15,23,42,0.05)',
    overflow: 'hidden',
    transition: 'box-shadow .18s ease, transform .18s ease',
  }
}

function AttachmentPanel({ label, href, allowDownloads, helperText }) {
  if (!label) return null

  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Attachment
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: allowDownloads ? 10 : 0 }}>
        {label}
      </div>
      {allowDownloads && href ? (
        <a
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 8,
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <IconDownload size={13} />
          Download file
        </a>
      ) : (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {helperText || 'The author disabled downloads for this attachment.'}
        </div>
      )}
    </div>
  )
}

function CommentComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Write a comment...',
}) {
  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={500}
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #dbe1e8',
          resize: 'vertical',
          outline: 'none',
          fontSize: 13,
          fontFamily: FONT,
          color: '#0f172a',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{value.length}/500</span>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          style={{
            padding: '7px 14px',
            border: 'none',
            borderRadius: 8,
            background: disabled || !value.trim() ? '#bfdbfe' : '#3b82f6',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            fontFamily: FONT,
          }}
        >
          {disabled ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
    </form>
  )
}

function CommentList({ comments, currentUser, onDelete }) {
  if (!comments || comments.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0 2px' }}>
        No comments yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {comments.map((comment) => (
        <div
          key={comment.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 0',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <Avatar user={comment.author} size={30} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <strong style={{ fontSize: 12, color: '#0f172a' }}>{comment.author?.username}</strong>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(comment.createdAt)}</span>
            </div>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {comment.content}
            </div>
          </div>
          {currentUser && (currentUser.id === comment.userId || currentUser.role === 'admin') && (
            <button
              onClick={() => onDelete(comment.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: FONT,
              }}
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function ContributionList({ contributions, onReview, reviewing }) {
  if (!contributions || contributions.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
        Contribution Requests
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {contributions.map((contribution) => (
          <div
            key={contribution.id}
            style={{
              borderRadius: 12,
              border: '1px solid #dbe1e8',
              background: '#f8fafc',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>
                {contribution.proposer?.username}
              </strong>
              <TinyBadge
                text={contribution.status.toUpperCase()}
                color={contribution.status === 'pending' ? '#1d4ed8' : contribution.status === 'accepted' ? '#166534' : '#b91c1c'}
                background={contribution.status === 'pending' ? '#eff6ff' : contribution.status === 'accepted' ? '#f0fdf4' : '#fef2f2'}
                border={contribution.status === 'pending' ? '#bfdbfe' : contribution.status === 'accepted' ? '#bbf7d0' : '#fecaca'}
              />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(contribution.createdAt)}</span>
            </div>
            <div style={{ fontSize: 12, color: '#334155', marginBottom: contribution.message ? 8 : 0 }}>
              Forked sheet: <strong>{contribution.forkSheet?.title}</strong>
            </div>
            {contribution.message && (
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 10 }}>
                {contribution.message}
              </div>
            )}
            {contribution.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onReview(contribution.id, 'accept')}
                  disabled={reviewing}
                  style={{
                    ...actionBtn(false, '#166534'),
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                  }}
                >
                  Accept
                </button>
                <button
                  onClick={() => onReview(contribution.id, 'reject')}
                  disabled={reviewing}
                  style={{
                    ...actionBtn(false, '#dc2626'),
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                  }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function FeedItemCard({
  item,
  expanded,
  detail,
  currentUser,
  commentText,
  onToggle,
  onStarSheet,
  onReact,
  onCommentChange,
  onCommentSubmit,
  onCommentDelete,
  onContribute,
  onReviewContribution,
  busyKey,
}) {
  const author = item.author || { username: 'unknown' }
  const courseCode = item.course?.code
  const canSubmitContribution = item.type === 'sheet'
    && detail?.forkSource
    && currentUser
    && currentUser.id === detail.userId
    && detail.forkSource.userId !== currentUser.id
  const canReviewContributions = item.type === 'sheet'
    && Array.isArray(detail?.incomingContributions)
    && detail.incomingContributions.length > 0

  const bodyText = item.type === 'sheet'
    ? detail?.content || item.preview || item.description || ''
    : detail?.content || item.body || item.preview || ''

  return (
    <div
      id={item.feedKey}
      style={cardStyles(expanded)}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '18px 18px 16px',
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        {item.type === 'announcement' && item.pinned && (
          <div
            style={{
              display: 'inline-flex',
              marginBottom: 10,
              padding: '3px 8px',
              borderRadius: 999,
              background: '#fffbeb',
              color: '#92400e',
              border: '1px solid #fde68a',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Pinned Announcement
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar user={author} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                {author.username}
              </span>
              {item.type === 'announcement' && (
                <TinyBadge text="ANNOUNCEMENT" color="#92400e" background="#fffbeb" border="#fde68a" />
              )}
              {courseCode && (
                <TinyBadge
                  text={courseCode}
                  color={courseColor(courseCode)}
                  background={`${courseColor(courseCode)}12`}
                  border={`${courseColor(courseCode)}40`}
                />
              )}
              {item.type === 'sheet' && item.forkSource && (
                <TinyBadge text={`Fork of ${item.forkSource.title}`} color="#166534" background="#f0fdf4" border="#bbf7d0" />
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
              {item.type === 'sheet' ? 'Study Sheet' : item.type === 'post' ? 'Post' : 'Update'} · {timeAgo(item.createdAt)}
            </div>
            {item.title && (
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                {item.title}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: expanded ? 'pre-wrap' : 'normal' }}>
              {expanded ? bodyText : item.preview || item.body || item.description || ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, fontSize: 12, color: '#94a3b8' }}>
          {item.type === 'sheet' && (
            <>
              <span><IconStar size={12} /> {item.stars ?? detail?.stars ?? 0}</span>
              <span><IconFork size={12} /> {item.forks ?? detail?.forks ?? 0}</span>
              <span><IconDownload size={12} /> {item.downloads ?? detail?.downloads ?? 0}</span>
            </>
          )}
          {item.type !== 'announcement' && (
            <>
              <span><i className="fas fa-thumbs-up" style={{ marginRight: 4 }}></i>{item.reactions?.likes ?? detail?.reactions?.likes ?? 0}</span>
              <span><i className="fas fa-thumbs-down" style={{ marginRight: 4 }}></i>{item.reactions?.dislikes ?? detail?.reactions?.dislikes ?? 0}</span>
              <span><i className="fas fa-comments" style={{ marginRight: 4 }}></i>{item.commentCount ?? detail?.commentCount ?? 0}</span>
            </>
          )}
          <span style={{ marginLeft: 'auto', color: '#3b82f6', fontWeight: 700 }}>
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </div>
      </button>

      {expanded && item.type !== 'announcement' && detail && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
          {item.type === 'sheet' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 14 }}>
              <button onClick={() => onStarSheet(item.id)} style={actionBtn(detail.starred, '#f59e0b')}>
                {detail.starred ? <IconStarFilled size={13} style={{ color: '#f59e0b' }} /> : <IconStar size={13} />}
                {detail.starred ? 'Starred' : 'Star'}
              </button>
              <button onClick={() => onReact(item.type, item.id, 'like')} style={actionBtn(detail.reactions?.userReaction === 'like', '#1d4ed8')}>
                <i className="fas fa-thumbs-up" style={{ fontSize: 12 }}></i>
                Like
              </button>
              <button onClick={() => onReact(item.type, item.id, 'dislike')} style={actionBtn(detail.reactions?.userReaction === 'dislike', '#dc2626')}>
                <i className="fas fa-thumbs-down" style={{ fontSize: 12 }}></i>
                Dislike
              </button>
              <Link to={`/sheets/${item.id}`} style={{ ...actionBtn(false), textDecoration: 'none' }}>
                View full sheet
              </Link>
              {detail.allowDownloads && (
                <a href={`${API}/api/sheets/${item.id}/download`} style={{ ...actionBtn(false), textDecoration: 'none' }}>
                  <IconDownload size={13} />
                  Download .md
                </a>
              )}
              {detail.forkSource ? (
                <button
                  onClick={onContribute}
                  disabled={busyKey === `contribute-${item.feedKey}` || !canSubmitContribution}
                  style={actionBtn(false, '#166534')}
                >
                  <IconFork size={13} />
                  {canSubmitContribution ? 'Contribute back' : 'Contribution sent from your fork page'}
                </button>
              ) : (
                <Link to={`/sheets/${item.id}`} style={{ ...actionBtn(false, '#166534'), textDecoration: 'none' }}>
                  <IconFork size={13} />
                  Fork
                </Link>
              )}
            </div>
          )}

          {item.type === 'post' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 14 }}>
              <button onClick={() => onReact(item.type, item.id, 'like')} style={actionBtn(detail.reactions?.userReaction === 'like', '#1d4ed8')}>
                <i className="fas fa-thumbs-up" style={{ fontSize: 12 }}></i>
                Like
              </button>
              <button onClick={() => onReact(item.type, item.id, 'dislike')} style={actionBtn(detail.reactions?.userReaction === 'dislike', '#dc2626')}>
                <i className="fas fa-thumbs-down" style={{ fontSize: 12 }}></i>
                Dislike
              </button>
            </div>
          )}

          <AttachmentPanel
            label={detail.attachmentName || (detail.hasAttachment ? 'Attached file' : '')}
            href={item.type === 'sheet' ? `${API}/api/sheets/${item.id}/attachment` : `${API}/api/feed/posts/${item.id}/attachment`}
            allowDownloads={detail.allowDownloads && detail.hasAttachment}
          />

          {canReviewContributions && (
            <ContributionList
              contributions={detail.incomingContributions}
              reviewing={busyKey === `review-${item.feedKey}`}
              onReview={onReviewContribution}
            />
          )}

          {detail.outgoingContributions?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Your Contribution Status
              </div>
              {detail.outgoingContributions.map((contribution) => (
                <div key={contribution.id} style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                  <strong>{contribution.status.toUpperCase()}</strong> · {timeAgo(contribution.createdAt)}
                  {contribution.message ? ` · ${contribution.message}` : ''}
                </div>
              ))}
            </div>
          )}

          <CommentComposer
            value={commentText}
            onChange={onCommentChange}
            onSubmit={onCommentSubmit}
            disabled={busyKey === `comment-${item.feedKey}`}
            placeholder="Reply, ask a question, or mention someone with @username"
          />
          <CommentList
            comments={detail.comments || []}
            currentUser={currentUser}
            onDelete={onCommentDelete}
          />
        </div>
      )}
    </div>
  )
}

function RightSidebar({ leaderStars, leaderDownloads, leaderContribs }) {
  return (
    <div style={{ position: 'sticky', top: 74, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[{
        title: 'Top Starred',
        items: leaderStars,
        tone: '#f59e0b',
        renderMeta: (item) => `${item.stars || 0} stars`,
      }, {
        title: 'Most Downloaded',
        items: leaderDownloads,
        tone: '#3b82f6',
        renderMeta: (item) => `${item.downloads || 0} downloads`,
      }].map((section) => (
        <div key={section.title} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
            {section.title.toUpperCase()}
          </div>
          {section.items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>No data yet.</div>
          ) : (
            section.items.map((item) => (
              <Link key={item.id} to={`/sheets/${item.id}`} style={{ display: 'block', textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{section.renderMeta(item)}</div>
              </Link>
            ))
          )}
        </div>
      ))}

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
          TOP CONTRIBUTORS
        </div>
        {leaderContribs.length === 0 ? (
          <div style={{ fontSize: 12, color: '#cbd5e1' }}>No data yet.</div>
        ) : (
          leaderContribs.map((item, index) => (
            <div key={item.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: index < leaderContribs.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <Avatar user={{ username: item.username }} size={28} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.username}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.count} sheets shared</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ background: '#0f172a', color: '#fff', borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Version 1 collaboration tips</div>
        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7 }}>
          Post updates with `@mentions`, fork a sheet before improving it, and send contributions back from your fork so the original author can review safely.
        </div>
      </div>
    </div>
  )
}

const ATTACH_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ATTACH_ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']
const ATTACH_MAX_BYTES = 10 * 1024 * 1024

function validateAttachment(file) {
  if (!file) return ''
  const ext = `.${file.name.split('.').pop().toLowerCase()}`
  if (!ATTACH_ALLOWED_TYPES.includes(file.type) || !ATTACH_ALLOWED_EXT.includes(ext)) {
    return 'Attachment must be a PDF or image file.'
  }
  if (file.size > ATTACH_MAX_BYTES) return 'Attachment must be 10 MB or smaller.'
  return ''
}

export default function FeedPage() {
  const [searchParams] = useSearchParams()
  const currentUser = getStoredUser()
  const fileInputRef = useRef(null)
  const searchTimer = useRef(null)

  const [filter, setFilter] = useState('all')
  const [feedItems, setFeedItems] = useState([])
  const [expandedKey, setExpandedKey] = useState(null)
  const [detailsByKey, setDetailsByKey] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [leaderStars, setLeaderStars] = useState([])
  const [leaderDownloads, setLeaderDownloads] = useState([])
  const [leaderContribs, setLeaderContribs] = useState([])
  const [courses, setCourses] = useState([])

  const [compose, setCompose] = useState('')
  const [composeCourseId, setComposeCourseId] = useState('')
  const [composeAttach, setComposeAttach] = useState(null)
  const [composeAttachErr, setComposeAttachErr] = useState('')
  const [composeAllowDownloads, setComposeAllowDownloads] = useState(true)

  const visibleItems = useMemo(
    () => filter === 'all' ? feedItems : feedItems.filter((item) => item.type === filter),
    [feedItems, filter]
  )

  const loadFeed = useCallback(async ({ signal, startTransition, query = searchQuery.trim() } = {}) => {
    try {
      const params = new URLSearchParams({ limit: '24' })
      if (query) params.set('search', query)
      const response = await fetch(`${API}/api/feed?${params.toString()}`, {
        headers: authHeaders(),
        signal,
      })
      if (!response.ok) throw new Error('Could not load the feed.')
      const data = await response.json()
      startTransition(() => {
        setFeedItems(data.items || [])
        setLoading(false)
      })
    } catch (loadError) {
      if (loadError?.name !== 'AbortError') {
        setError(loadError.message || 'Could not load the feed.')
        setLoading(false)
      }
    }
  }, [searchQuery])

  const loadLeaderboards = useCallback(async ({ signal, startTransition } = {}) => {
    const [starsResponse, downloadsResponse, contribsResponse] = await Promise.all([
      fetch(`${API}/api/sheets/leaderboard?type=stars`, { signal }),
      fetch(`${API}/api/sheets/leaderboard?type=downloads`, { signal }),
      fetch(`${API}/api/sheets/leaderboard?type=contributors`, { signal }),
    ])

    const [stars, downloads, contribs] = await Promise.all([
      starsResponse.ok ? starsResponse.json() : [],
      downloadsResponse.ok ? downloadsResponse.json() : [],
      contribsResponse.ok ? contribsResponse.json() : [],
    ])

    startTransition(() => {
      setLeaderStars(Array.isArray(stars) ? stars : [])
      setLeaderDownloads(Array.isArray(downloads) ? downloads : [])
      setLeaderContribs(Array.isArray(contribs) ? contribs : [])
    })
  }, [])

  useEffect(() => {
    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => setCourses((data || []).flatMap((school) => school.courses || [])))
      .catch(() => {})
  }, [])

  useLivePolling(loadFeed, {
    enabled: true,
    intervalMs: 25000,
  })

  useLivePolling(loadLeaderboards, {
    enabled: true,
    intervalMs: 60000,
  })

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setLoading(true)
      setError('')
      void loadFeed({ query: searchQuery.trim() })
    }, searchQuery.trim() ? 280 : 0)
    return () => clearTimeout(searchTimer.current)
  }, [searchQuery, loadFeed])

  const loadItemDetail = useCallback(async (item) => {
    if (!item || item.type === 'announcement') return
    const key = item.feedKey
    const detailUrl = item.type === 'sheet' ? `${API}/api/sheets/${item.id}` : `${API}/api/feed/posts/${item.id}`
    const commentsUrl = item.type === 'sheet' ? `${API}/api/sheets/${item.id}/comments` : `${API}/api/feed/posts/${item.id}/comments`

    const [detailResponse, commentsResponse] = await Promise.all([
      fetch(detailUrl, { headers: authHeaders() }),
      fetch(commentsUrl, { headers: authHeaders() }),
    ])
    if (!detailResponse.ok || !commentsResponse.ok) {
      throw new Error('Could not load item details.')
    }

    const [detail, commentsData] = await Promise.all([detailResponse.json(), commentsResponse.json()])
    setDetailsByKey((current) => ({
      ...current,
      [key]: {
        ...detail,
        comments: commentsData.comments || [],
      },
    }))
  }, [])

  useEffect(() => {
    const targetPost = Number.parseInt(searchParams.get('post') || '', 10)
    if (!Number.isInteger(targetPost) || feedItems.length === 0) return

    const match = feedItems.find((item) => item.type === 'post' && item.id === targetPost)
    if (!match) return

    setExpandedKey(match.feedKey)
    if (!detailsByKey[match.feedKey]) {
      void loadItemDetail(match)
    }
    setTimeout(() => {
      document.getElementById(match.feedKey)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [detailsByKey, feedItems, loadItemDetail, searchParams])

  function setCommentDraft(key, value) {
    setCommentDrafts((current) => ({ ...current, [key]: value }))
  }

  async function handleToggle(item) {
    if (expandedKey === item.feedKey) {
      setExpandedKey(null)
      return
    }

    setExpandedKey(item.feedKey)
    if (!detailsByKey[item.feedKey] && item.type !== 'announcement') {
      try {
        await loadItemDetail(item)
      } catch (detailError) {
        setError(detailError.message)
      }
    }
  }

  async function handleCreatePost(event) {
    event.preventDefault()
    if (!compose.trim()) return

    setBusyKey('compose')
    setComposeAttachErr('')
    try {
      const response = await fetch(`${API}/api/feed/posts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          content: compose.trim(),
          courseId: composeCourseId || null,
          allowDownloads: composeAllowDownloads,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not publish your post.')

      if (composeAttach) {
        const formData = new FormData()
        formData.append('attachment', composeAttach)
        const uploadResponse = await fetch(`${API}/api/upload/post-attachment/${data.id}`, {
          method: 'POST',
          body: formData,
        })
        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json()
          throw new Error(uploadData.error || 'The post was created, but the attachment upload failed.')
        }
      }

      setCompose('')
      setComposeCourseId('')
      setComposeAttach(null)
      setComposeAllowDownloads(true)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setLoading(true)
      await loadFeed({ query: searchQuery.trim() })
    } catch (createError) {
      setComposeAttachErr(createError.message || 'Could not create your post.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleStarSheet(sheetId) {
    const key = `sheet-${sheetId}`
    setBusyKey(`star-${key}`)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/star`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update star.')

      setFeedItems((items) => items.map((item) => item.type === 'sheet' && item.id === sheetId
        ? { ...item, starred: data.starred, stars: data.stars }
        : item
      ))
      setDetailsByKey((current) => current[key]
        ? { ...current, [key]: { ...current[key], starred: data.starred, stars: data.stars } }
        : current
      )
    } catch (starError) {
      setError(starError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleReact(type, id, reaction) {
    const key = `${type}-${id}`
    setBusyKey(`react-${key}`)
    try {
      const endpoint = type === 'sheet' ? `${API}/api/sheets/${id}/react` : `${API}/api/feed/posts/${id}/react`
      const currentReaction = detailsByKey[key]?.reactions?.userReaction || null
      const nextReaction = currentReaction === reaction ? null : reaction
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: nextReaction }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update reaction.')

      setFeedItems((items) => items.map((item) => item.type === type && item.id === id
        ? { ...item, reactions: data }
        : item
      ))
      setDetailsByKey((current) => current[key]
        ? { ...current, [key]: { ...current[key], reactions: data } }
        : current
      )
    } catch (reactError) {
      setError(reactError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleCommentSubmit(type, id) {
    const key = `${type}-${id}`
    const content = commentDrafts[key]?.trim()
    if (!content) return

    setBusyKey(`comment-${key}`)
    try {
      const endpoint = type === 'sheet' ? `${API}/api/sheets/${id}/comments` : `${API}/api/feed/posts/${id}/comments`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not post comment.')

      setCommentDrafts((current) => ({ ...current, [key]: '' }))
      setDetailsByKey((current) => current[key]
        ? {
            ...current,
            [key]: {
              ...current[key],
              comments: [data, ...(current[key].comments || [])],
              commentCount: (current[key].commentCount || 0) + 1,
            },
          }
        : current
      )
      setFeedItems((items) => items.map((item) => item.type === type && item.id === id
        ? { ...item, commentCount: (item.commentCount || 0) + 1 }
        : item
      ))
    } catch (commentError) {
      setError(commentError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleCommentDelete(type, id, commentId) {
    const key = `${type}-${id}`
    try {
      const endpoint = type === 'sheet'
        ? `${API}/api/sheets/${id}/comments/${commentId}`
        : `${API}/api/feed/posts/${id}/comments/${commentId}`
      await fetch(endpoint, { method: 'DELETE', headers: authHeaders() })
      setDetailsByKey((current) => current[key]
        ? {
            ...current,
            [key]: {
              ...current[key],
              comments: (current[key].comments || []).filter((comment) => comment.id !== commentId),
              commentCount: Math.max(0, (current[key].commentCount || 0) - 1),
            },
          }
        : current
      )
      setFeedItems((items) => items.map((item) => item.type === type && item.id === id
        ? { ...item, commentCount: Math.max(0, (item.commentCount || 0) - 1) }
        : item
      ))
    } catch {
      setError('Could not delete that comment.')
    }
  }

  async function handleContributeBack(item) {
    const message = window.prompt('Add a short note for the original author (optional):', '') || ''
    setBusyKey(`contribute-${item.feedKey}`)
    try {
      const response = await fetch(`${API}/api/sheets/${item.id}/contributions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not send your contribution.')
      await loadItemDetail(item)
    } catch (contributionError) {
      setError(contributionError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleContributionReview(item, contributionId, action) {
    setBusyKey(`review-${item.feedKey}`)
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not review that contribution.')
      await loadItemDetail(item)
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setBusyKey('')
    }
  }

  const navActions = (
    <Link
      to="/sheets/upload"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        background: '#3b82f6',
        color: '#fff',
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <IconUpload size={13} />
      Upload Sheet
    </Link>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Feed', to: '/feed' }]} hideTabs actions={navActions} />
      <div style={{ ...pageShell('app'), display: 'grid', gridTemplateColumns: pageColumns.appThreeColumn, gap: 20 }}>
        <AppSidebar />

        <main>
          <form onSubmit={handleCreatePost} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar user={currentUser} />
              <div style={{ flex: 1 }}>
                <textarea
                  value={compose}
                  onChange={(event) => setCompose(event.target.value.slice(0, 2000))}
                  placeholder="Share an update, mention classmates with @username, or point people to a great sheet..."
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'vertical', fontSize: 14, color: '#0f172a', fontFamily: FONT, lineHeight: 1.7 }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12 }}>
                  <select
                    value={composeCourseId}
                    onChange={(event) => setComposeCourseId(event.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #dbe1e8', fontSize: 12, fontFamily: FONT, color: '#475569' }}
                  >
                    <option value="">General post</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.code}</option>
                    ))}
                  </select>

                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    const validationError = validateAttachment(file)
                    if (validationError) {
                      setComposeAttachErr(validationError)
                      event.target.value = ''
                      return
                    }
                    setComposeAttachErr('')
                    setComposeAttach(file)
                  }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={actionBtn(false)}>
                    <IconPlus size={13} />
                    {composeAttach ? 'Change file' : 'Attach file'}
                  </button>
                  {composeAttach && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
                      <input type="checkbox" checked={composeAllowDownloads} onChange={(event) => setComposeAllowDownloads(event.target.checked)} />
                      Allow downloads
                    </label>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{compose.length}/2000</span>
                    <button type="submit" disabled={busyKey === 'compose' || !compose.trim()} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: busyKey === 'compose' || !compose.trim() ? '#bfdbfe' : '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 800, cursor: busyKey === 'compose' || !compose.trim() ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                      {busyKey === 'compose' ? 'Posting...' : 'Post to Feed'}
                    </button>
                  </div>
                </div>
                {composeAttach && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                    Attached: <strong>{composeAttach.name}</strong>
                  </div>
                )}
                {composeAttachErr && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{composeAttachErr}</div>
                )}
              </div>
            </div>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                ['all', 'All'],
                ['post', 'Posts'],
                ['sheet', 'Sheets'],
                ['announcement', 'Announcements'],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)} style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid', borderColor: filter === key ? '#3b82f6' : '#e2e8f0', background: filter === key ? '#eff6ff' : '#fff', color: filter === key ? '#1d4ed8' : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
                  {label}
                </button>
              ))}
            </div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search the feed..."
              style={{ width: 240, maxWidth: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid #dbe1e8', fontSize: 12, color: '#475569', fontFamily: FONT }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Loading feed...</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px dashed #cbd5e1', padding: '42px 26px', textAlign: 'center', color: '#94a3b8' }}>
              No feed items matched this filter.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleItems.map((item) => (
                <FeedItemCard
                  key={item.feedKey}
                  item={item}
                  expanded={expandedKey === item.feedKey}
                  detail={detailsByKey[item.feedKey]}
                  currentUser={currentUser}
                  commentText={commentDrafts[item.feedKey] || ''}
                  busyKey={busyKey}
                  onToggle={() => handleToggle(item)}
                  onStarSheet={handleStarSheet}
                  onReact={handleReact}
                  onCommentChange={(value) => setCommentDraft(item.feedKey, value)}
                  onCommentSubmit={(event) => {
                    event.preventDefault()
                    void handleCommentSubmit(item.type, item.id)
                  }}
                  onCommentDelete={(commentId) => void handleCommentDelete(item.type, item.id, commentId)}
                  onContribute={() => void handleContributeBack(item)}
                  onReviewContribution={(contributionId, action) => void handleContributionReview(item, contributionId, action)}
                />
              ))}
            </div>
          )}
        </main>

        <RightSidebar
          leaderStars={leaderStars}
          leaderDownloads={leaderDownloads}
          leaderContribs={leaderContribs}
        />
      </div>
    </div>
  )
}

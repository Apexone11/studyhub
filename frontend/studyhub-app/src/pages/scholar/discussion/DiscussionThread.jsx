/**
 * DiscussionThread.jsx — Threaded comments for a paper's peer-review
 * sidecar tab.
 *
 * Behaviour:
 *  - List of starter posts (root threads), each with author avatar +
 *    name, a 3-line clamped snippet, reply count, and relative time.
 *  - "New thread" button appears only when the user is logged in.
 *  - Click a root → expand replies inline. Threaded one level deep.
 *  - Reply composer: textarea + Post button. 280-char limit. Cmd/Ctrl+
 *    Enter posts.
 *  - Block-aware: server filters cross-blocked users from the response;
 *    we wrap defensive try/catch around name rendering so a malformed
 *    row can't crash the list.
 *  - All inline-style colors use `var(--sh-*)` tokens.
 *
 * Endpoints (existing):
 *  - GET    /api/scholar/paper/:paperId/discussions
 *  - POST   /api/scholar/paper/:paperId/discussions
 *  - DELETE /api/scholar/paper/:paperId/discussions/:threadId
 *
 * a11y:
 *  - role="article" + aria-level=1/2 on each post.
 *  - Empty state copy is descriptive and lives in a single element.
 *  - Textarea has aria-label and maxLength.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { authHeaders, timeAgo } from '../../shared/pageUtils'
import { useSession } from '../../../lib/session-context'
import UserAvatar from '../../../components/UserAvatar'

const MAX_BODY_LENGTH = 280

// Defensive name extraction: an authored row whose `author` is missing
// or malformed should still render. The list view is the most-visited
// surface of Scholar; a single bad row must not crash the page.
function safeAuthorName(author) {
  try {
    if (!author || typeof author !== 'object') return 'Someone'
    const v = author.displayName || author.username || author.name
    if (typeof v !== 'string' || !v.trim()) return 'Someone'
    return v
  } catch {
    return 'Someone'
  }
}

function safeRelative(value) {
  try {
    const t = timeAgo(value)
    return typeof t === 'string' ? t : ''
  } catch {
    return ''
  }
}

function PostRow({ post, isReply, canManage, onDelete, onToggleReplies, repliesOpen, replyCount }) {
  const authorName = safeAuthorName(post?.author)
  const created = safeRelative(post?.createdAt)
  return (
    <div
      className="discussion-post"
      data-reply={isReply ? 'true' : 'false'}
      role="article"
      aria-level={isReply ? 2 : 1}
      style={{
        padding: '12px 14px',
        background: isReply ? 'var(--sh-surface)' : 'var(--sh-soft)',
        border: isReply ? '1px solid var(--sh-border)' : 0,
        borderRadius: 10,
        marginLeft: isReply ? 36 : 0,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <UserAvatar user={post?.author} size={isReply ? 28 : 36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="discussion-post__head"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            fontSize: 'var(--type-sm)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--sh-text)' }}>{authorName}</span>
          {created && (
            <span style={{ color: 'var(--sh-subtext)', fontSize: 'var(--type-xs)' }}>
              {created}
            </span>
          )}
          {canManage && !post.deleted && (
            <button
              type="button"
              onClick={() => onDelete?.(post.id)}
              style={{
                marginLeft: 'auto',
                minHeight: 44,
                background: 'transparent',
                border: 0,
                color: 'var(--sh-subtext)',
                cursor: 'pointer',
                fontSize: 'var(--type-xs)',
                padding: '4px 6px',
              }}
              aria-label="Delete this post"
            >
              Delete
            </button>
          )}
        </div>
        {post.deleted ? (
          <div
            style={{
              fontSize: 'var(--type-sm)',
              fontStyle: 'italic',
              color: 'var(--sh-muted)',
            }}
          >
            (deleted by author)
          </div>
        ) : (
          <div
            style={{
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-text)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {typeof post.body === 'string' ? post.body : ''}
          </div>
        )}
        {!isReply && (
          <button
            type="button"
            onClick={() => onToggleReplies?.(post.id)}
            aria-expanded={repliesOpen}
            style={{
              marginTop: 6,
              minHeight: 44,
              background: 'transparent',
              border: 0,
              color: 'var(--sh-brand, #2563eb)',
              cursor: 'pointer',
              fontSize: 'var(--type-xs)',
              padding: '4px 0',
              fontWeight: 600,
            }}
          >
            {replyCount > 0
              ? `${repliesOpen ? 'Hide' : 'Show'} ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
              : repliesOpen
                ? 'Cancel reply'
                : 'Reply'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function DiscussionThread({ paperId }) {
  // SessionProvider is mounted at the App root for every authenticated
  // route. ScholarPaperPage lives behind that gate, so `useSession()`
  // always resolves here. If a future caller mounts this component
  // outside the provider, the hook's own error message is clearer than
  // any defensive fallback we could provide.
  const sessionCtx = useSession()
  const isLoggedIn = sessionCtx?.status === 'authenticated' && !!sessionCtx?.user
  const currentUserId = sessionCtx?.user?.id || null
  const currentSchoolId = sessionCtx?.user?.schoolId || sessionCtx?.user?.primarySchoolId || null

  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [body, setBody] = useState('')
  const [replyParentId, setReplyParentId] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [posting, setPosting] = useState(false)
  const composerInputId = useId()

  const fetchThreads = useCallback(async () => {
    if (!paperId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API}/api/scholar/paper/${encodeURIComponent(paperId)}/discussions`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        throw new Error(`Could not load discussion (${res.status})`)
      }
      const json = await res.json()
      setThreads(Array.isArray(json?.threads) ? json.threads : [])
    } catch (err) {
      setError(err?.message || 'Failed to load discussion')
    } finally {
      setLoading(false)
    }
  }, [paperId])

  // Mount-time + paperId-change fetch. The setLoading inside fetchThreads
  // happens synchronously during the effect tick, which trips
  // react-hooks/set-state-in-effect; the disable below mirrors the
  // pattern in ScholarSearchPage / ScholarPaperPage where a sibling
  // fetch effect needs the same exception.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchThreads()
  }, [fetchThreads])

  const { roots, repliesByParent, replyCountByParent } = useMemo(() => {
    const rootsList = []
    const repliesMap = new Map()
    const replyCounts = new Map()
    for (const t of threads) {
      if (!t || typeof t !== 'object') continue
      if (t.parentId == null) {
        rootsList.push(t)
      } else {
        if (!repliesMap.has(t.parentId)) repliesMap.set(t.parentId, [])
        repliesMap.get(t.parentId).push(t)
        replyCounts.set(t.parentId, (replyCounts.get(t.parentId) || 0) + 1)
      }
    }
    return { roots: rootsList, repliesByParent: repliesMap, replyCountByParent: replyCounts }
  }, [threads])

  async function submit(event) {
    event?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || posting) return
    if (trimmed.length > MAX_BODY_LENGTH) {
      showToast(`Posts are limited to ${MAX_BODY_LENGTH} characters.`, 'error')
      return
    }
    setPosting(true)
    try {
      const res = await fetch(
        `${API}/api/scholar/paper/${encodeURIComponent(paperId)}/discussions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ body: trimmed, parentId: replyParentId }),
        },
      )
      if (!res.ok) throw new Error(`Post failed (${res.status})`)
      setBody('')
      setReplyParentId(null)
      setComposerOpen(false)
      await fetchThreads()
      showToast('Posted', 'success')
    } catch (err) {
      showToast(err?.message || 'Could not post', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(threadId) {
    try {
      const res = await fetch(
        `${API}/api/scholar/paper/${encodeURIComponent(paperId)}/discussions/${threadId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        },
      )
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      await fetchThreads()
    } catch (err) {
      showToast(err?.message || 'Could not delete', 'error')
    }
  }

  function handleToggleReplies(parentId) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
    setReplyParentId((current) => (current === parentId ? null : parentId))
  }

  function handleKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      submit(event)
    }
  }

  const remaining = MAX_BODY_LENGTH - body.length
  const overLimit = remaining < 0

  // Composer copy is sensitive to login + school state. A logged-out
  // user shouldn't see "Post" — they get a sign-in nudge instead. A
  // logged-in user without a school sees the same composer but the
  // disabled-state copy explains the gate.
  const canStart = isLoggedIn && Boolean(currentSchoolId)

  return (
    <div>
      {/* ── Composer / new-thread CTA ─────────────────────────────────── */}
      {isLoggedIn ? (
        <div style={{ marginBottom: 16 }}>
          {!composerOpen && !replyParentId ? (
            <button
              type="button"
              onClick={() => {
                if (canStart) {
                  setComposerOpen(true)
                  return
                }
                // Surface a clear toast instead of a silent no-op. Founder
                // 2026-05-13: clicking "New thread" did nothing when the
                // user wasn't enrolled in a school — the disabled state
                // wasn't obvious enough.
                showToast(
                  'Join a school to start a discussion thread. Discussions are scoped to your school.',
                  'info',
                )
              }}
              aria-disabled={!canStart}
              className="scholar-action-btn scholar-action-btn--primary"
              style={{
                minHeight: 44,
                padding: '0 16px',
                opacity: canStart ? 1 : 0.7,
                cursor: 'pointer',
              }}
              aria-label={
                canStart
                  ? 'Start a new discussion thread'
                  : 'Join a school to start a discussion thread'
              }
            >
              New thread
            </button>
          ) : null}
          {!canStart && (
            <div
              style={{
                fontSize: 'var(--type-xs)',
                color: 'var(--sh-subtext)',
                marginTop: 6,
              }}
            >
              Join a school to start a discussion. Replies are scoped to your school.
            </div>
          )}

          {(composerOpen || replyParentId) && (
            <form onSubmit={submit} style={{ marginTop: 12 }}>
              {replyParentId && (
                <div
                  style={{
                    fontSize: 'var(--type-xs)',
                    color: 'var(--sh-subtext)',
                    marginBottom: 6,
                  }}
                >
                  Replying to a thread.{' '}
                  <button
                    type="button"
                    onClick={() => setReplyParentId(null)}
                    style={{
                      minHeight: 32,
                      background: 'transparent',
                      border: 0,
                      color: 'var(--sh-brand, #2563eb)',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    Cancel reply
                  </button>
                </div>
              )}
              <textarea
                id={composerInputId}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What did you think of this paper?"
                rows={3}
                maxLength={MAX_BODY_LENGTH + 100}
                aria-label="New discussion post"
                aria-describedby={`${composerInputId}-counter`}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--sh-surface)',
                  border: `1px solid ${overLimit ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`,
                  borderRadius: 10,
                  color: 'var(--sh-text)',
                  fontFamily: 'inherit',
                  fontSize: 'var(--type-sm)',
                  resize: 'vertical',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  id={`${composerInputId}-counter`}
                  style={{
                    fontSize: 'var(--type-xs)',
                    color: overLimit ? 'var(--sh-danger-text)' : 'var(--sh-subtext)',
                  }}
                >
                  {remaining} {Math.abs(remaining) === 1 ? 'character' : 'characters'} left ·
                  Cmd/Ctrl+Enter to post
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(false)
                      setReplyParentId(null)
                      setBody('')
                    }}
                    className="scholar-action-btn"
                    style={{ minHeight: 44, padding: '0 14px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!body.trim() || posting || overLimit || !canStart}
                    className="scholar-action-btn scholar-action-btn--primary"
                    style={{ minHeight: 44, padding: '0 16px' }}
                  >
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            borderRadius: 10,
            fontSize: 'var(--type-sm)',
            color: 'var(--sh-subtext)',
          }}
        >
          Sign in to join the discussion at your school.
        </div>
      )}

      {/* ── State views ───────────────────────────────────────────────── */}
      {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading discussion…</div>}
      {error && (
        <div
          role="alert"
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 'var(--type-sm)',
          }}
        >
          {error}
        </div>
      )}
      {!loading && !error && roots.length === 0 && (
        <div
          style={{
            color: 'var(--sh-subtext)',
            fontSize: 'var(--type-sm)',
            padding: '12px 0',
          }}
        >
          {isLoggedIn
            ? canStart
              ? 'Be the first to start a discussion at your school.'
              : 'No discussion yet at your school.'
            : 'No discussion yet. Sign in to start one.'}
        </div>
      )}

      {/* ── Thread list ───────────────────────────────────────────────── */}
      <div
        className="discussion-thread"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {roots.map((post) => {
          const replyCount = replyCountByParent.get(post.id) || 0
          const repliesOpen = expanded.has(post.id)
          const replies = repliesByParent.get(post.id) || []
          const canManage =
            post?.isOwner === true || (currentUserId && post?.author?.id === currentUserId)
          return (
            <div key={post.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PostRow
                post={post}
                isReply={false}
                canManage={Boolean(canManage)}
                onDelete={handleDelete}
                onToggleReplies={handleToggleReplies}
                repliesOpen={repliesOpen}
                replyCount={replyCount}
              />
              {repliesOpen &&
                replies.map((r) => {
                  const replyCanManage =
                    r?.isOwner === true || (currentUserId && r?.author?.id === currentUserId)
                  return (
                    <PostRow
                      key={r.id}
                      post={r}
                      isReply
                      canManage={Boolean(replyCanManage)}
                      onDelete={handleDelete}
                      onToggleReplies={undefined}
                      repliesOpen={false}
                      replyCount={0}
                    />
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

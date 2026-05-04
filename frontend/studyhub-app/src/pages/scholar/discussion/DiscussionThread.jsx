/**
 * DiscussionThread.jsx — Threaded comments for a paper's peer-review
 * sidecar tab.
 *
 * The list is loaded from GET /api/scholar/paper/:id/discussions and
 * grouped client-side by parentId. v1 supports one nesting level
 * (root + replies). aria-level=2 on replies so screen readers
 * announce the thread depth.
 */
import { useEffect, useState, useCallback } from 'react'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import { authHeaders } from '../../shared/pageUtils'

function formatTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

function PostRow({ post, isReply, onDelete, onReply }) {
  return (
    <div
      className="discussion-post"
      data-reply={isReply ? 'true' : 'false'}
      role="article"
      aria-level={isReply ? 2 : 1}
    >
      <div className="discussion-post__head">
        <span className="discussion-post__author">
          {post.author?.displayName || post.author?.username || 'Someone'}
        </span>
        <span className="discussion-post__time">{formatTime(post.createdAt)}</span>
        {post.isOwner && !post.deleted && (
          <button
            type="button"
            onClick={() => onDelete?.(post.id)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 0,
              color: 'var(--sh-subtext)',
              cursor: 'pointer',
              fontSize: 'var(--type-xs)',
            }}
            aria-label="Delete this post"
          >
            Delete
          </button>
        )}
      </div>
      {post.deleted ? (
        <div className="discussion-post__body discussion-post__deleted">(deleted by author)</div>
      ) : (
        <div className="discussion-post__body">{post.body}</div>
      )}
      {!isReply && !post.deleted && (
        <button
          type="button"
          onClick={() => onReply?.(post.id)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--sh-brand)',
            cursor: 'pointer',
            fontSize: 'var(--type-xs)',
            marginTop: '6px',
            padding: 0,
          }}
        >
          Reply
        </button>
      )}
    </div>
  )
}

export default function DiscussionThread({ paperId }) {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [body, setBody] = useState('')
  const [replyParentId, setReplyParentId] = useState(null)
  const [posting, setPosting] = useState(false)

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
      setThreads(Array.isArray(json.threads) ? json.threads : [])
    } catch (err) {
      setError(err.message || 'Failed to load discussion')
    } finally {
      setLoading(false)
    }
  }, [paperId])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  async function submit(e) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || posting) return
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
      await fetchThreads()
    } catch (err) {
      showToast(err.message || 'Could not post')
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
      showToast(err.message || 'Could not delete')
    }
  }

  const roots = threads.filter((t) => t.parentId == null)
  const repliesByParent = new Map()
  for (const t of threads) {
    if (t.parentId != null) {
      if (!repliesByParent.has(t.parentId)) repliesByParent.set(t.parentId, [])
      repliesByParent.get(t.parentId).push(t)
    }
  }

  return (
    <div>
      <form onSubmit={submit} style={{ marginBottom: 16 }}>
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
                background: 'transparent',
                border: 0,
                color: 'var(--sh-brand)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Cancel reply
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you think of this paper?"
          rows={3}
          maxLength={4000}
          aria-label="New discussion post"
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            borderRadius: '10px',
            color: 'var(--sh-text)',
            fontFamily: 'inherit',
            fontSize: 'var(--type-sm)',
            resize: 'vertical',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 8,
            gap: 8,
          }}
        >
          <button
            type="submit"
            disabled={!body.trim() || posting}
            className="scholar-action-btn scholar-action-btn--primary"
          >
            Post
          </button>
        </div>
      </form>

      {loading && <div style={{ color: 'var(--sh-subtext)' }}>Loading discussion…</div>}
      {error && (
        <div
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            padding: '10px',
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
      {!loading && !error && roots.length === 0 && (
        <div style={{ color: 'var(--sh-subtext)' }}>
          No discussion yet. Be the first to share your take.
        </div>
      )}

      <div className="discussion-thread">
        {roots.map((post) => (
          <div key={post.id}>
            <PostRow
              post={post}
              isReply={false}
              onDelete={handleDelete}
              onReply={(id) => setReplyParentId(id)}
            />
            {(repliesByParent.get(post.id) || []).map((r) => (
              <PostRow key={r.id} post={r} isReply onDelete={handleDelete} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

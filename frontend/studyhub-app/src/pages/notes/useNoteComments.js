/* ═══════════════════════════════════════════════════════════════════════════
 * useNoteComments.js — Hook for fetching, posting, resolving, deleting
 * comments on a note. Supports threaded replies (1 level deep).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

export function useNoteComments(noteId) {
  const [comments, setComments] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)
  const loadedNoteIdRef = useRef(null)
  // Monotonic request sequence — every reactToComment dispatch increments
  // this. Server reconciliation only writes to state if its sequence is
  // still the latest. Prevents request-N's server response from
  // overwriting request-(N+1)'s optimistic state on rapid double-click.
  const reactSeqRef = useRef(0)

  // Reset the per-note cache when navigating between notes so the
  // collapsed-section count + list don't stay stuck on the previous
  // note's data. Without this, NoteCommentSection's mount-effect fires
  // for the new noteId but the loadedRef short-circuits because it was
  // already true from the previous note.
  useEffect(() => {
    if (loadedNoteIdRef.current !== noteId) {
      loadedRef.current = false
      loadedNoteIdRef.current = noteId
      setComments([])
      setTotal(0)
    }
  }, [noteId])

  const loadComments = useCallback(async () => {
    if (loadedRef.current || !noteId) return
    loadedRef.current = true
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/notes/${noteId}/comments?limit=100`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        loadedRef.current = false
        return
      }
      const data = await res.json()
      const list = Array.isArray(data.comments) ? data.comments : []
      // Backend already returns top-level with nested replies — ensure replies array exists
      const nested = list.map((c) => ({ ...c, replies: c.replies || [] }))
      setComments(nested)
      setTotal(typeof data.total === 'number' ? data.total : list.length)
    } catch {
      loadedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [noteId])

  const postComment = useCallback(
    async (content, options = {}) => {
      const text = content.trim()
      const attachments = Array.isArray(options.attachments) ? options.attachments : []
      if (!text && attachments.length === 0) return false
      setPosting(true)
      setError('')

      try {
        const body = { content: text }

        // Support anchor (inline comment)
        if (options.anchorText) {
          body.anchorText = options.anchorText
          if (typeof options.anchorOffset === 'number') body.anchorOffset = options.anchorOffset
        }

        // Support replies
        if (options.parentId) {
          body.parentId = options.parentId
        }

        if (attachments.length > 0) {
          body.attachments = attachments
        }

        const res = await fetch(`${API}/api/notes/${noteId}/comments`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || 'Could not post comment.')
          return false
        }

        if (options.parentId) {
          // Add reply to parent's replies array
          setComments((prev) =>
            prev.map((c) => {
              if (c.id === options.parentId) {
                return { ...c, replies: [...(c.replies || []), data] }
              }
              return c
            }),
          )
        } else {
          // Add as new top-level comment
          setComments((prev) => [{ ...data, replies: [] }, ...prev])
        }
        setTotal((prev) => prev + 1)
        return true
      } catch {
        setError('Check your connection and try again.')
        return false
      } finally {
        setPosting(false)
      }
    },
    [noteId],
  )

  const resolveComment = useCallback(
    async (commentId, resolved) => {
      try {
        const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ resolved }),
        })
        if (res.ok) {
          const updated = await res.json()
          setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...updated } : c)))
        }
      } catch {
        /* silent */
      }
    },
    [noteId],
  )

  const deleteComment = useCallback(
    async (commentId) => {
      try {
        const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: authHeaders(),
          credentials: 'include',
        })
        if (res.ok) {
          // Remove from top-level or from parent's replies
          setComments((prev) => {
            const filtered = prev.filter((c) => c.id !== commentId)
            return filtered.map((c) => ({
              ...c,
              replies: (c.replies || []).filter((r) => r.id !== commentId),
            }))
          })
          setTotal((prev) => Math.max(0, prev - 1))
        }
      } catch {
        /* silent */
      }
    },
    [noteId],
  )

  const editComment = useCallback(
    async (commentId, newContent) => {
      const text = newContent.trim()
      if (!text) return false
      try {
        const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ content: text }),
        })
        if (!res.ok) return false
        const updated = await res.json()
        // Update in top-level or nested replies
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === commentId) return { ...c, ...updated }
            return {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === commentId ? { ...r, ...updated } : r,
              ),
            }
          }),
        )
        return true
      } catch {
        return false
      }
    },
    [noteId],
  )

  const reactToComment = useCallback(
    async (commentId, type) => {
      // Snapshot the pre-update state so we can rollback if the POST
      // fails. Without this, a 429 / 500 / network drop leaves the
      // optimistic count inflated until the loadComments() refetch
      // arrives — multi-second visual lie on the worst code path.
      let snapshot = null
      const reverseFor = (commentList) => {
        return commentList.map((c) => {
          if (c.id === commentId)
            return {
              ...c,
              userReaction: snapshot?.userReaction ?? null,
              reactionCounts: snapshot?.reactionCounts ?? { like: 0, dislike: 0 },
            }
          return {
            ...c,
            replies: (c.replies || []).map((r) => {
              if (r.id !== commentId) return r
              return {
                ...r,
                userReaction: snapshot?.userReaction ?? null,
                reactionCounts: snapshot?.reactionCounts ?? { like: 0, dislike: 0 },
              }
            }),
          }
        })
      }

      // Helper to update reaction in a comment
      const updateReaction = (comment) => {
        if (comment.id !== commentId) return comment
        // Capture the first match for rollback. If the comment is a
        // reply we'll re-capture below.
        if (!snapshot) {
          snapshot = {
            userReaction: comment.userReaction ?? null,
            reactionCounts: comment.reactionCounts ?? { like: 0, dislike: 0 },
          }
        }
        const oldType = comment.userReaction
        const newType = oldType === type ? null : type
        let newLikes = comment.reactionCounts?.like || 0
        let newDislikes = comment.reactionCounts?.dislike || 0
        if (oldType === 'like') newLikes--
        else if (oldType === 'dislike') newDislikes--
        if (newType === 'like') newLikes++
        else if (newType === 'dislike') newDislikes++
        return {
          ...comment,
          userReaction: newType,
          reactionCounts: { like: newLikes, dislike: newDislikes },
        }
      }

      // Stamp this dispatch so a slow request from a previous click
      // can't overwrite a faster, newer one when it eventually
      // resolves (audit Loop 17 finding #3).
      reactSeqRef.current += 1
      const mySeq = reactSeqRef.current

      // Optimistic update (check both top-level and replies)
      setComments((prev) =>
        prev.map((c) => {
          const updated = updateReaction(c)
          return {
            ...updated,
            replies: (updated.replies || []).map(updateReaction),
          }
        }),
      )

      try {
        const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}/react`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ type }),
        })
        if (res.ok) {
          // Only reconcile if this response is the latest dispatch;
          // a stale request would otherwise stomp a newer optimistic
          // update applied while it was in flight.
          if (mySeq !== reactSeqRef.current) return
          const data = await res.json().catch(() => null)
          if (data && data.reactionCounts) {
            setComments((prev) =>
              prev.map((c) => {
                const reconcile = (comment) => {
                  if (comment.id !== commentId) return comment
                  return {
                    ...comment,
                    reactionCounts: data.reactionCounts,
                    userReaction: data.userReaction ?? null,
                  }
                }
                const updated = reconcile(c)
                return {
                  ...updated,
                  replies: (updated.replies || []).map(reconcile),
                }
              }),
            )
          }
        } else {
          // Immediate rollback to the snapshot so the user doesn't
          // see an inflated count for the duration of the refetch.
          if (snapshot && mySeq === reactSeqRef.current) {
            setComments((prev) => reverseFor(prev))
          }
          loadedRef.current = false
          await loadComments()
        }
      } catch {
        if (snapshot && mySeq === reactSeqRef.current) {
          setComments((prev) => reverseFor(prev))
        }
        loadedRef.current = false
        await loadComments()
      }
    },
    [noteId, loadComments],
  )

  return {
    comments,
    total,
    loading,
    posting,
    error,
    setError,
    loadComments,
    postComment,
    resolveComment,
    deleteComment,
    editComment,
    reactToComment,
  }
}

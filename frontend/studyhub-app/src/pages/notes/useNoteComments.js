/* ═══════════════════════════════════════════════════════════════════════════
 * useNoteComments.js — Hook for fetching, posting, resolving, deleting
 * comments on a note. Supports threaded replies (1 level deep).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

export function useNoteComments(noteId) {
  const [comments, setComments] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const loadComments = useCallback(async () => {
    if (loadedRef.current || !noteId) return
    loadedRef.current = true
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/notes/${noteId}/comments?limit=100`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) { loadedRef.current = false; return }
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

  const postComment = useCallback(async (content, options = {}) => {
    const text = content.trim()
    if (!text) return false
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
        setComments((prev) => prev.map((c) => {
          if (c.id === options.parentId) {
            return { ...c, replies: [...(c.replies || []), data] }
          }
          return c
        }))
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
  }, [noteId])

  const resolveComment = useCallback(async (commentId, resolved) => {
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
    } catch { /* silent */ }
  }, [noteId])

  const deleteComment = useCallback(async (commentId) => {
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
    } catch { /* silent */ }
  }, [noteId])

  const reactToComment = useCallback(async (commentId, type) => {
    // Helper to update reaction in a comment
    const updateReaction = (comment) => {
      if (comment.id !== commentId) return comment
      const oldType = comment.userReaction
      const newType = oldType === type ? null : type
      let newLikes = comment.reactionCounts?.like || 0
      let newDislikes = comment.reactionCounts?.dislike || 0
      if (oldType === 'like') newLikes--
      else if (oldType === 'dislike') newDislikes--
      if (newType === 'like') newLikes++
      else if (newType === 'dislike') newDislikes++
      return { ...comment, userReaction: newType, reactionCounts: { like: newLikes, dislike: newDislikes } }
    }

    // Optimistic update (check both top-level and replies)
    setComments((prev) => prev.map((c) => {
      const updated = updateReaction(c)
      return {
        ...updated,
        replies: (updated.replies || []).map(updateReaction),
      }
    }))

    try {
      const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}/react`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        loadedRef.current = false
        await loadComments()
      }
    } catch {
      loadedRef.current = false
      await loadComments()
    }
  }, [noteId, loadComments])

  return {
    comments, total, loading, posting, error, setError,
    loadComments, postComment, resolveComment, deleteComment, reactToComment,
  }
}

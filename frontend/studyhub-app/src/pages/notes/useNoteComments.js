/* ═══════════════════════════════════════════════════════════════════════════
 * useNoteComments.js — Hook for fetching, posting, resolving, deleting
 * comments on a note. Follows the feed CommentSection pattern.
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
      setComments(list)
      setTotal(typeof data.total === 'number' ? data.total : list.length)
    } catch {
      loadedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [noteId])

  const postComment = useCallback(async (content, anchor) => {
    const text = content.trim()
    if (!text) return false
    setPosting(true)
    setError('')

    try {
      const body = { content: text }
      if (anchor?.anchorText) {
        body.anchorText = anchor.anchorText
        if (typeof anchor.anchorOffset === 'number') body.anchorOffset = anchor.anchorOffset
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

      loadedRef.current = true
      setComments((prev) => [data, ...prev])
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
        setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)))
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
        setComments((prev) => prev.filter((c) => c.id !== commentId))
        setTotal((prev) => Math.max(0, prev - 1))
      }
    } catch { /* silent */ }
  }, [noteId])

  const reactToComment = useCallback(async (commentId, type) => {
    try {
      // Optimistic update
      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id !== commentId) return comment

          const oldType = comment.userReaction
          const newType = oldType === type ? null : type

          const oldLikes = comment.reactionCounts?.like || 0
          const oldDislikes = comment.reactionCounts?.dislike || 0

          let newLikes = oldLikes
          let newDislikes = oldDislikes

          // Remove old reaction
          if (oldType === 'like') newLikes -= 1
          else if (oldType === 'dislike') newDislikes -= 1

          // Add new reaction
          if (newType === 'like') newLikes += 1
          else if (newType === 'dislike') newDislikes += 1

          return {
            ...comment,
            userReaction: newType,
            reactionCounts: { like: newLikes, dislike: newDislikes },
          }
        })
      )

      const res = await fetch(`${API}/api/notes/${noteId}/comments/${commentId}/react`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type }),
      })

      if (!res.ok) {
        // Revert on error
        await loadComments()
      }
    } catch {
      // Revert on error
      await loadComments()
    }
  }, [noteId, loadComments])

  return {
    comments, total, loading, posting, error, setError,
    loadComments, postComment, resolveComment, deleteComment, reactToComment,
  }
}

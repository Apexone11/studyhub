/**
 * Hook that owns the comment list for a single contribution.
 * Used by SheetLabContribute (proposer view) and SheetLabReviews (owner view).
 *
 * Shape of a comment (from the backend serializer):
 *   { id, contributionId, hunkIndex, lineOffset, side, body, createdAt,
 *     updatedAt, author: { id, username, avatarUrl, isStaffVerified } }
 */
import { useCallback, useEffect, useState } from 'react'
import {
  deleteContributionComment,
  fetchContributionComments,
  postContributionComment,
} from '../../../lib/diffService'

export default function useContributionComments(contributionId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!contributionId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchContributionComments(contributionId)
      setComments(Array.isArray(data.comments) ? data.comments : [])
    } catch (err) {
      setError(err.message || 'Could not load comments.')
    } finally {
      setLoading(false)
    }
  }, [contributionId])

  useEffect(() => {
    reload()
  }, [reload])

  const addComment = useCallback(
    async ({ hunkIndex, lineOffset, side, body }) => {
      if (!contributionId) throw new Error('Missing contribution id.')
      const data = await postContributionComment(contributionId, {
        hunkIndex,
        lineOffset,
        side,
        body,
      })
      setComments((prev) => [...prev, data.comment])
      return data.comment
    },
    [contributionId],
  )

  const removeComment = useCallback(
    async (commentId) => {
      if (!contributionId) throw new Error('Missing contribution id.')
      await deleteContributionComment(contributionId, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    },
    [contributionId],
  )

  return {
    comments,
    loading,
    error,
    reload,
    addComment,
    removeComment,
  }
}

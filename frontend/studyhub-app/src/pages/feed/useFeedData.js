import { useCallback, useState } from 'react'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useLivePolling } from '../../lib/useLivePolling'
import { showToast } from '../../lib/toast'
import { trackEvent } from '../../lib/telemetry'
import { canUserDeletePost } from './feedHelpers'
import { authHeaders } from './feedConstants'

export function useFeedData({ user, clearSession, search }) {
  const [feedState, setFeedState] = useState({ items: [], total: 0, loading: true, error: '', partial: false, degradedSections: [] })
  const [leaderboards, setLeaderboards] = useState({ stars: [], downloads: [], contributors: [], error: '' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [deletingPostIds, setDeletingPostIds] = useState({})

  const loadFeed = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())
    const params = new URLSearchParams({ limit: '24' })
    if (search) params.set('search', search)

    try {
      const response = await fetch(`${API}/api/feed?${params.toString()}`, {
        headers: authHeaders(),
        credentials: 'include',
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

  const loadMoreFeed = async () => {
    setLoadingMore(true)
    const params = new URLSearchParams({ limit: '24', offset: String(feedState.items.length) })
    if (search) params.set('search', search)
    try {
      const response = await fetch(`${API}/api/feed?${params.toString()}`, { headers: authHeaders(), credentials: 'include' })
      const data = await readJsonSafely(response, {})
      if (response.ok && Array.isArray(data.items)) {
        setFeedState((current) => ({
          ...current,
          items: [...current.items, ...data.items],
          total: data.total || current.total,
        }))
      }
    } catch { /* silent */ }
    finally { setLoadingMore(false) }
  }

  const loadLeaderboards = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const [starsResponse, downloadsResponse, contributorsResponse] = await Promise.all([
        fetch(`${API}/api/sheets/leaderboard?type=stars`, { headers: authHeaders(), credentials: 'include', signal }),
        fetch(`${API}/api/sheets/leaderboard?type=downloads`, { headers: authHeaders(), credentials: 'include', signal }),
        fetch(`${API}/api/sheets/leaderboard?type=contributors`, { headers: authHeaders(), credentials: 'include', signal }),
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

  const toggleReaction = async (item, type) => {
    const currentType = item.reactions?.userReaction || null
    const nextType = currentType === type ? null : type
    const endpoint = item.type === 'post' ? `${API}/api/feed/posts/${item.id}/react` : `${API}/api/sheets/${item.id}/react`

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type: nextType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not update the reaction.'))
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
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not update the star.'))
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

  const deletePost = async (item) => {
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
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not delete this post.'))
      }
    } catch (error) {
      showToast(error.message || 'Could not delete this post.', 'error')
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

  const submitPost = async ({ content, courseId, attachedFile }) => {
    const response = await fetch(`${API}/api/feed/posts`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        content: content.trim(),
        courseId: courseId || null,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(getApiErrorMessage(data, 'Could not post to the feed.'))
    }

    let finalPost = data
    if (attachedFile && data.id) {
      try {
        const formData = new FormData()
        formData.append('attachment', attachedFile)
        const uploadRes = await fetch(`${API}/api/upload/post-attachment/${data.id}`, {
          method: 'POST',
          credentials: 'include',
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

    setFeedState((current) => ({
      ...current,
      items: [finalPost, ...current.items],
      total: current.total + 1,
    }))
    trackEvent('feed_post_created', { hasCourse: Boolean(courseId), hasAttachment: Boolean(attachedFile) })
  }

  const retryFeed = () => {
    setFeedState((c) => ({ ...c, loading: true, error: '' }))
    loadFeed()
  }

  return {
    feedState,
    leaderboards,
    loadingMore,
    deletingPostIds,
    loadMoreFeed,
    toggleReaction,
    toggleStar,
    canDeletePost,
    deletePost,
    submitPost,
    retryFeed,
  }
}

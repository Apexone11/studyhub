import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useLivePolling } from '../../lib/useLivePolling'
import { showToast } from '../../lib/toast'
import { trackEvent } from '../../lib/telemetry'
import { usePageTiming } from '../../lib/usePageTiming'
import { canUserDeletePost } from './feedHelpers'
import { authHeaders } from './feedConstants'

const LAST_FEED_VISIT_KEY = 'studyhub.feed.lastVisit'

function getLastFeedVisit() {
  try {
    const raw = localStorage.getItem(LAST_FEED_VISIT_KEY)
    return raw ? new Date(raw).getTime() : 0
  } catch {
    return 0
  }
}

function markFeedVisit() {
  try {
    localStorage.setItem(LAST_FEED_VISIT_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

// Cheap structural hash of the fields a FeedCard cares about. Used by
// `mergeFeedItems` below so a poll that returns the same payload reuses the
// existing object reference, which keeps `React.memo` happy and prevents the
// inline <video> from remounting / re-fetching its stream URL every 30s.
// Stringify is bounded by what we hash (no nested objects / cyclic refs in
// feed item shapes), so the cost stays linear in items × hashed-field-count.
function fingerprintItem(item) {
  if (!item) return ''
  const r = item.reactions || {}
  return [
    item.feedKey,
    item.id,
    item.type,
    item.title || '',
    item.preview || item.content || item.description || '',
    item.commentCount || 0,
    item.starred ? 1 : 0,
    item.stars || 0,
    item.forks || 0,
    item.downloads || 0,
    r.likes || 0,
    r.dislikes || 0,
    r.userReaction || '',
    item.video?.id || 0,
    item.video?.status || '',
    item.moderationStatus || '',
    // createdAt drives `timeAgo` rendering — string compare is enough.
    item.createdAt || '',
  ].join('|')
}

// Merge a freshly fetched items array with the previous snapshot so any
// item whose hash hasn't changed reuses the previous object reference. The
// FeedCard memo comparator does `prev.item === next.item`, so reused refs
// short-circuit the re-render path and the inline video player stays stable
// across the 30-second polling interval.
function mergeFeedItems(previousItems, nextItems) {
  if (!Array.isArray(nextItems)) return previousItems
  const previousByKey = new Map()
  for (const entry of previousItems || []) {
    if (entry?.feedKey) previousByKey.set(entry.feedKey, entry)
  }
  return nextItems.map((next) => {
    const previous = next?.feedKey ? previousByKey.get(next.feedKey) : null
    if (previous && fingerprintItem(previous) === fingerprintItem(next)) {
      return previous
    }
    return next
  })
}

export function useFeedData({ user, search }) {
  const [feedState, setFeedState] = useState({
    items: [],
    total: 0,
    loading: true,
    error: '',
    partial: false,
    degradedSections: [],
  })
  const [leaderboards, setLeaderboards] = useState({
    stars: [],
    downloads: [],
    contributors: [],
    error: '',
  })
  const [starredUpdates, setStarredUpdates] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [deletingPostIds, setDeletingPostIds] = useState({})
  const timing = usePageTiming('feed')

  const loadFeed = useCallback(
    async ({ signal, startTransition } = {}) => {
      const apply = startTransition || ((fn) => fn())
      const params = new URLSearchParams({ limit: '24' })
      if (search) params.set('search', search)

      timing.markFetchStart()
      try {
        const response = await fetch(`${API}/api/feed?${params.toString()}`, {
          headers: authHeaders(),
          credentials: 'include',
          signal,
        })

        const data = await readJsonSafely(response, {})
        timing.markFetchEnd()

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
          setFeedState((current) => ({
            // Reuse previous-poll item references when their content fingerprint
            // is unchanged. Without this the 30s poll hands every FeedCard a
            // brand-new object ref, busting React.memo and remounting the
            // inline <video> (the cause of "feed flash on every navigation"
            // when a user toggles back to /feed mid-poll).
            items: mergeFeedItems(current.items, Array.isArray(data.items) ? data.items : []),
            total: data.total || 0,
            loading: false,
            error: '',
            partial: Boolean(data.partial),
            degradedSections: Array.isArray(data.degradedSections) ? data.degradedSections : [],
          }))
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
    },
    [search, timing],
  )

  // Report timing when feed items first arrive
  useEffect(() => {
    if (!feedState.loading && feedState.items.length > 0) timing.markContentVisible()
  }, [feedState.loading, feedState.items.length, timing])

  const loadMoreFeed = async () => {
    setLoadingMore(true)
    const params = new URLSearchParams({ limit: '24', offset: String(feedState.items.length) })
    if (search) params.set('search', search)
    try {
      const response = await fetch(`${API}/api/feed?${params.toString()}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (response.ok && Array.isArray(data.items)) {
        setFeedState((current) => {
          const existingKeys = new Set(current.items.map((item) => item.feedKey || item.id))
          const newItems = data.items.filter((item) => !existingKeys.has(item.feedKey || item.id))
          // Stable refs for repeats; brand-new objects for first-seen items.
          return {
            ...current,
            items: [...current.items, ...mergeFeedItems([], newItems)],
            total: data.total || current.total,
          }
        })
      }
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false)
    }
  }

  const loadLeaderboards = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const [starsResponse, downloadsResponse, contributorsResponse] = await Promise.all([
        fetch(`${API}/api/sheets/leaderboard?type=stars`, {
          headers: authHeaders(),
          credentials: 'include',
          signal,
        }),
        fetch(`${API}/api/sheets/leaderboard?type=downloads`, {
          headers: authHeaders(),
          credentials: 'include',
          signal,
        }),
        fetch(`${API}/api/sheets/leaderboard?type=contributors`, {
          headers: authHeaders(),
          credentials: 'include',
          signal,
        }),
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
        setLeaderboards((current) => ({
          ...current,
          error: 'Leaderboards are temporarily unavailable.',
        }))
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

  const loadStarredUpdates = useCallback(async ({ signal } = {}) => {
    try {
      const response = await fetch(`${API}/api/sheets?starred=1&sort=updatedAt&limit=5`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && Array.isArray(data.sheets)) {
        setStarredUpdates(data.sheets)
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
  }, [])

  useLivePolling(loadStarredUpdates, {
    enabled: Boolean(user),
    intervalMs: 120000,
  })

  const toggleReaction = useCallback(async (item, type) => {
    const currentType = item.reactions?.userReaction || null
    const nextType = currentType === type ? null : type
    const endpoint =
      item.type === 'post'
        ? `${API}/api/feed/posts/${item.id}/react`
        : `${API}/api/sheets/${item.id}/react`

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
        items: current.items.map((entry) =>
          entry.feedKey === item.feedKey ? { ...entry, reactions: data } : entry,
        ),
      }))
    } catch (error) {
      setFeedState((current) => ({
        ...current,
        error: error.message || 'Could not update the reaction.',
      }))
    }
  }, [])

  const toggleStar = useCallback(async (item) => {
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
        items: current.items.map((entry) =>
          entry.feedKey === item.feedKey
            ? { ...entry, starred: data.starred, stars: data.stars }
            : entry,
        ),
      }))
    } catch (error) {
      setFeedState((current) => ({
        ...current,
        error: error.message || 'Could not update the star.',
      }))
    }
  }, [])

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

  const submitPost = async ({ content, courseId, attachedFile, videoId }) => {
    const response = await fetch(`${API}/api/feed/posts`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        content: content.trim(),
        courseId: courseId || null,
        videoId: videoId || null,
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
    trackEvent('feed_post_created', {
      hasCourse: Boolean(courseId),
      hasAttachment: Boolean(attachedFile),
      hasVideo: Boolean(videoId),
    })
  }

  const retryFeed = () => {
    setFeedState((c) => ({ ...c, loading: true, error: '' }))
    loadFeed()
  }

  /* "Since your last visit" — count new items */
  const [lastFeedVisit] = useState(getLastFeedVisit)
  const newSinceLastVisit = useMemo(() => {
    if (!lastFeedVisit || feedState.loading || feedState.items.length === 0) return 0
    return feedState.items.filter((item) => new Date(item.createdAt).getTime() > lastFeedVisit)
      .length
  }, [feedState.items, feedState.loading, lastFeedVisit])

  // Mark visit once feed loads
  useEffect(() => {
    if (!feedState.loading && feedState.items.length > 0) markFeedVisit()
  }, [feedState.loading, feedState.items.length])

  return {
    feedState,
    leaderboards,
    starredUpdates,
    loadingMore,
    deletingPostIds,
    newSinceLastVisit,
    loadMoreFeed,
    toggleReaction,
    toggleStar,
    canDeletePost,
    deletePost,
    submitPost,
    retryFeed,
  }
}

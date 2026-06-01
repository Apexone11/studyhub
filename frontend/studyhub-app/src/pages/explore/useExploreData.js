/* ═══════════════════════════════════════════════════════════════════════════
 * useExploreData — data hook for the cross-school Explore page (G2-3).
 *
 * Reads from the gated /api/explore/* surface (flag_explore_tab; backend
 * returns 503 when the flag is off, which we surface as a quiet "disabled"
 * state). Topic chips come from /api/courses/topics (G2-4 course-aliasing,
 * gated by flag_course_aliasing — returns {topics:[]} when off, never errors).
 *
 * The active topic is the source of truth for the four content shelves; a
 * topic change reflows the shelf URLs and useFetch refetches each one. Shelf
 * reads use SWR caching so switching back to a previously-viewed topic paints
 * instantly while revalidating.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import useFetch from '../../lib/useFetch'

// 60s SWR window per the plan ("Explore list is cached for 60s").
const SWR_MS = 60 * 1000
// Shelf caps — keep payloads small; the page is discovery, not exhaustive.
const SHELF_LIMIT = 12
const CHIP_LIMIT = 16

function buildShelfPath(resource, topic) {
  const params = new URLSearchParams()
  params.set('limit', String(SHELF_LIMIT))
  if (topic) params.set('topic', topic)
  return `/api/explore/${resource}?${params.toString()}`
}

/**
 * @param {string} activeTopic - The currently selected topic tag, or '' for "all".
 */
export default function useExploreData(activeTopic = '') {
  const topic = activeTopic || ''

  // Topic chips don't depend on the active topic — fetch once, cache long.
  const topicsState = useFetch(`/api/courses/topics?limit=${CHIP_LIMIT}`, {
    swr: SWR_MS,
    cacheKey: 'explore:topics',
  })

  const trendingState = useFetch(buildShelfPath('trending', topic), {
    swr: SWR_MS,
    cacheKey: `explore:trending:${topic}`,
  })
  const sheetsState = useFetch(buildShelfPath('sheets', topic), {
    swr: SWR_MS,
    cacheKey: `explore:sheets:${topic}`,
  })
  const notesState = useFetch(buildShelfPath('notes', topic), {
    swr: SWR_MS,
    cacheKey: `explore:notes:${topic}`,
  })
  const groupsState = useFetch(buildShelfPath('study-groups', topic), {
    swr: SWR_MS,
    cacheKey: `explore:groups:${topic}`,
  })

  const topics = useMemo(() => topicsState.data?.topics || [], [topicsState.data])

  // The Explore surface is fail-closed: when flag_explore_tab is off every
  // shelf 503s. We treat that as "feature disabled" rather than an error
  // banner, since it's an expected, founder-controlled state.
  const disabled = useMemo(() => {
    const states = [trendingState, sheetsState, notesState, groupsState]
    const anyErrored = states.some((s) => s.error)
    const anyData = states.some((s) => s.data)
    return anyErrored && !anyData
  }, [trendingState, sheetsState, notesState, groupsState])

  return {
    topics,
    topicsLoading: topicsState.loading,
    trending: {
      items: trendingState.data?.sheets || [],
      loading: trendingState.loading,
      error: trendingState.error,
    },
    sheets: {
      items: sheetsState.data?.sheets || [],
      loading: sheetsState.loading,
      error: sheetsState.error,
    },
    notes: {
      items: notesState.data?.notes || [],
      loading: notesState.loading,
      error: notesState.error,
    },
    groups: {
      items: groupsState.data?.groups || [],
      loading: groupsState.loading,
      error: groupsState.error,
    },
    disabled,
  }
}

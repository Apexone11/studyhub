/* ═══════════════════════════════════════════════════════════════════════════
 * useNewsletterData — public read hooks for the Product Updates newsletter.
 *
 * Wraps the public GET endpoints via useFetch with SWR caching:
 *   - useNewsletterList({ page, limit }) → { items, total, page, limit }
 *   - useNewsletterIssue(slug)           → single published issue by slug
 *
 * Both are PUBLIC (viewable logged-out). useFetch sends credentials so a
 * logged-in viewer is recognized, but no auth is required.
 * ═══════════════════════════════════════════════════════════════════════════ */
import useFetch from '../../lib/useFetch'

const SWR_MS = 60000

/**
 * Paginated archive of published newsletter issues.
 * @param {{ page?: number, limit?: number }} [opts]
 */
export function useNewsletterList({ page = 1, limit = 20 } = {}) {
  const query = `page=${page}&limit=${limit}`
  const { data, loading, error, refetch, isValidating } = useFetch(`/api/newsletter?${query}`, {
    swr: SWR_MS,
  })

  return {
    items: data?.items || [],
    total: data?.total || 0,
    page: data?.page || page,
    limit: data?.limit || limit,
    loading,
    error,
    refetch,
    isValidating,
  }
}

/**
 * Single published issue by slug.
 * @param {string} slug
 */
export function useNewsletterIssue(slug) {
  const { data, loading, error, refetch, isValidating } = useFetch(
    `/api/newsletter/${encodeURIComponent(slug || '')}`,
    { swr: SWR_MS, skip: !slug },
  )

  return { issue: data || null, loading, error, refetch, isValidating }
}

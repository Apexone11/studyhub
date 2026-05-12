/*
 * FirstCreationCelebration — show a one-time toast when a user
 * lands on a page with `?celebrate=first_sheet` or
 * `?celebrate=first_note`. The query param is stripped after the
 * toast fires so a refresh / share-link can't re-trigger it, and
 * localStorage records every fired slug so navigating back doesn't
 * either.
 *
 * Pattern mirrors AchievementUnlockModal's `?celebrate=:slug` flow
 * but stays separate so we don't accidentally surface a non-badge
 * slug to the badge modal (which would 404 against the catalog).
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { showToast } from '../lib/toast'

const CELEBRATED_KEY = 'studyhub.firstCreation.celebrated'

const SLUG_TO_MESSAGE = {
  first_sheet: 'You created your first sheet!',
  first_note: 'You created your first note!',
}

function alreadyCelebrated(slug) {
  try {
    const raw = window.localStorage.getItem(CELEBRATED_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.includes(slug) : false
  } catch {
    return false
  }
}

function markCelebrated(slug) {
  try {
    const raw = window.localStorage.getItem(CELEBRATED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    if (!list.includes(slug)) {
      list.push(slug)
      window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(list))
    }
  } catch {
    /* localStorage may be disabled — best effort */
  }
}

export default function FirstCreationCelebration() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const slug = params.get('celebrate')
    if (!slug || !Object.prototype.hasOwnProperty.call(SLUG_TO_MESSAGE, slug)) return

    if (alreadyCelebrated(slug)) {
      // Already fired — still strip the query param so a refresh
      // doesn't keep it lingering in the URL bar.
      params.delete('celebrate')
      const next = params.toString()
      navigate(`${location.pathname}${next ? `?${next}` : ''}`, { replace: true })
      return
    }

    // 5-second auto-dismiss per spec; matches the toast container
    // default but pass it explicitly for the load-bearing duration.
    showToast(SLUG_TO_MESSAGE[slug], 'success', 5000)
    markCelebrated(slug)

    params.delete('celebrate')
    const next = params.toString()
    navigate(`${location.pathname}${next ? `?${next}` : ''}`, { replace: true })
  }, [location.pathname, location.search, navigate])

  return null
}

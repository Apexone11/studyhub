/**
 * useAchievementUnlockListener — subscribes to the dedicated
 * `achievement:unlock` Socket.io event and routes the badge payload
 * into the existing celebration modal via the same `?celebrate=:slug`
 * URL pattern the modal already understands.
 *
 * Why a URL hop instead of direct state? The celebration modal is
 * already mounted at App root and listens to the URL param so the
 * "share unlock" deep link works from a feed post or DM. Pushing
 * realtime unlocks through the same pipeline keeps the modal a single
 * source of truth.
 *
 * Skips re-celebrations for slugs the user already saw (localStorage
 * key `studyhub.achievements.celebrated` is already maintained by the
 * modal). The listener does not own that storage; the modal does.
 */
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSocket } from '../../lib/useSocket'
import { SOCKET_EVENTS } from '../../lib/socketEvents'

const CELEBRATED_KEY = 'studyhub.achievements.celebrated'

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

export default function useAchievementUnlockListener() {
  const { socket } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!socket) return undefined

    const handler = (payload) => {
      const slug = payload?.slug
      if (!slug || typeof slug !== 'string') return
      if (alreadyCelebrated(slug)) return
      // Don't clobber an existing celebrate query param — if the user
      // is already in the middle of one, queue this for the next
      // navigation cycle by ignoring the event. The modal will pick
      // up the queued unlock from notification:new on next mount.
      const params = new URLSearchParams(location.search)
      if (params.get('celebrate')) return
      params.set('celebrate', slug)
      navigate(`${location.pathname}?${params.toString()}`, { replace: true })
    }

    socket.on(SOCKET_EVENTS.ACHIEVEMENT_UNLOCK, handler)
    return () => socket.off(SOCKET_EVENTS.ACHIEVEMENT_UNLOCK, handler)
  }, [socket, navigate, location.pathname, location.search])
}

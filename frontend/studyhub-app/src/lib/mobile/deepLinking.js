// src/lib/mobile/deepLinking.js
// Translates Capacitor App `appUrlOpen` events into react-router navigation.
//
// Accepted URL shapes:
//   getstudyhub://sheet/123              → /m/sheets/123
//   getstudyhub://note/42                → /m/notes/42
//   getstudyhub://user/alice             → /m/users/alice
//   getstudyhub://conversation/7         → /m/messages/7
//   getstudyhub://group/5                → /m/groups/5
//   getstudyhub://search?q=organic+chem  → /m/search?q=organic+chem
//   https://getstudyhub.org/sheets/123   → /m/sheets/123
//   https://getstudyhub.org/notes/42     → /m/notes/42
//   ...
//
// Unknown paths fall back to the mobile home screen when authenticated, or
// the landing screen when not. The caller (`App.mobile.jsx`) wires this up
// via `useDeepLinkRouter()` inside the React tree so `useNavigate` is
// available.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isNativePlatform } from './detectMobile'

/**
 * Map a deep-link pathname + optional search string to an in-app route.
 * Exported for unit testing. Pure function — no side effects, no imports of
 * Capacitor. Returns null when the caller should ignore the link.
 */
export function routeForDeepLink(url) {
  if (!url || typeof url !== 'string') return null

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
  const acceptedSchemes = new Set(['getstudyhub', 'https', 'http'])
  if (!acceptedSchemes.has(scheme)) return null

  // Custom scheme `getstudyhub://sheet/123` puts "sheet" in host, "123" in pathname.
  // HTTPS `https://getstudyhub.org/sheets/123` puts all of it in pathname.
  const isCustomScheme = scheme === 'getstudyhub'
  const segments = []
  if (isCustomScheme) {
    if (parsed.host) segments.push(parsed.host)
    const restFromPath = parsed.pathname.split('/').filter(Boolean)
    segments.push(...restFromPath)
  } else {
    if (parsed.host.toLowerCase() !== 'getstudyhub.org') return null
    const pathSegs = parsed.pathname.split('/').filter(Boolean)
    segments.push(...pathSegs)
  }

  const search = parsed.search || ''
  const [resource, ...rest] = segments
  if (!resource) return '/m/home'

  switch (resource.toLowerCase()) {
    case 'sheet':
    case 'sheets':
      return rest[0] ? `/m/sheets/${encodeURIComponent(rest[0])}` : '/m/home'
    case 'note':
    case 'notes':
      return rest[0] ? `/m/notes/${encodeURIComponent(rest[0])}` : '/m/notes'
    case 'user':
    case 'users':
      return rest[0] ? `/m/users/${encodeURIComponent(rest[0])}` : '/m/profile'
    case 'conversation':
    case 'messages':
      return rest[0] ? `/m/messages/${encodeURIComponent(rest[0])}` : '/m/messages'
    case 'group':
    case 'groups':
    case 'study-groups':
      return rest[0] ? `/m/groups/${encodeURIComponent(rest[0])}` : '/m/home'
    case 'search':
      return `/m/search${search}`
    case 'home':
    case 'feed':
      return '/m/home'
    case 'profile':
      return '/m/profile'
    case 'ai':
    case 'hub-ai':
      return '/m/ai'
    default:
      return '/m/home'
  }
}

/**
 * React hook. Registers the Capacitor App `appUrlOpen` listener on mount
 * and calls `navigate(route)` when a link opens the app. No-op on web.
 */
export function useDeepLinkRouter() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNativePlatform()) return undefined

    let cleanup = null
    let cancelled = false

    // Lazy-import the plugin so the web bundle doesn't fail to resolve it
    // when running outside Capacitor (e.g., `vite dev`).
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        if (cancelled) return

        const handle = await App.addListener('appUrlOpen', (event) => {
          const route = routeForDeepLink(event?.url || '')
          if (!route) return
          navigate(route)
        })

        cleanup = () => handle.remove()
      } catch {
        // Plugin missing at runtime (e.g., during HMR or before cap sync).
        // Silent no-op so the rest of the app keeps working.
      }
    })()

    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [navigate])
}

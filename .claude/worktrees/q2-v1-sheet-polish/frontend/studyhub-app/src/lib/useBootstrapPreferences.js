import { useEffect, useRef } from 'react'
import { API } from '../config'
import {
  applyAppearancePreferences,
  applyGlobalTheme,
  clearLegacyCachedAppearancePreferences,
  readCachedAppearancePreferences,
  writeCachedAppearancePreferences,
  writeGlobalTheme,
} from './appearance'
import { useSession } from './session-context'

export function useBootstrapPreferences() {
  const { isAuthenticated, user } = useSession()
  const bootstrappedUserIdRef = useRef('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    const userId = user?.id ? String(user.id) : ''

    if (!isAuthenticated || !userId) {
      bootstrappedUserIdRef.current = ''
      requestIdRef.current += 1
      clearLegacyCachedAppearancePreferences()
      applyGlobalTheme()
      return
    }

    if (bootstrappedUserIdRef.current === userId) {
      return
    }

    bootstrappedUserIdRef.current = userId

    const cachedPreferences = readCachedAppearancePreferences(userId)
    if (cachedPreferences) {
      applyAppearancePreferences(cachedPreferences)
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    fetch(`${API}/api/settings/preferences`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || requestId !== requestIdRef.current) {
          return
        }

        const appearancePreferences = {
          theme: data.theme,
          fontSize: data.fontSize,
        }

        applyAppearancePreferences(appearancePreferences)
        writeCachedAppearancePreferences(appearancePreferences, userId)
        if (appearancePreferences.theme) writeGlobalTheme(appearancePreferences.theme)
      })
      .catch(() => {})
  }, [isAuthenticated, user?.id])
}
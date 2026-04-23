const FONT_SIZE_MAP = {
  small: '14px',
  medium: '16px',
  large: '18px',
}

export const APPEARANCE_STORAGE_KEY = 'studyhub_prefs'
const GLOBAL_THEME_KEY = 'sh-theme'

function getAppearanceStorageKey(userId) {
  if (!userId) {
    return ''
  }

  return `${APPEARANCE_STORAGE_KEY}_${String(userId)}`
}

function getDocumentRoot() {
  if (typeof document === 'undefined') {
    return null
  }

  return document.documentElement
}

export function applyTheme(theme) {
  const root = getDocumentRoot()

  if (!root) {
    return
  }

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
    return
  }

  if (theme === 'light') {
    root.removeAttribute('data-theme')
    return
  }

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  if (prefersDark) root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

export function applyFontSize(fontSize) {
  const root = getDocumentRoot()

  if (!root) {
    return
  }

  root.style.fontSize = FONT_SIZE_MAP[fontSize] || FONT_SIZE_MAP.medium
}

export function applyAppearancePreferences(preferences = {}) {
  if (preferences.theme) {
    applyTheme(preferences.theme)
  }

  if (preferences.fontSize) {
    applyFontSize(preferences.fontSize)
  }
}

export function resetAppearancePreferences() {
  const root = getDocumentRoot()

  if (!root) {
    return
  }

  root.removeAttribute('data-theme')
  root.style.fontSize = ''
}

export function readCachedAppearancePreferences(userId) {
  if (typeof window === 'undefined') {
    return null
  }

  const storageKey = getAppearanceStorageKey(userId)

  if (!storageKey) {
    return null
  }

  try {
    const cached = window.localStorage.getItem(storageKey)

    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached)
    return {
      theme: parsed?.theme,
      fontSize: parsed?.fontSize,
    }
  } catch {
    return null
  }
}

export function writeCachedAppearancePreferences(preferences = {}, userId) {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = getAppearanceStorageKey(userId)

  if (!storageKey) {
    return
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        theme: preferences.theme,
        fontSize: preferences.fontSize,
      }),
    )
  } catch {
    /* ignore */
  }
}

export function clearLegacyCachedAppearancePreferences() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Global (user-agnostic) theme persistence.
 * Survives logout so unauthenticated pages keep the last chosen theme.
 */
export function writeGlobalTheme(theme) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GLOBAL_THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function applyGlobalTheme() {
  if (typeof window === 'undefined') return
  try {
    const stored = window.localStorage.getItem(GLOBAL_THEME_KEY)
    applyTheme(stored || 'system')
  } catch {
    applyTheme('system')
  }
}

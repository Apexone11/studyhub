// src/config.js
// Shared frontend config values.
// In Docker/Railway production, runtime-config.js is generated on container startup
// so values can be changed without rebuilding the static bundle.
// On Capacitor native, VITE_MOBILE_API_URL or VITE_API_URL should be set to the
// production backend URL (e.g., https://your-backend.up.railway.app).
const runtimeConfig =
  typeof window !== 'undefined' && window.__STUDYHUB_CONFIG__ ? window.__STUDYHUB_CONFIG__ : {}

// Detect Capacitor native shell (https://localhost on Android)
const _isNative =
  typeof window !== 'undefined' &&
  (window.__SH_NATIVE__ ||
    (window.location.protocol === 'https:' && window.location.hostname === 'localhost'))

// On native, prefer the mobile-specific API URL, then the standard API URL.
// Falls back to localhost:4000 for web development only.
export const API =
  runtimeConfig.API ||
  (_isNative
    ? import.meta.env.VITE_MOBILE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'
    : import.meta.env.VITE_API_URL || 'http://localhost:4000')

export const SUPPORT_EMAIL =
  runtimeConfig.SUPPORT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'abdulrfornah@getstudyhub.org'

export const GOOGLE_ADS_ID =
  runtimeConfig.GOOGLE_ADS_ID || import.meta.env.VITE_GOOGLE_ADS_ID || 'AW-18019301841'

export const GOOGLE_ADS_SIGNUP_CONVERSION_LABEL =
  runtimeConfig.GOOGLE_ADS_SIGNUP_CONVERSION_LABEL ||
  import.meta.env.VITE_GOOGLE_ADS_SIGNUP_CONVERSION_LABEL ||
  ''

export const CLARITY_PROJECT_ID =
  runtimeConfig.CLARITY_PROJECT_ID || import.meta.env.VITE_CLARITY_PROJECT_ID || ''

export const GOOGLE_CLIENT_ID =
  runtimeConfig.GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export const TENOR_API_KEY =
  runtimeConfig.TENOR_API_KEY ||
  import.meta.env.VITE_TENOR_API_KEY ||
  'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

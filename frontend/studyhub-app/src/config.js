// src/config.js
// Shared frontend config values.
// In Docker/Railway production, runtime-config.js is generated on container startup
// so values can be changed without rebuilding the static bundle.
const runtimeConfig =
  typeof window !== 'undefined' && window.__STUDYHUB_CONFIG__
    ? window.__STUDYHUB_CONFIG__
    : {}

export const API =
  runtimeConfig.API ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000'

export const SUPPORT_EMAIL =
  runtimeConfig.SUPPORT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'abdulrfornah@getstudyhub.org'

export const GOOGLE_ADS_ID =
  runtimeConfig.GOOGLE_ADS_ID ||
  import.meta.env.VITE_GOOGLE_ADS_ID ||
  'AW-18019301841'

export const GOOGLE_ADS_SIGNUP_CONVERSION_LABEL =
  runtimeConfig.GOOGLE_ADS_SIGNUP_CONVERSION_LABEL ||
  import.meta.env.VITE_GOOGLE_ADS_SIGNUP_CONVERSION_LABEL ||
  ''

export const CLARITY_PROJECT_ID =
  runtimeConfig.CLARITY_PROJECT_ID ||
  import.meta.env.VITE_CLARITY_PROJECT_ID ||
  ''

export const GOOGLE_CLIENT_ID =
  runtimeConfig.GOOGLE_CLIENT_ID ||
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  ''

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

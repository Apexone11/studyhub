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

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

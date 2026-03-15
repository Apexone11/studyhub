// src/config.js
// Shared frontend config values.
// Locally:    uses http://localhost:4000 when VITE_API_URL is not set.
// Production: reads VITE_* values from Railway environment variables.
export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'abdulrfornah@getstudyhub.org'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

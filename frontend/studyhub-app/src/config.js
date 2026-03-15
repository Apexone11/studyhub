// src/config.js
// Single source of truth for the backend API URL.
// Locally:    uses http://localhost:4000  (VITE_API_URL not set)
// Production: reads VITE_API_URL from Railway environment variables
export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

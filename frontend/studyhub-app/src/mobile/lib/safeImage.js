// src/mobile/lib/safeImage.js
// Defensive URL validator for <img src> assignments on the mobile tree.
// React does NOT block `javascript:` / `data:text/html` / `vbscript:` URIs
// on <img src> across all React 19 versions. Server responses are generally
// trusted, but we apply defense-in-depth so a compromised avatar/profile
// record cannot become a script-execution vector.
//
// Policy:
//   ✓ http(s): absolute URLs pass
//   ✓ Protocol-relative `//` URLs pass (rare, but Google avatars use them)
//   ✓ Same-origin paths starting with `/` pass
//   ✓ blob: URLs pass (client-side preview of user-selected files)
//   ✓ data: URLs ONLY for image/* MIME types
//   ✗ Everything else (javascript:, vbscript:, file:, etc.) returns null

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function safeImageSrc(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Same-origin path
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  if (trimmed.startsWith('//')) return trimmed
  if (trimmed.startsWith('blob:')) return trimmed
  if (trimmed.toLowerCase().startsWith('data:image/')) return trimmed

  try {
    const u = new URL(trimmed)
    if (ALLOWED_PROTOCOLS.has(u.protocol)) return trimmed
  } catch {
    /* not a parseable absolute URL — fall through to reject */
  }

  return null
}

export default safeImageSrc

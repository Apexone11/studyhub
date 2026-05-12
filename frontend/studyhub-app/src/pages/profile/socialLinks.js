/* ═══════════════════════════════════════════════════════════════════════════
 * socialLinks.js — Shared helpers for profile social-link UI.
 *
 * URL validation: https:// only (frontend gate; the backend also normalizes
 * via lib/profileMetadata.js#normalizeLinkUrl and ultimately requires
 * http/https). We enforce https-only in the UI because that's what shows
 * the "verified domain" safety badge on others' profiles.
 *
 * Allowlist of well-known domains earns a "trusted domain" badge. Anything
 * else still renders, but as a generic external link with no badge — the
 * viewer sees the raw hostname before deciding to click.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_PROFILE_SOCIAL_LINKS = 4
export const MAX_LINK_LABEL_LENGTH = 32
export const MAX_LINK_URL_LENGTH = 240

/**
 * Allowlist of trusted domains. Each entry is matched against the host
 * (case-insensitive, with `www.` stripped). Wildcard subdomains are denoted
 * by a leading `*.` — e.g. `*.github.io`.
 */
const TRUSTED_DOMAINS = [
  { match: 'github.com', kind: 'github', label: 'GitHub' },
  { match: 'gitlab.com', kind: 'gitlab', label: 'GitLab' },
  { match: 'linkedin.com', kind: 'linkedin', label: 'LinkedIn' },
  { match: 'twitter.com', kind: 'twitter', label: 'Twitter / X' },
  { match: 'x.com', kind: 'twitter', label: 'X' },
  { match: 'mastodon.social', kind: 'mastodon', label: 'Mastodon' },
  { match: 'bsky.app', kind: 'bluesky', label: 'Bluesky' },
  { match: 'instagram.com', kind: 'instagram', label: 'Instagram' },
  { match: 'youtube.com', kind: 'youtube', label: 'YouTube' },
  { match: 'youtu.be', kind: 'youtube', label: 'YouTube' },
  { match: 'medium.com', kind: 'medium', label: 'Medium' },
  { match: 'substack.com', kind: 'substack', label: 'Substack' },
  { match: 'dev.to', kind: 'devto', label: 'DEV' },
  { match: 'stackoverflow.com', kind: 'stackoverflow', label: 'Stack Overflow' },
  { match: 'orcid.org', kind: 'orcid', label: 'ORCID' },
  { match: 'scholar.google.com', kind: 'scholar', label: 'Google Scholar' },
  { match: 'researchgate.net', kind: 'researchgate', label: 'ResearchGate' },
  { match: '*.github.io', kind: 'website', label: 'Personal site' },
  { match: '*.gitlab.io', kind: 'website', label: 'Personal site' },
]

function hostMatches(host, pattern) {
  if (pattern.startsWith('*.')) {
    const tail = pattern.slice(1) // includes leading "."
    return host.endsWith(tail) && host.length > tail.length
  }
  return host === pattern
}

/**
 * Parse a URL string and return classification info, or `null` for invalid
 * (non-https) URLs. Never throws.
 */
export function classifyLinkUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null
  let parsed
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  for (const entry of TRUSTED_DOMAINS) {
    if (hostMatches(host, entry.match)) {
      return {
        url: parsed.toString(),
        host,
        kind: entry.kind,
        platformLabel: entry.label,
        trusted: true,
      }
    }
  }
  return {
    url: parsed.toString(),
    host,
    kind: 'website',
    platformLabel: 'Website',
    trusted: false,
  }
}

/** True if the URL is a valid https URL — used for inline editor validation. */
export function isValidHttpsUrl(rawUrl) {
  return classifyLinkUrl(rawUrl) !== null
}

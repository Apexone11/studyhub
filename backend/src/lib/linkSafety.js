/**
 * linkSafety.js — Phase 5 C.2 static link safety check.
 *
 * v1 approach: a static blocklist of known-bad TLDs and URL patterns.
 * Designed to be replaced by a Google Safe Browsing API integration in
 * a future phase without changing the call-site contract.
 *
 * Returns { safe: boolean, reason?: string } for a given URL string.
 * Graceful degradation: parse failures return safe=true so a broken
 * check never blocks a legitimate post.
 */

// Known phishing / malware TLDs (sourced from public blocklists).
// This is intentionally short for v1; the GSB integration will cover
// the long tail.
const BLOCKED_TLDS = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq',       // Freenom free TLDs (90%+ spam)
  '.top', '.buzz', '.work', '.loan',        // high-spam generic TLDs
  '.racing', '.download', '.stream',
  '.click', '.link', '.date', '.cricket',
])

// Exact-domain blocks for known-bad hosts.
const BLOCKED_DOMAINS = new Set([
  'bit.ly.fake.com',
  'grabify.link',
  'iplogger.org',
  'iplogger.com',
  'blasze.tk',
  '2no.co',
])

// Suspicious path patterns (regex). Catches things like /wp-login.php
// clones and common credential-harvesting paths.
const SUSPICIOUS_PATTERNS = [
  /\/wp-login\.php/i,
  /\/\.env$/i,
  /\/phpmyadmin/i,
  /\/xmlrpc\.php/i,
]

function checkUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { safe: true }

  let parsed
  try {
    // Normalize: if it doesn't have a protocol, prepend https:// so
    // new URL() doesn't throw on relative-looking strings.
    const normalized = rawUrl.match(/^https?:\/\//) ? rawUrl : `https://${rawUrl}`
    parsed = new URL(normalized)
  } catch {
    // Unparseable URL — let the caller decide whether to reject it.
    return { safe: true }
  }

  const hostname = parsed.hostname.toLowerCase()

  // Check exact domain matches.
  if (BLOCKED_DOMAINS.has(hostname)) {
    return { safe: false, reason: `Blocked domain: ${hostname}` }
  }

  // Check TLD.
  for (const tld of BLOCKED_TLDS) {
    if (hostname.endsWith(tld)) {
      return { safe: false, reason: `Suspicious TLD: ${tld}` }
    }
  }

  // Check suspicious path patterns.
  const pathname = parsed.pathname.toLowerCase()
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(pathname)) {
      return { safe: false, reason: `Suspicious URL path pattern` }
    }
  }

  return { safe: true }
}

/**
 * Scan multiple URLs and return the first unsafe result, or safe if all pass.
 */
function checkUrls(urls) {
  if (!Array.isArray(urls)) return { safe: true }
  for (const url of urls) {
    const result = checkUrl(url)
    if (!result.safe) return result
  }
  return { safe: true }
}

module.exports = { checkUrl, checkUrls, BLOCKED_TLDS, BLOCKED_DOMAINS }

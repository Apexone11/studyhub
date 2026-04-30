/**
 * ssrfGuard.js — defensive SSRF allowlist for any future server-side fetch
 * that uses a user-supplied URL.
 *
 * Why this exists today (no caller yet):
 *   The feature expansion roadmap (decision #15) keeps video embeds as
 *   uploads-only for v1 specifically because URL embeds open an SSRF surface.
 *   Scholar tier and Hub AI v2 (citation grounding) WILL fetch
 *   user-supplied URLs once they ship — and the security addendum requires
 *   an allowlist + private-IP block in place BEFORE that code lands.
 *
 *   Building this scaffold now (lint-clean, exported, but unimported) means
 *   the gate is ready when the feature lands. Importing this from new fetch
 *   code is one line; trying to retrofit allowlisting after a feature ships
 *   is much riskier.
 *
 * Usage (when a feature wires this in):
 *   const { assertSafeOutboundUrl } = require('./ssrfGuard')
 *   const url = assertSafeOutboundUrl(req.body.citationUrl, { context: 'scholar.fetch' })
 *   const response = await fetch(url.toString())
 */

const PRIVATE_IPV4_RANGES = [
  // RFC 1918 private ranges
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Loopback
  /^127\./,
  // Link-local (cloud metadata service lives here: 169.254.169.254)
  /^169\.254\./,
  // CGNAT / shared
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // Reserved / multicast
  /^0\./,
  /^22[4-9]\./,
  /^23\d\./,
  /^2[4-5]\d\./,
]

const IPV6_DENY_PREFIXES = [
  '::1', // loopback
  '::', // unspecified (also catches all-zero)
  'fc', // unique local
  'fd',
  'fe80', // link-local
  'fec0', // site-local (deprecated but still rejected)
]

/* IPv4-mapped IPv6 addresses route by many kernels as the embedded IPv4
 * (so ::ffff:127.0.0.1 hits loopback). Two forms exist depending on URL
 * parser normalization:
 *   - dotted-quad: `::ffff:127.0.0.1`
 *   - compact hex: `::ffff:7f00:1`  (Node's URL parser compacts to this)
 * We extract the embedded IPv4 from either and re-check the IPv4 deny list. */
const IPV4_MAPPED_DOTTED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i
const IPV4_MAPPED_HEX_RE = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

function extractIpv4Mapped(host) {
  const dotted = IPV4_MAPPED_DOTTED_RE.exec(host)
  if (dotted) return dotted[1]
  const hex = IPV4_MAPPED_HEX_RE.exec(host)
  if (hex) {
    const high = parseInt(hex[1], 16)
    const low = parseInt(hex[2], 16)
    return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
  }
  return null
}

/**
 * Default allowlist for citation / academic-paper fetches. Subdomains of
 * each entry are accepted (e.g. `cdn.arxiv.org` matches `arxiv.org`).
 * Override per-call via `options.allowlist`.
 */
const DEFAULT_CITATION_ALLOWLIST = Object.freeze([
  'arxiv.org',
  'doi.org',
  'scholar.google.com',
  'ncbi.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov',
  'jstor.org',
  'springer.com',
  'nature.com',
  'science.org',
  'acm.org',
  'ieee.org',
  'wiley.com',
])

function isPrivateIpv4(host) {
  return PRIVATE_IPV4_RANGES.some((re) => re.test(host))
}

function isPrivateIpv6(host) {
  const lower = host.toLowerCase()
  return IPV6_DENY_PREFIXES.some((p) => lower === p || lower.startsWith(p + ':'))
}

function looksLikeIpv4(host) {
  return /^(\d{1,3})(\.\d{1,3}){3}$/.test(host)
}

function looksLikeIpv6(host) {
  return host.includes(':') && !host.includes('.')
}

function hostMatchesAllowlist(hostname, allowlist) {
  const lower = hostname.toLowerCase()
  return allowlist.some(
    (entry) => lower === entry.toLowerCase() || lower.endsWith(`.${entry.toLowerCase()}`),
  )
}

/**
 * Validate a user-supplied URL and return the parsed URL on success.
 * Throws on:
 *   - non-string input
 *   - unparseable URL
 *   - non-http(s) scheme
 *   - private / loopback / link-local / metadata IP
 *   - hostname not in the configured allowlist
 *
 * @param {string} input — the URL string to validate
 * @param {object} [options]
 * @param {string} [options.context] — short label for error messages and logs
 * @param {ReadonlyArray<string>} [options.allowlist] — host suffixes to allow
 * @returns {URL}
 */
function assertSafeOutboundUrl(input, options = {}) {
  const context = options.context || 'outbound'
  const allowlist = options.allowlist || DEFAULT_CITATION_ALLOWLIST

  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`[ssrfGuard:${context}] URL must be a non-empty string`)
  }

  let url
  try {
    url = new URL(input)
  } catch {
    throw new Error(`[ssrfGuard:${context}] URL is not parseable`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[ssrfGuard:${context}] URL scheme must be http or https`)
  }

  // Strip any embedded credentials — we never want to forward those.
  if (url.username || url.password) {
    throw new Error(`[ssrfGuard:${context}] URL must not contain credentials`)
  }

  // Strip brackets that surround IPv6 hostnames in URLs.
  let host = url.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)

  // Note: Node's URL parser normalises bare-decimal hostnames like "0" or
  // "2130706433" into dotted-quad IPv4 ("0.0.0.0", "127.0.0.1"), so they
  // hit the IPv4 deny list below directly without a separate check.

  if (looksLikeIpv4(host) && isPrivateIpv4(host)) {
    throw new Error(`[ssrfGuard:${context}] private IPv4 address is not allowed`)
  }

  // IPv4-mapped IPv6 — extract the embedded IPv4 and re-check against the
  // IPv4 deny list. ::ffff:127.0.0.1 (and the hex-compact form) must be
  // blocked the same way as 127.0.0.1.
  const mappedIpv4 = extractIpv4Mapped(host)
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) {
    throw new Error(`[ssrfGuard:${context}] private IPv4-mapped IPv6 is not allowed`)
  }

  if (looksLikeIpv6(host) && isPrivateIpv6(host)) {
    throw new Error(`[ssrfGuard:${context}] private IPv6 address is not allowed`)
  }
  if (host === 'localhost' || host === 'localhost.localdomain') {
    throw new Error(`[ssrfGuard:${context}] localhost is not allowed`)
  }

  if (!hostMatchesAllowlist(host, allowlist)) {
    throw new Error(`[ssrfGuard:${context}] host not in allowlist: ${host}`)
  }

  return url
}

module.exports = {
  assertSafeOutboundUrl,
  DEFAULT_CITATION_ALLOWLIST,
}

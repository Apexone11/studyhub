const SAFE_PROVIDER_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'gravatar.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
])

const BLOCKED_HOSTS = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'coinhive.com',
  'jsecoin.com',
  'malware.example',
])

function normalizeHost(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^www\./, '')
}

function hostMatches(hostname, candidate) {
  const host = normalizeHost(hostname)
  const normalizedCandidate = normalizeHost(candidate)
  return host === normalizedCandidate || host.endsWith(`.${normalizedCandidate}`)
}

function configuredAllowedHosts() {
  const hosts = []
  for (const value of [
    process.env.FRONTEND_URL,
    process.env.API_URL,
    process.env.STUDYHUB_ASSET_CDN,
  ]) {
    if (!value) continue
    try {
      hosts.push(new URL(value).hostname)
    } catch {
      /* ignore malformed configuration */
    }
  }
  return hosts
}

function classifyOrigin(rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl || ''))
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null

  const hostname = normalizeHost(parsed.hostname)
  if (configuredAllowedHosts().some((host) => hostMatches(hostname, host))) {
    return { tier: 'allowed', deduction: 0, hostname }
  }

  if ([...BLOCKED_HOSTS].some((host) => hostMatches(hostname, host))) {
    return { tier: 'blocked', deduction: 50, hostname }
  }

  if ([...SAFE_PROVIDER_HOSTS].some((host) => hostMatches(hostname, host))) {
    return { tier: 'safe', deduction: 5, hostname }
  }

  return { tier: 'unknown', deduction: 15, hostname }
}

function extractExternalUrls(html) {
  const value = String(html || '')
  const urls = new Set()
  const patterns = [
    /\b(?:href|src|action|poster)\s*=\s*["'](https?:\/\/[^"']+)["']/gi,
    /\b(?:href|src|action|poster)\s*=\s*(https?:\/\/[^\s>]+)/gi,
    /url\(\s*["']?(https?:\/\/[^"')\s]+)["']?\s*\)/gi,
    /@import\s+(?:url\()?\s*["']?(https?:\/\/[^"')\s;]+)["']?\s*\)?/gi,
  ]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    for (const match of value.matchAll(pattern)) {
      urls.add(match[1])
    }
  }

  return [...urls]
}

function auditAssetOrigins(html) {
  const origins = extractExternalUrls(html).map((url) => ({
    url,
    classification: classifyOrigin(url),
  }))
  const findings = origins
    .filter(
      ({ classification }) =>
        classification?.tier === 'unknown' || classification?.tier === 'blocked',
    )
    .map(({ url, classification }) => ({
      category: 'asset-origin',
      severity: classification.tier === 'blocked' ? 'high' : 'medium',
      message:
        classification.tier === 'blocked'
          ? `Blocked external asset origin: ${classification.hostname}`
          : `Unknown external asset origin: ${classification.hostname}`,
      url,
      hostname: classification.hostname,
      tier: classification.tier,
      deduction: classification.deduction,
    }))
  const totalDeduction = origins.reduce(
    (sum, { classification }) => sum + (classification?.deduction || 0),
    0,
  )

  return { origins, findings, score: Math.max(0, 100 - totalDeduction) }
}

module.exports = {
  BLOCKED_HOSTS,
  SAFE_PROVIDER_HOSTS,
  auditAssetOrigins,
  classifyOrigin,
  extractExternalUrls,
}

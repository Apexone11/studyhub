import { API } from '../config'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase())
}

function upgradePublicHttp(url) {
  if (url.protocol !== 'http:' || isLocalHost(url.hostname)) return url.toString()
  url.protocol = 'https:'
  return url.toString()
}

export function safeImageSrc(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  if (trimmed.startsWith('//')) return trimmed
  if (trimmed.startsWith('blob:')) return trimmed
  if (trimmed.toLowerCase().startsWith('data:image/')) return trimmed

  try {
    const url = new URL(trimmed)
    if (ALLOWED_PROTOCOLS.has(url.protocol)) return upgradePublicHttp(url)
  } catch {
    return null
  }

  return null
}

export function resolveImageUrl(raw, apiBase = API) {
  const safeUrl = safeImageSrc(raw)
  if (!safeUrl) return null

  if (safeUrl.startsWith('/') && !safeUrl.startsWith('//')) {
    const normalizedBase = String(apiBase || '').replace(/\/$/, '')
    return `${normalizedBase}${safeUrl}`
  }

  return safeUrl
}

/**
 * WebAuthn client-side helpers for passkey registration and authentication.
 */
import { API } from '../config'

export function isWebAuthnSupported() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create &&
    navigator.credentials.get
  )
}

// ── Base64url <-> ArrayBuffer helpers ───────────────────────────────────

function base64urlToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Fetch with CSRF ─────────────────────────────────────────────────────

function getCsrfToken() {
  try {
    const stored = localStorage.getItem('studyhub_user')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.csrfToken || ''
    }
  } catch {
    /* ignore */
  }
  return ''
}

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
    ...extra,
  }
}

// ── Registration ────────────────────────────────────────────────────────

export async function registerPasskey(name) {
  const optRes = await fetch(`${API}/api/webauthn/register/options`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!optRes.ok) {
    const data = await optRes.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to get registration options.')
  }

  const options = await optRes.json()

  // Convert base64url strings to ArrayBuffers for the WebAuthn API
  options.challenge = base64urlToBuffer(options.challenge)
  options.user.id = base64urlToBuffer(options.user.id)
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }))
  }

  const credential = await navigator.credentials.create({ publicKey: options })

  const verifyRes = await fetch(`${API}/api/webauthn/register/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
        attestationObject: bufferToBase64url(credential.response.attestationObject),
      },
      transports: credential.response.getTransports ? credential.response.getTransports() : [],
      name: name || undefined,
    }),
  })

  const data = await verifyRes.json()
  if (!verifyRes.ok) {
    throw new Error(data.error || 'Passkey registration failed.')
  }
  return data
}

// ── Authentication ──────────────────────────────────────────────────────

export async function authenticateWithPasskey(username) {
  const optRes = await fetch(`${API}/api/webauthn/authenticate/options`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  if (!optRes.ok) {
    const data = await optRes.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to get authentication options.')
  }

  const options = await optRes.json()

  // Convert base64url strings to ArrayBuffers
  options.challenge = base64urlToBuffer(options.challenge)
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }))
  }

  const credential = await navigator.credentials.get({ publicKey: options })

  const verifyRes = await fetch(`${API}/api/webauthn/authenticate/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
        authenticatorData: bufferToBase64url(credential.response.authenticatorData),
        signature: bufferToBase64url(credential.response.signature),
        userHandle: credential.response.userHandle
          ? bufferToBase64url(credential.response.userHandle)
          : null,
      },
      username,
    }),
  })

  const data = await verifyRes.json()
  if (!verifyRes.ok) {
    throw new Error(data.error || 'Passkey authentication failed.')
  }
  return data
}

// ── Credential management ───────────────────────────────────────────────

export async function listPasskeys() {
  const res = await fetch(`${API}/api/webauthn/credentials`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load passkeys.')
  return data.credentials || []
}

export async function removePasskey(id) {
  const res = await fetch(`${API}/api/webauthn/credentials/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to remove passkey.')
  return data
}

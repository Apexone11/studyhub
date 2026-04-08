/**
 * aiService.js -- API functions for Hub AI assistant.
 * All endpoints use the global fetch shim (auto credentials + CSRF).
 */
import { API } from '../config'

const BASE = `${API}/api/ai`

/* ── Conversations ──────────────────────────────────────────────── */

export async function listConversations({ limit = 30, offset = 0 } = {}) {
  const res = await fetch(`${BASE}/conversations?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to load conversations')
  return res.json()
}

export async function createConversation(title = null) {
  const res = await fetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function getConversation(id) {
  const res = await fetch(`${BASE}/conversations/${id}`)
  if (!res.ok) throw new Error('Failed to load conversation')
  return res.json()
}

export async function deleteConversation(id) {
  const res = await fetch(`${BASE}/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete conversation')
  return res.json()
}

export async function renameConversation(id, title) {
  const res = await fetch(`${BASE}/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to rename conversation')
  return res.json()
}

/* ── Messages (SSE streaming) ───────────────────────────────────── */

/**
 * Send a message and return a reader for the SSE stream.
 * The caller handles consuming events from the reader.
 *
 * @param {object} params
 * @param {number} params.conversationId
 * @param {string} params.content
 * @param {string} [params.currentPage]
 * @param {Array}  [params.images] - Array of { base64, mediaType }
 * @returns {Promise<ReadableStreamDefaultReader>}
 */
export async function sendMessage({ conversationId, content, currentPage, images }) {
  const res = await fetch(`${BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, content, currentPage, images }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to send message')
  }

  return res.body.getReader()
}

/* ── Usage ──────────────────────────────────────────────────────── */

export async function getUsage() {
  const res = await fetch(`${BASE}/usage`)
  if (!res.ok) throw new Error('Failed to load usage')
  return res.json()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * messageQueue.js — Offline outbox for failed message sends
 *
 * When a `sendMessage` POST fails because the device is offline (or the
 * network call throws before the server is reached), the call site can
 * enqueue the payload here. When the browser fires the `online` event the
 * queue drains automatically.
 *
 * Storage: localStorage (key `studyhub_message_queue`). IndexedDB would
 * give larger capacity, but a message body caps at 5000 chars (see
 * MAX_MESSAGE_LENGTH in backend/lib/constants.js) and 50 queued messages
 * × 5000 chars = 250KB, well under the 5MB localStorage budget. Trading
 * complexity for the simpler storage primitive here is the right call.
 *
 * Storage shape: `{ items: QueuedMessage[] }` where each QueuedMessage is
 *   {
 *     id: string (client-generated UUID-ish),
 *     conversationId: number,
 *     body: object (full POST body — content, replyToId, attachments, poll),
 *     enqueuedAt: number (ms epoch),
 *     attempts: number,
 *   }
 *
 * Single subscriber pattern: the messaging hook registers one drain
 * handler on mount and unregisters on unmount. The queue itself is a
 * module-level singleton because there is only one active user session
 * per tab at a time.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { onReconnect, isOffline } from './networkStatus'

const STORAGE_KEY = 'studyhub_message_queue'
const MAX_QUEUE_SIZE = 50
const MAX_ATTEMPTS = 5

function readQueue() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.items)) return []
    return parsed.items
  } catch {
    // Storage quota, private-mode, or corrupted JSON — start clean.
    return []
  }
}

function writeQueue(items) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }))
  } catch {
    /* quota or private mode — silent. Worst case the user re-types. */
  }
}

function makeId() {
  // crypto.randomUUID is widely available (Chrome 92+, Safari 15.4+, FF 95+).
  // Fallback for older browsers / Capacitor older WebView builds.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Append a message to the offline outbox.
 * Returns the queued record (so the caller can show "Queued" UI).
 */
export function enqueueMessage({ conversationId, body }) {
  const items = readQueue()
  if (items.length >= MAX_QUEUE_SIZE) {
    // Drop the oldest to make room — a 50-message backlog already means
    // the user has been offline for a long time; keeping the freshest
    // intent is the right trade-off.
    items.shift()
  }
  const record = {
    id: makeId(),
    conversationId,
    body,
    enqueuedAt: Date.now(),
    attempts: 0,
  }
  items.push(record)
  writeQueue(items)
  return record
}

/**
 * Snapshot the current queue (read-only — does not drain).
 */
export function getQueuedMessages() {
  return readQueue()
}

/**
 * Remove a single queued item by id.
 */
export function removeQueuedMessage(id) {
  const items = readQueue().filter((item) => item.id !== id)
  writeQueue(items)
}

/**
 * Clear the entire queue. Used on logout.
 */
export function clearMessageQueue() {
  writeQueue([])
}

/**
 * Drain the queue by calling `sender(item)` for each entry. `sender` must
 * return a Promise that resolves on success and rejects on failure.
 * Successful sends are removed; failures increment `attempts` and stay
 * queued until MAX_ATTEMPTS is reached, at which point the item is dropped
 * to prevent infinite retry loops. Items are processed sequentially to
 * preserve send order within a conversation.
 *
 * Returns a summary object so callers can toast "Sent 3 queued messages".
 */
export async function drainQueue(sender) {
  if (typeof sender !== 'function') return { sent: 0, failed: 0, dropped: 0 }
  if (isOffline()) return { sent: 0, failed: 0, dropped: 0 }

  let items = readQueue()
  if (items.length === 0) return { sent: 0, failed: 0, dropped: 0 }

  let sent = 0
  let failed = 0
  let dropped = 0

  for (const item of items.slice()) {
    if (isOffline()) break
    try {
      await sender(item)
      sent += 1
      items = items.filter((entry) => entry.id !== item.id)
    } catch {
      failed += 1
      items = items.map((entry) =>
        entry.id === item.id ? { ...entry, attempts: entry.attempts + 1 } : entry,
      )
      // Drop items that have permanently failed (avoid clogging the queue).
      const target = items.find((entry) => entry.id === item.id)
      if (target && target.attempts >= MAX_ATTEMPTS) {
        items = items.filter((entry) => entry.id !== item.id)
        dropped += 1
      }
    }
    writeQueue(items)
  }
  return { sent, failed, dropped }
}

/**
 * Register a drain handler that fires automatically when the browser
 * goes back online. Returns an unsubscribe function.
 */
export function registerReconnectDrain(sender) {
  return onReconnect(() => {
    drainQueue(sender).catch(() => {
      /* drain failures already accounted in the per-item branch */
    })
  })
}

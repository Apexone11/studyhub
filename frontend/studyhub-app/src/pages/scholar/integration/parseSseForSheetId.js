/**
 * parseSseForSheetId — read a /api/ai/messages SSE response until we
 * spot the new `sheetId` payload, then cancel the stream and return.
 *
 * The /api/ai/messages endpoint streams pino-style line-delimited
 * events. For the "generate-sheet" flow we don't need the full body —
 * once we have the id we navigate the user to /sheets/:id/lab. Reading
 * past that point would just hold the connection open while the AI
 * keeps writing tokens nobody is going to read.
 *
 * Implementation notes:
 *  - Capped at 1 MB so a malformed stream can't grow the buffer
 *    unboundedly (a real sheetId fits in well under that).
 *  - The regex `"sheetId":...` matches either a quoted string or a
 *    bare alphanumeric id — both shapes have been seen in different
 *    server payload encodings (canonical JSON quotes the value;
 *    some older streams emitted `sheetId:42` without quotes).
 *  - `reader.cancel()` is best-effort; the stream may already be
 *    closed, in which case the cancel rejects — swallowed silently.
 *  - Returns `null` if the response has no body or the stream ends
 *    without a matching id. Callers should treat null as "open Hub AI
 *    so the user can review whatever the model produced."
 *
 * Extracted to a shared helper so ScholarPaperPage's handleGenerateSheet
 * doesn't re-inline the SSE parsing logic.
 *
 * @param {Response} response — the fetch Response from /api/ai/messages.
 * @returns {Promise<string | null>} — the new sheet id, or null.
 */
export async function parseSseForSheetId(response) {
  const reader = response?.body?.getReader?.()
  if (!reader) return null
  const decoder = new TextDecoder()
  let buf = ''
  let received = 0
  const MAX = 1024 * 1024
  let sheetId = null
  try {
    while (true) {
      const chunk = await reader.read().catch(() => ({ done: true }))
      if (chunk.done) break
      received += chunk.value?.byteLength || 0
      buf += decoder.decode(chunk.value, { stream: true })
      if (received > MAX) break
      const m = buf.match(/"sheetId"\s*:\s*"?([A-Za-z0-9_-]+)"?/)
      if (m && m[1]) {
        sheetId = m[1]
        break
      }
    }
  } finally {
    try {
      reader.cancel()
    } catch {
      // Best-effort — the stream may already be closed.
    }
  }
  return sheetId
}

export default parseSseForSheetId

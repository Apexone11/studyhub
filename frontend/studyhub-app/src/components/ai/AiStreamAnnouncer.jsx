/* ═══════════════════════════════════════════════════════════════════════════
 * AiStreamAnnouncer.jsx — Page-level aria-live region for streaming state.
 *
 * Per L4-HIGH-2: the streaming token container does NOT carry a live
 * region (otherwise every delta gets announced and the screen reader
 * spams the user). Instead this separate `role="status" aria-live="polite"`
 * element announces only the state transitions: "Hub AI is responding",
 * "Response complete", "Streaming stopped".
 *
 * The announcement string is derived directly from props (no useState in
 * an effect — that triggers cascading renders + the lint rule). A ref
 * stores the previous streaming flag so we can detect transitions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'

export default function AiStreamAnnouncer({ streaming, error, stopped }) {
  const lastStreamingRef = useRef(streaming)
  const containerRef = useRef(null)

  // We mutate the DOM directly so we don't have to setState inside the
  // transition-detection effect. This is the documented pattern for
  // imperative announcements.
  useEffect(() => {
    let next = ''
    if (streaming && !lastStreamingRef.current) {
      next = 'Hub AI is responding'
    } else if (!streaming && lastStreamingRef.current) {
      if (stopped) next = 'Streaming stopped'
      else if (error) next = 'Response error'
      else next = 'Response complete'
    }
    lastStreamingRef.current = streaming
    if (containerRef.current) {
      containerRef.current.textContent = next
    }
  }, [streaming, error, stopped])

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  )
}

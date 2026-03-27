import { useEffect, useState } from 'react'
import { getLastPageTiming } from '../lib/usePageTiming'

export default function PerfOverlay() {
  const [timing, setTiming] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const latest = getLastPageTiming()
      if (!latest) return
      const age = Math.round((Date.now() - latest.ts) / 1000)
      if (age > 30) {
        setTiming(null)
        return
      }
      if (latest !== timing) setTiming({ ...latest })
    }, 1000)
    return () => clearInterval(interval)
  }, [timing])

  if (!timing) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        left: 12,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.9)',
        color: '#e2e8f0',
        fontSize: 11,
        fontFamily: 'monospace',
        padding: '6px 10px',
        borderRadius: 8,
        lineHeight: 1.6,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{timing.page}</div>
      <div>API: {timing.apiLatencyMs ?? '—'}ms</div>
      <div>TTC: {timing.timeToContentMs ?? '—'}ms</div>
    </div>
  )
}

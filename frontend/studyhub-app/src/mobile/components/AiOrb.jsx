// src/mobile/components/AiOrb.jsx
// 120px gradient orb with a continuous pulse + breathing glow.
// Used as the hero visual on the Hub AI landing state.

import { useEffect, useRef } from 'react'
import { orbPulse, prefersReducedMotion } from '../lib/motion'

export default function AiOrb({ size = 120, thinking = false, className = '', style }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!thinking) return undefined
    if (prefersReducedMotion()) return undefined
    const inst = orbPulse(ref.current)
    return () => {
      if (inst && typeof inst.pause === 'function') inst.pause()
    }
  }, [thinking])

  const finalStyle = {
    width: size,
    height: size,
    ...style,
  }

  return (
    <div
      ref={ref}
      className={`sh-m-ai-orb ${thinking ? 'sh-m-ai-orb--thinking' : ''} ${className}`.trim()}
      style={finalStyle}
      aria-hidden="true"
    >
      <span className="sh-m-ai-orb__core" />
      <span className="sh-m-ai-orb__halo" />
      <span className="sh-m-ai-orb__ring" />
    </div>
  )
}

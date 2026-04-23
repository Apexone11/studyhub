// src/mobile/components/BrandedSplash.jsx
// Branded splash for the Mobile Design Refresh v3.
// Stroke-draws the StudyHub wordmark, pops a blue dot above the H, fades
// the aurora mesh in behind. Haptic tap at wordmark-complete.
// See spec §5.1.

import { useEffect, useRef, useState } from 'react'
import haptics from '../lib/haptics'
import { prefersReducedMotion } from '../lib/motion'

export default function BrandedSplash({ onDone, duration = 1200 }) {
  const [phase, setPhase] = useState('enter') // enter → ready → leaving → gone
  const doneRef = useRef(false)

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const enterDelay = reduced ? 0 : 80
    const readyDelay = reduced ? 200 : duration - 280
    const leaveDelay = reduced ? 400 : duration - 120
    const goneDelay = reduced ? 600 : duration

    const t1 = setTimeout(() => setPhase('ready'), enterDelay)
    const t2 = setTimeout(() => {
      haptics.tap()
    }, readyDelay)
    const t3 = setTimeout(() => setPhase('leaving'), leaveDelay)
    const t4 = setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      setPhase('gone')
      if (typeof onDone === 'function') onDone()
    }, goneDelay)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [duration, onDone])

  if (phase === 'gone') return null

  const classes = [
    'sh-m-splash',
    phase === 'ready' || phase === 'leaving' ? 'sh-m-splash--ready' : '',
    phase === 'leaving' ? 'sh-m-splash--leaving' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} role="status" aria-label="Loading StudyHub">
      <div className="sh-m-splash__mesh" aria-hidden="true" />
      <div className="sh-m-splash__mark">
        <span className="sh-m-splash__dot" aria-hidden="true" />
        <span>StudyHub</span>
      </div>
    </div>
  )
}

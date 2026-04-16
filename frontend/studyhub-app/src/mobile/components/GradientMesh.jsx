// src/mobile/components/GradientMesh.jsx
// Animated gradient mesh background with 3 softly moving orbs.
// GPU-accelerated: only transforms opacity. 80-100px blur, 20-30s loops.
// Respects prefers-reduced-motion.

import { useCallback, useEffect, useRef } from 'react'
import * as _animeModule from 'animejs'
const anime = _animeModule.default || _animeModule

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const ORB_CONFIG = [
  {
    color: 'var(--sh-brand)',
    size: 200,
    blur: 90,
    opacity: 0.18,
    x: ['15%', '55%', '25%'],
    y: ['20%', '50%', '20%'],
    duration: 22000,
  },
  {
    color: 'var(--sh-brand-accent)',
    size: 180,
    blur: 85,
    opacity: 0.14,
    x: ['65%', '30%', '70%'],
    y: ['60%', '25%', '65%'],
    duration: 26000,
  },
  {
    color: 'var(--sh-success)',
    size: 160,
    blur: 100,
    opacity: 0.1,
    x: ['40%', '70%', '35%'],
    y: ['75%', '40%', '70%'],
    duration: 30000,
  },
]

export default function GradientMesh({ className = '' }) {
  const containerRef = useRef(null)
  const orbElements = useRef([])

  const setOrbRef = useCallback(
    (index) => (el) => {
      orbElements.current[index] = el
    },
    [],
  )

  useEffect(() => {
    if (PREFERS_REDUCED) return

    const animations = orbElements.current.map((orb, i) => {
      if (!orb) return null
      const cfg = ORB_CONFIG[i]

      return anime({
        targets: orb,
        translateX: cfg.x.map((v) => v),
        translateY: cfg.y.map((v) => v),
        duration: cfg.duration,
        easing: 'easeInOutSine',
        loop: true,
        direction: 'alternate',
      })
    })

    return () => {
      animations.forEach((a) => a?.pause())
    }
  }, [])

  return (
    <div ref={containerRef} className={`mob-gradient-mesh ${className}`} aria-hidden="true">
      {ORB_CONFIG.map((cfg, i) => (
        <div
          key={i}
          ref={setOrbRef(i)}
          className="mob-gradient-mesh-orb"
          style={{
            width: cfg.size,
            height: cfg.size,
            background: cfg.color,
            filter: `blur(${cfg.blur}px)`,
            opacity: PREFERS_REDUCED ? cfg.opacity * 0.5 : cfg.opacity,
            position: 'absolute',
            left: cfg.x[0],
            top: cfg.y[0],
            borderRadius: '50%',
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  )
}

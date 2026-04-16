// src/mobile/components/GradientMesh.jsx
// Animated gradient mesh background with 3 softly moving orbs.
// GPU-accelerated: only transforms opacity. 80-100px blur, 20-30s loops.
// Respects prefers-reduced-motion.

import { useCallback, useEffect, useRef } from 'react'
import anime from '../lib/animeCompat'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const ORB_CONFIG = [
  {
    color: '#2563eb',
    size: 220,
    blur: 100,
    opacity: 0.15,
    x: ['10%', '50%', '20%'],
    y: ['15%', '45%', '15%'],
    duration: 24000,
  },
  {
    color: '#6366f1',
    size: 180,
    blur: 90,
    opacity: 0.12,
    x: ['60%', '25%', '65%'],
    y: ['55%', '20%', '60%'],
    duration: 28000,
  },
  {
    color: '#1e40af',
    size: 200,
    blur: 110,
    opacity: 0.1,
    x: ['35%', '65%', '30%'],
    y: ['70%', '35%', '65%'],
    duration: 32000,
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

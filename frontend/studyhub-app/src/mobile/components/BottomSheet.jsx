// src/mobile/components/BottomSheet.jsx
// Reusable bottom sheet with drag-to-dismiss, backdrop blur, and GPU-accelerated
// slide animation. Renders via portal so ancestor transforms cannot break it.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import anime from '../lib/animeCompat'

const DRAG_DISMISS_THRESHOLD = 120

/**
 * @param {object} props
 * @param {boolean} props.open — controlled visibility
 * @param {() => void} props.onClose — called when user dismisses
 * @param {string} [props.title] — optional header title
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {boolean} [props.fullHeight=false] — expand to ~95vh
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  className = '',
  fullHeight = false,
}) {
  const sheetRef = useRef(null)
  const backdropRef = useRef(null)
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false })
  const [mounted, setMounted] = useState(open)
  const prevOpenRef = useRef(open)

  // React-approved derived state pattern: set state during render when
  // the prop changes, not inside an effect. This avoids the
  // react-hooks/set-state-in-effect lint error.
  if (open && !mounted) {
    setMounted(true)
  }

  // Animate in when the sheet first mounts as open
  useEffect(() => {
    if (!mounted || !open) return

    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (!sheet || !backdrop) return

    anime({
      targets: backdrop,
      opacity: [0, 1],
      duration: 250,
      easing: 'easeOutCubic',
    })
    anime({
      targets: sheet,
      translateY: ['100%', '0%'],
      duration: 400,
      easing: 'easeOutCubic',
    })
  }, [mounted, open])

  // Animate out on user dismiss (drag / backdrop tap)
  const animateClose = useCallback(() => {
    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (!sheet || !backdrop) {
      onClose()
      return
    }

    anime({
      targets: backdrop,
      opacity: 0,
      duration: 200,
      easing: 'easeInCubic',
    })
    anime({
      targets: sheet,
      translateY: '100%',
      duration: 300,
      easing: 'easeInCubic',
      complete: () => {
        setMounted(false)
        onClose()
      },
    })
  }, [onClose])

  // Handle controlled close: parent sets open=false without user interaction.
  // We trigger the close animation; setMounted(false) happens inside the async
  // anime complete callback, avoiding the set-state-in-effect lint rule.
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open

    if (wasOpen && !open && mounted) {
      const sheet = sheetRef.current
      const backdrop = backdropRef.current
      if (!sheet || !backdrop) {
        // No DOM refs — schedule unmount on next frame to stay out of the
        // synchronous effect body (satisfies react-hooks/set-state-in-effect).
        requestAnimationFrame(() => setMounted(false))
        return
      }
      anime({
        targets: backdrop,
        opacity: 0,
        duration: 200,
        easing: 'easeInCubic',
      })
      anime({
        targets: sheet,
        translateY: '100%',
        duration: 300,
        easing: 'easeInCubic',
        complete: () => setMounted(false),
      })
    }
  }, [open, mounted])

  // Drag-to-dismiss handlers
  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    dragRef.current = { startY: touch.clientY, currentY: touch.clientY, dragging: true }
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!dragRef.current.dragging) return
    const touch = e.touches[0]
    dragRef.current.currentY = touch.clientY
    const dy = Math.max(0, touch.clientY - dragRef.current.startY)

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    }
    if (backdropRef.current) {
      const progress = Math.min(dy / 300, 1)
      backdropRef.current.style.opacity = String(1 - progress * 0.6)
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    const dy = dragRef.current.currentY - dragRef.current.startY

    if (dy > DRAG_DISMISS_THRESHOLD) {
      animateClose()
    } else {
      // Snap back
      if (sheetRef.current) {
        anime({
          targets: sheetRef.current,
          translateY: 0,
          duration: 250,
          easing: 'easeOutCubic',
        })
      }
      if (backdropRef.current) {
        anime({
          targets: backdropRef.current,
          opacity: 1,
          duration: 200,
          easing: 'easeOutCubic',
        })
      }
    }
  }, [animateClose])

  // Lock body scroll when open
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [mounted])

  if (!mounted) return null

  const heightClass = fullHeight ? 'mob-bottom-sheet--full' : ''

  return createPortal(
    <div className="mob-bottom-sheet-overlay" aria-modal="true" role="dialog">
      <div
        ref={backdropRef}
        className="mob-bottom-sheet-backdrop"
        onClick={animateClose}
        style={{ opacity: 0 }}
      />
      <div
        ref={sheetRef}
        className={`mob-bottom-sheet ${heightClass} ${className}`}
        style={{ transform: 'translateY(100%)' }}
      >
        <div
          className="mob-bottom-sheet-handle-zone"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mob-bottom-sheet-handle" />
        </div>
        {title && (
          <div className="mob-bottom-sheet-header">
            <h2 className="mob-bottom-sheet-title">{title}</h2>
          </div>
        )}
        <div className="mob-bottom-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

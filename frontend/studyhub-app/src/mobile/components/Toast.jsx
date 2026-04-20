// src/mobile/components/Toast.jsx
// Toast provider + host. Slides down from top safe-area, auto-dismisses,
// supports swipe-up dismiss, fires haptics on show.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import haptics from '../lib/haptics'
import { ToastContext } from '../hooks/useToast'

let _nextId = 1

function ToastItem({ toast, onDismiss }) {
  const ref = useRef(null)
  const startY = useRef(0)

  const handleTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!ref.current) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) {
      ref.current.style.transform = `translate3d(0, ${dy}px, 0)`
      ref.current.style.opacity = String(Math.max(0, 1 - Math.abs(dy) / 80))
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e) => {
      if (!ref.current) return
      const dy = (e.changedTouches[0] || { clientY: startY.current }).clientY - startY.current
      if (dy < -40) {
        onDismiss(toast.id)
      } else {
        ref.current.style.transform = ''
        ref.current.style.opacity = ''
      }
    },
    [onDismiss, toast.id],
  )

  return (
    <div
      ref={ref}
      className={`sh-m-toast sh-m-toast--${toast.kind}`}
      role={toast.kind === 'error' || toast.kind === 'warn' ? 'alert' : 'status'}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {toast.message}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (opts) => {
      const id = String(_nextId++)
      const kind = opts && opts.kind ? opts.kind : 'info'
      const duration = opts && typeof opts.duration === 'number' ? opts.duration : 3000
      const toast = {
        id,
        message: opts ? opts.message : '',
        kind,
      }
      setToasts((prev) => [...prev, toast])
      if (kind === 'success') haptics.success()
      else if (kind === 'warn' || kind === 'error') haptics.warn()
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    },
    [],
  )

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="sh-m-toast-host" aria-live="polite">
              {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export default ToastProvider

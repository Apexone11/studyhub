/* ═══════════════════════════════════════════════════════════════════════════
 * Toast.jsx — Toast notification container component
 *
 * Renders toast notifications dispatched via showToast() from lib/toast.js.
 * Mount once globally (e.g., in App.jsx).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { toastListeners } from '../lib/toast'

/* ── Icons ────────────────────────────────────────────────────────── */
const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sh-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sh-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sh-link)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
}

/* ── Container ────────────────────────────────────────────────────── */
export default function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  useEffect(() => {
    const timers = timersRef.current

    function handleToast(toast) {
      setToasts((prev) => [...prev.slice(-4), toast])

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        timers.delete(toast.id)
      }, toast.durationMs || 3500)

      timers.set(toast.id, timer)
    }

    toastListeners.add(handleToast)
    return () => {
      toastListeners.delete(handleToast)
      timers.forEach((t) => clearTimeout(t))
    }
  }, [])

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
  }

  if (toasts.length === 0) return null

  return (
    <div className="sh-toast-container" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`sh-toast sh-toast-${t.type}`}
          onClick={() => dismiss(t.id)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') dismiss(t.id) }}
          role="alert"
          tabIndex={0}
          aria-label={`${t.type} notification: ${t.message}. Press Escape to dismiss.`}
        >
          {ICONS[t.type] || ICONS.info}
          <span className="sh-toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OfflineIndicator.jsx — Network status banner
 *
 * Shows a non-intrusive banner when the user goes offline, and a brief
 * "Back online" confirmation when connectivity returns. Same pattern
 * used by Google Docs, Notion, Slack, and Discord.
 *
 * Mounted once globally in App.jsx alongside ToastContainer.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState, useRef } from 'react'

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    function handleOffline() {
      setIsOffline(true)
      wasOfflineRef.current = true
    }

    function handleOnline() {
      setIsOffline(false)
      // Only show "Back online" if the user was actually offline
      if (wasOfflineRef.current) {
        setShowReconnected(true)
        wasOfflineRef.current = false
        setTimeout(() => setShowReconnected(false), 3000)
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline && !showReconnected) return null

  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        padding: '0.625rem 1.25rem',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        fontFamily: 'var(--sh-font, inherit)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        animation: 'sh-offline-slide-up 0.3s ease-out',
        backgroundColor: isOffline
          ? 'var(--sh-warning-bg, #fef3c7)'
          : 'var(--sh-success-bg, #d1fae5)',
        color: isOffline
          ? 'var(--sh-warning-text, #92400e)'
          : 'var(--sh-success-text, #065f46)',
        border: isOffline
          ? '1px solid var(--sh-warning-border, #fbbf24)'
          : '1px solid var(--sh-success-border, #34d399)',
      }}
    >
      {isOffline ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          You are offline -- changes will sync when you reconnect
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Back online
        </>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Download warning shown before a user downloads an HTML file from
 * StudyHub. HTML attachments execute scripts when opened locally — the
 * server-side scanner classifies risk into tiers 0-3, but a tier-0
 * "clean" classification can still be unsafe if the user opens it in a
 * privileged browser context. This modal surfaces the threat model
 * explicitly so the user makes an informed click.
 *
 * Rendered through a portal so it works inside transformed/animated
 * containers (CLAUDE.md "Modals broken inside animated containers").
 *
 * Props:
 *   open       — controls visibility.
 *   tier       — 0-3 risk tier from the scanner; influences copy.
 *   onCancel   — close without downloading.
 *   onConfirm  — proceed with download. Caller is responsible for
 *                triggering the actual file fetch / anchor click.
 */
export default function HtmlDownloadWarningModal({ open, tier = 0, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null)

  // Escape-key dismissal — keyboard users expect this on every modal.
  // Bound at the document level so the listener fires even when focus
  // is on the page background (the user opened the modal but hasn't
  // tabbed into it yet).
  useEffect(() => {
    if (!open) return undefined
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel?.()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  // Move focus to the safe default ("Cancel") on open so a stray Enter
  // press doesn't accidentally confirm a download. Cancel is the
  // conservative choice for tier-0/1; tier-2/3 wording already warns
  // users explicitly. requestAnimationFrame waits one frame so the
  // ref is attached before we focus it.
  useEffect(() => {
    if (!open) return undefined
    const id = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open])

  if (!open) return null

  const tierCopy = describeTier(tier)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="html-download-warning-title"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--sh-modal-overlay)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 14,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          display: 'grid',
          gap: 16,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h3
          id="html-download-warning-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--sh-heading)',
          }}
        >
          {tierCopy.title}
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--sh-text)', lineHeight: 1.6 }}>
          {tierCopy.body}
        </p>
        <ul
          style={{
            margin: 0,
            padding: '0 0 0 20px',
            fontSize: 13,
            color: 'var(--sh-subtext)',
            lineHeight: 1.6,
          }}
        >
          <li>HTML files can run scripts when opened locally.</li>
          <li>StudyHub already scanned the file, but no scanner is perfect.</li>
          <li>
            Open the file in a sandbox or virtual machine if you do not fully trust the author.
          </li>
        </ul>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            ref={cancelButtonRef}
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--sh-btn-secondary-border)',
              background: 'var(--sh-btn-secondary-bg)',
              color: 'var(--sh-btn-secondary-text)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: tier >= 2 ? 'var(--sh-danger)' : 'var(--sh-brand)',
              color: 'var(--sh-btn-primary-text)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {tierCopy.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function describeTier(tier) {
  if (tier >= 3) {
    return {
      title: 'This file was quarantined',
      body: 'StudyHub blocked this file because the security scanner flagged critical patterns (credential capture, coordinated obfuscation, or AV-detected malware). Downloading is strongly discouraged.',
      confirmLabel: 'Download anyway',
    }
  }
  if (tier === 2) {
    return {
      title: 'High-risk download',
      body: 'The scanner detected behavioral patterns associated with malicious content (obfuscation, redirects, or data exfiltration). An admin reviewed and approved publication, but you should still review before opening.',
      confirmLabel: 'Download anyway',
    }
  }
  if (tier === 1) {
    return {
      title: 'Advanced HTML inside',
      body: 'This file contains advanced HTML features (scripts, iframes, or inline event handlers). It looks normal, but please review it before opening locally.',
      confirmLabel: 'Download',
    }
  }
  return {
    title: 'Download this HTML file?',
    body: 'HTML files can run code when you open them. The scanner did not flag anything, but please open the file in a sandbox if you do not trust the source.',
    confirmLabel: 'Download',
  }
}

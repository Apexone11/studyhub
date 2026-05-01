import FocusTrappedDialog from './Modal/FocusTrappedDialog'

/**
 * Download warning shown before a user downloads an HTML file from
 * StudyHub. HTML attachments execute scripts when opened locally — the
 * server-side scanner classifies risk into tiers 0-3, but a tier-0
 * "clean" classification can still be unsafe if the user opens it in a
 * privileged browser context. This modal surfaces the threat model
 * explicitly so the user makes an informed click.
 *
 * Built on FocusTrappedDialog (`components/Modal/FocusTrappedDialog`)
 * so Tab/Shift+Tab cycle stays inside, Escape closes, and focus
 * restores to the trigger button on close — full W3C ARIA modal
 * dialog pattern compliance.
 *
 * Initial focus lands on the Cancel button via the
 * `data-autofocus` attribute. This is the conservative choice: a
 * stray Enter press cancels rather than confirms a download, and
 * tier-2/3 messages already warn the user explicitly.
 *
 * Props:
 *   open       — controls visibility.
 *   tier       — 0-3 risk tier from the scanner; influences copy.
 *   onCancel   — close without downloading.
 *   onConfirm  — proceed with download. Caller is responsible for
 *                triggering the actual file fetch / anchor click.
 */
export default function HtmlDownloadWarningModal({ open, tier = 0, onCancel, onConfirm }) {
  const tierCopy = describeTier(tier)

  return (
    <FocusTrappedDialog
      open={open}
      onClose={onCancel}
      ariaLabelledBy="html-download-warning-title"
      initialFocusSelector="[data-autofocus='html-download-warning']"
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
        <li>Open the file in a sandbox or virtual machine if you do not fully trust the author.</li>
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
          data-autofocus="html-download-warning"
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
    </FocusTrappedDialog>
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

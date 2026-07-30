/**
 * AttachmentDownloadPicker.jsx — choose which of a post's attachments to
 * download. One file streams straight from its own download route; two or
 * more are bundled server-side into a zip.
 */
import { useCallback, useId, useMemo, useState } from 'react'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { authHeaders } from '../shared/pageUtils'
import FocusTrappedDialog from '../../components/Modal/FocusTrappedDialog'
import { attachmentUrlsFor } from './feedHelpers'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function triggerBrowserDownload(href, filename) {
  const link = document.createElement('a')
  link.href = href
  if (filename) link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export default function AttachmentDownloadPicker({ postId, attachments = [], onClose }) {
  const titleId = useId()
  const [selectedIds, setSelectedIds] = useState(() => attachments.map((a) => a.id))
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => attachments.filter((a) => selectedIds.includes(a.id)),
    [attachments, selectedIds],
  )
  const totalBytes = selected.reduce((sum, a) => sum + (a.sizeBytes || 0), 0)
  const allSelected = selected.length === attachments.length && attachments.length > 0

  const toggle = useCallback((id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((current) =>
      current.length === attachments.length ? [] : attachments.map((a) => a.id),
    )
  }, [attachments])

  const handleDownload = useCallback(async () => {
    if (selected.length === 0 || busy) return

    if (selected.length === 1) {
      const { downloadUrl } = attachmentUrlsFor(postId, selected[0])
      triggerBrowserDownload(downloadUrl, selected[0].name)
      onClose?.()
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`${API}/api/feed/posts/${postId}/attachments/zip`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ attachmentIds: selected.map((a) => a.id) }),
      })
      if (!res.ok) {
        let message = 'Could not build that bundle.'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        throw new Error(message)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      triggerBrowserDownload(objectUrl, `post-${postId}-attachments.zip`)
      // Revoking synchronously races the browser's download handling —
      // Firefox in particular can cancel a download whose blob URL is
      // already gone. One tick later is enough for the click to be picked up.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      onClose?.()
    } catch (err) {
      showToast(err?.message || 'Could not build that bundle.', 'error')
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, postId, selected])

  return (
    <FocusTrappedDialog
      open
      onClose={onClose}
      ariaLabelledBy={titleId}
      mobileLayout="auto"
      panelStyle={{
        width: 'min(460px, 100%)',
        maxWidth: 'min(460px, 100%)',
        maxHeight: '85vh',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--sh-border)',
        }}
      >
        <h2
          id={titleId}
          style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--sh-text)' }}
        >
          Download attachments
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sh-subtext)' }}>
          Pick the files you want. Two or more arrive as a zip.
        </p>
      </header>

      <div style={{ overflowY: 'auto', padding: '10px 14px', flex: 1 }}>
        <button
          type="button"
          onClick={toggleAll}
          style={{
            border: 'none',
            background: 'none',
            padding: '6px 8px',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--sh-brand)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {attachments.map((attachment) => {
            const size = formatBytes(attachment.sizeBytes)
            return (
              <li key={attachment.id}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 8px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(attachment.id)}
                    onChange={() => toggle(attachment.id)}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      color: 'var(--sh-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={attachment.name}
                  >
                    {attachment.name}
                  </span>
                  {size && <span style={{ fontSize: 12, color: 'var(--sh-subtext)' }}>{size}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 22px',
          borderTop: '1px solid var(--sh-border)',
        }}
      >
        <span style={{ flex: 1, fontSize: 12, color: 'var(--sh-subtext)' }}>
          {selected.length} file{selected.length === 1 ? '' : 's'}
          {totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-text)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy || selected.length === 0}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--sh-brand)',
            color: 'var(--sh-on-brand, #fff)',
            fontSize: 13,
            fontWeight: 700,
            cursor: busy || selected.length === 0 ? 'not-allowed' : 'pointer',
            opacity: busy || selected.length === 0 ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Preparing…' : 'Download'}
        </button>
      </footer>
    </FocusTrappedDialog>
  )
}

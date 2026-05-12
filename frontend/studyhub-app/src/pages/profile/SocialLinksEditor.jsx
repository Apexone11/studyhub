/* ═══════════════════════════════════════════════════════════════════════════
 * SocialLinksEditor.jsx — Inline editor for up to 4 social links (own only)
 *
 * UX:
 *   • "Add a link" button reveals a row with Label + URL inputs
 *   • Up to MAX_PROFILE_SOCIAL_LINKS rows
 *   • Inline https-only validation; invalid URLs blocked at save
 *   • Per-row remove button
 *   • Save / Cancel for the whole set (avoids surprise auto-saves)
 *   • Optimistic UI WITH server confirmation per CLAUDE.md A4
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { authHeaders } from './profileConstants'
import {
  MAX_PROFILE_SOCIAL_LINKS,
  MAX_LINK_LABEL_LENGTH,
  MAX_LINK_URL_LENGTH,
  classifyLinkUrl,
} from './socialLinks'

function normalizeList(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((l) => l && typeof l === 'object')
    .slice(0, MAX_PROFILE_SOCIAL_LINKS)
    .map((l) => ({ label: l.label || '', url: l.url || '' }))
}

function linksKey(list) {
  // Cheap stable identity for comparing initialLinks across renders.
  return Array.isArray(list) ? list.map((l) => `${l?.label || ''}::${l?.url || ''}`).join('|') : ''
}

export default function SocialLinksEditor({ initialLinks, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [links, setLinks] = useState(() => normalizeList(initialLinks))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  // React 19 "Storing information from previous renders" pattern. We track
  // the prop key as state so a prop change reset is detected at render
  // time without violating react-hooks/refs or set-state-in-effect rules.
  const [lastSyncedKey, setLastSyncedKey] = useState(() => linksKey(initialLinks))
  const incomingKey = linksKey(initialLinks)
  if (!editing && incomingKey !== lastSyncedKey) {
    setLastSyncedKey(incomingKey)
    setLinks(normalizeList(initialLinks))
    setErrors({})
  }

  function updateRow(index, field, value) {
    setLinks((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    if (errors[index]) setErrors((prev) => ({ ...prev, [index]: undefined }))
  }

  function addRow() {
    setLinks((prev) =>
      prev.length >= MAX_PROFILE_SOCIAL_LINKS ? prev : [...prev, { label: '', url: '' }],
    )
  }

  function removeRow(index) {
    setLinks((prev) => prev.filter((_, i) => i !== index))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  function validateForSubmit() {
    const nextErrors = {}
    const cleaned = []
    links.forEach((row, index) => {
      const label = (row.label || '').trim()
      const url = (row.url || '').trim()
      if (!label && !url) return // skip empty rows entirely
      if (!label) {
        nextErrors[index] = 'Add a label (e.g. "GitHub").'
        return
      }
      if (!url) {
        nextErrors[index] = 'Add a URL.'
        return
      }
      if (label.length > MAX_LINK_LABEL_LENGTH) {
        nextErrors[index] = `Label must be ≤ ${MAX_LINK_LABEL_LENGTH} characters.`
        return
      }
      if (url.length > MAX_LINK_URL_LENGTH) {
        nextErrors[index] = `URL must be ≤ ${MAX_LINK_URL_LENGTH} characters.`
        return
      }
      if (!classifyLinkUrl(url)) {
        nextErrors[index] = 'Use an https:// URL.'
        return
      }
      cleaned.push({ label, url })
    })
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0 ? cleaned : null
  }

  async function commit() {
    const requested = validateForSubmit()
    if (requested === null) return

    setSaving(true)
    try {
      const res = await fetch(`${API}/api/settings/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ profileLinks: requested }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error || 'Could not save social links.', 'error')
        return
      }
      // CLAUDE.md A4: hydrate from server response — fall back to `requested`
      // only when the server did not echo an array.
      const persisted = Array.isArray(data?.user?.profileLinks) ? data.user.profileLinks : requested
      const persistedList = normalizeList(persisted)
      setLinks(persistedList)
      setLastSyncedKey(linksKey(persistedList))
      onSaved?.(persisted)
      setEditing(false)
      showToast('Social links updated.', 'success')
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setLinks(normalizeList(initialLinks))
    setErrors({})
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="profile-bio-edit-trigger"
        data-testid="social-links-edit-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px dashed rgba(255,255,255,0.4)',
          background: 'rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {links.length > 0 ? 'Edit links' : 'Add social links'}
      </button>
    )
  }

  return (
    <div
      style={{
        maxWidth: 560,
        marginBottom: 14,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 10,
        padding: 12,
        backdropFilter: 'blur(6px)',
      }}
      data-testid="social-links-editor"
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.86)',
          marginBottom: 8,
        }}
      >
        Social links ({links.length}/{MAX_PROFILE_SOCIAL_LINKS})
      </div>

      {links.length === 0 && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
          Add up to {MAX_PROFILE_SOCIAL_LINKS} https links — your site, GitHub, LinkedIn, etc.
        </div>
      )}

      {links.map((link, index) => (
        <div key={index} style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 130px) minmax(0, 1fr) auto',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={link.label}
              maxLength={MAX_LINK_LABEL_LENGTH}
              placeholder="GitHub"
              disabled={saving}
              onChange={(event) => updateRow(index, 'label', event.target.value)}
              aria-label={`Label for link ${index + 1}`}
              style={inputStyle}
            />
            <input
              type="url"
              value={link.url}
              maxLength={MAX_LINK_URL_LENGTH}
              placeholder="https://github.com/yourhandle"
              disabled={saving}
              onChange={(event) => updateRow(index, 'url', event.target.value)}
              aria-label={`URL for link ${index + 1}`}
              aria-invalid={errors[index] ? 'true' : 'false'}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              disabled={saving}
              aria-label={`Remove link ${index + 1}`}
              style={removeBtnStyle}
            >
              ×
            </button>
          </div>
          {errors[index] && (
            <div
              role="alert"
              style={{ fontSize: 11, color: 'var(--sh-danger-text)', marginTop: 4 }}
            >
              {errors[index]}
            </div>
          )}
        </div>
      ))}

      {links.length < MAX_PROFILE_SOCIAL_LINKS && (
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px dashed rgba(255,255,255,0.4)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: 10,
          }}
        >
          + Add link
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--sh-brand)',
            color: 'var(--sh-nav-text)',
            fontSize: 12,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save links'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.18)',
  color: 'var(--sh-nav-text)',
  fontFamily: 'inherit',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none',
}

const removeBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

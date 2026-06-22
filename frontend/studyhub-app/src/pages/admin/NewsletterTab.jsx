/* ═══════════════════════════════════════════════════════════════════════════
 * NewsletterTab.jsx — Admin compose/manage for the Product Updates newsletter
 *
 * Self-contained, lazy-loaded like RevenueTab. Lists every issue (status,
 * visibility, send stats, dates) and provides a composer to create/edit drafts
 * plus per-issue actions: Publish, Unpublish, Send email (confirm-gated since
 * it emails users), and Delete (confirm-gated).
 *
 * CLAUDE.md A4 — every write hydrates local state from the RESPONSE body, never
 * a blind optimistic toggle. Errors surface via showToast.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Skeleton } from '../../components/Skeleton'
import {
  FONT,
  formatDateTime,
  inputStyle,
  primaryButton,
  tableHeadStyle,
  tableCell,
} from './adminConstants'

const SECTION = {
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  padding: '22px',
}

const CATEGORIES = ['feature', 'bugfix', 'announcement', 'improvement']
const CATEGORY_LABELS = {
  feature: 'Feature',
  bugfix: 'Bug fix',
  announcement: 'Announcement',
  improvement: 'Improvement',
}

const EMPTY_FORM = {
  title: '',
  summary: '',
  bodyHtml: '',
  category: 'feature',
  isPublic: true,
}

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function StatusPill({ status }) {
  const published = status === 'published'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: published ? 'var(--sh-success-bg)' : 'var(--sh-soft)',
        border: `1px solid ${published ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
        color: published ? 'var(--sh-success-text)' : 'var(--sh-muted)',
      }}
    >
      {status}
    </span>
  )
}

function rowButton(tone = 'default') {
  const palette = {
    default: { bg: 'var(--sh-surface)', border: 'var(--sh-border)', color: 'var(--sh-slate-600)' },
    brand: { bg: 'var(--sh-brand)', border: 'var(--sh-brand)', color: '#fff' },
    danger: {
      bg: 'var(--sh-danger-bg)',
      border: 'var(--sh-danger-border)',
      color: 'var(--sh-danger-text)',
    },
  }
  const p = palette[tone] || palette.default
  return {
    padding: '5px 11px',
    borderRadius: 8,
    border: `1px solid ${p.border}`,
    background: p.bg,
    color: p.color,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
    whiteSpace: 'nowrap',
  }
}

export default function NewsletterTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  // Send-email confirmation is gated through ConfirmDialog because it
  // dispatches mail to real users — an accidental click is unrecoverable.
  const [confirm, setConfirm] = useState(null)

  // `load` does the network round-trip without flipping `setLoading` first,
  // so calling it inside the mount effect doesn't trip
  // react-hooks/set-state-in-effect (cascading-render warning). The initial
  // skeleton is driven by the `loading` initial state; the effect just
  // resolves it. Manual re-fetches (after a queued send) reuse the same fn.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/newsletter/admin?page=1&limit=50`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load issues.')
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
      setLoadError('')
    } catch (err) {
      setLoadError(err.message || 'Failed to load issues.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch(`${API}/api/newsletter/admin?page=1&limit=50`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load issues.')
        return res.json()
      })
      .then((data) => {
        if (active) setItems(Array.isArray(data.items) ? data.items : [])
      })
      .catch((err) => {
        if (active) setLoadError(err.message || 'Failed to load issues.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  function startEdit(issue) {
    setEditingId(issue.id)
    setForm({
      title: issue.title || '',
      summary: issue.summary || '',
      bodyHtml: issue.bodyHtml || '',
      category: CATEGORIES.includes(issue.category) ? issue.category : 'feature',
      isPublic: issue.isPublic !== false,
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Merge an issue returned from a write into local state by id. */
  function upsertIssue(issue) {
    if (!issue || issue.id == null) return
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === issue.id)
      if (idx === -1) return [issue, ...prev]
      const next = prev.slice()
      next[idx] = { ...next[idx], ...issue }
      return next
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.bodyHtml.trim()) {
      showToast('Title and body are required.', 'error')
      return
    }
    setSaving(true)
    try {
      const url = editingId ? `${API}/api/newsletter/${editingId}` : `${API}/api/newsletter`
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          bodyHtml: form.bodyHtml,
          category: form.category,
          isPublic: form.isPublic,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error || 'Could not save the issue.', 'error')
        return
      }
      // A4 — hydrate from the persisted issue, not the requested form values.
      upsertIssue(data)
      showToast(editingId ? 'Issue updated.' : 'Draft created.', 'success')
      resetForm()
    } catch {
      showToast('Could not connect to the server.', 'error')
    } finally {
      setSaving(false)
    }
  }

  /** Shared handler for publish / unpublish / send POST actions. */
  async function runAction(id, action, { successText }) {
    setBusyId(id)
    try {
      const res = await fetch(`${API}/api/newsletter/${id}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error || 'Action failed.', 'error')
        return
      }
      // publish/unpublish echo the updated issue; send returns { queued: true }.
      if (data && data.id != null) {
        upsertIssue(data)
      } else {
        // Re-fetch so emailSentAt / recipient counts reflect the queued send.
        await load()
      }
      showToast(successText, 'success')
    } catch {
      showToast('Could not connect to the server.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id) {
    setBusyId(id)
    try {
      const res = await fetch(`${API}/api/newsletter/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error || 'Could not delete the issue.', 'error')
        return
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
      if (editingId === id) resetForm()
      showToast('Issue deleted.', 'success')
    } catch {
      showToast('Could not connect to the server.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  function confirmSend(issue) {
    setConfirm({
      title: 'Send this issue by email?',
      message: `This emails "${issue.title}" to every subscriber. This cannot be undone.`,
      confirmLabel: 'Send email',
      onConfirm: () => {
        setConfirm(null)
        void runAction(issue.id, 'send', { successText: 'Email send queued.' })
      },
    })
  }

  function confirmDelete(issue) {
    setConfirm({
      title: 'Delete this issue?',
      message: `"${issue.title}" will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        setConfirm(null)
        void handleDelete(issue.id)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Composer ─────────────────────────────────────────────────── */}
      <section style={SECTION}>
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: FONT,
          }}
        >
          {editingId ? 'Edit issue' : 'New issue'}
        </h3>
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What shipped this week"
              maxLength={200}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Summary</span>
            <input
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="One-line teaser shown on the archive list"
              maxLength={300}
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, minWidth: 180 }}>
              <span style={labelStyle}>Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                alignSelf: 'flex-end',
                fontSize: 13,
                color: 'var(--sh-slate-600)',
                paddingBottom: 11,
              }}
            >
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--sh-brand)' }}
              />
              Visible in the public archive
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Body (HTML)</span>
            <textarea
              value={form.bodyHtml}
              onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
              placeholder="<p>The full update body. Rendered as sanitized HTML.</p>"
              rows={10}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="submit"
              disabled={saving}
              style={{ ...primaryButton, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create draft'}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} style={rowButton('default')}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* ── Issue list ───────────────────────────────────────────────── */}
      <section style={SECTION}>
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            fontFamily: FONT,
          }}
        >
          All issues
        </h3>

        {loading ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={40} borderRadius={8} />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" style={errorBox}>
            {loadError}
          </div>
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>
            No issues yet. Create your first draft above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}
            >
              <thead>
                <tr>
                  <th style={tableHeadStyle}>Title</th>
                  <th style={tableHeadStyle}>Category</th>
                  <th style={tableHeadStyle}>Status</th>
                  <th style={tableHeadStyle}>Public</th>
                  <th style={tableHeadStyle}>Email</th>
                  <th style={tableHeadStyle}>Updated</th>
                  <th style={tableHeadStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((issue) => {
                  const busy = busyId === issue.id
                  const isPublished = issue.status === 'published'
                  return (
                    <tr key={issue.id}>
                      <td style={{ ...tableCell, fontWeight: 700, color: 'var(--sh-heading)' }}>
                        {issue.title}
                      </td>
                      <td style={tableCell}>{CATEGORY_LABELS[issue.category] || issue.category}</td>
                      <td style={tableCell}>
                        <StatusPill status={issue.status} />
                      </td>
                      <td style={tableCell}>{issue.isPublic ? 'Yes' : 'No'}</td>
                      <td style={{ ...tableCell, whiteSpace: 'nowrap' }}>
                        {issue.emailSentAt ? (
                          <span title={formatDateTime(issue.emailSentAt)}>
                            Sent · {issue.emailRecipientCount ?? 0}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--sh-slate-400)' }}>Not sent</span>
                        )}
                      </td>
                      <td style={{ ...tableCell, whiteSpace: 'nowrap' }}>
                        {formatDateTime(issue.updatedAt || issue.createdAt)}
                      </td>
                      <td style={tableCell}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => startEdit(issue)}
                            disabled={busy}
                            style={rowButton('default')}
                          >
                            Edit
                          </button>
                          {isPublished ? (
                            <button
                              type="button"
                              onClick={() =>
                                runAction(issue.id, 'unpublish', {
                                  successText: 'Issue unpublished.',
                                })
                              }
                              disabled={busy}
                              style={rowButton('default')}
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                runAction(issue.id, 'publish', { successText: 'Issue published.' })
                              }
                              disabled={busy}
                              style={rowButton('brand')}
                            >
                              Publish
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => confirmSend(issue)}
                            disabled={busy}
                            style={rowButton('default')}
                          >
                            Send email
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete(issue)}
                            disabled={busy}
                            style={rowButton('danger')}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel || 'Confirm'}
        cancelLabel="Cancel"
        variant={confirm?.variant || 'default'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--sh-slate-600)',
  fontFamily: FONT,
}

const errorBox = {
  background: 'var(--sh-danger-bg)',
  border: '1px solid var(--sh-danger-border)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--sh-danger-text)',
}

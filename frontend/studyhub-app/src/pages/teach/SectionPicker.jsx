/**
 * SectionPicker.jsx — modal for the Week 3 bulk-assign flow.
 *
 * Consumer passes the selected sheet IDs; this component handles the two-step
 * server interaction:
 *   1) POST /api/materials for every sheet (one Material wrapper per sheet)
 *   2) POST /api/materials/assign with the resulting material IDs + sectionIds
 *
 * Fetches the teacher's sections on open. If the teacher has zero sections,
 * shows an inline "create your first section" form so the flow can continue
 * without navigating away. Uses createPortal to escape any animated ancestor.
 *
 * Gated by the `design_v2_teach_sections` flag at the caller.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

const MAX_INSTRUCTIONS = 2000
const MAX_TITLE = 200

async function fetchSections() {
  const res = await fetch(`${API}/api/sections`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('fetch_sections_failed')
  const data = await res.json()
  return Array.isArray(data?.sections) ? data.sections : []
}

async function createSectionCall(name) {
  const res = await fetch(`${API}/api/sections`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || 'create_section_failed')
  }
  const data = await res.json()
  return data?.section
}

async function createMaterialForSheet({ sheetId, title, instructions }) {
  const res = await fetch(`${API}/api/materials`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      sheetId,
      title: title.slice(0, MAX_TITLE),
      instructions: (instructions || '').slice(0, MAX_INSTRUCTIONS),
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || 'create_material_failed')
  }
  const data = await res.json()
  return data?.material
}

async function assignCall({ materialIds, sectionIds, dueAt }) {
  const res = await fetch(`${API}/api/materials/assign`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      materialIds,
      sectionIds,
      dueAt: dueAt || null,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || 'assign_failed')
  }
  return res.json()
}

export default function SectionPicker({
  open,
  sheets, // array of { id, title }
  onClose,
  onAssigned,
}) {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedSectionIds, setSelectedSectionIds] = useState(new Set())
  const [dueAt, setDueAt] = useState('')
  const [instructions, setInstructions] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const sheetIds = useMemo(() => (Array.isArray(sheets) ? sheets.map((s) => s.id) : []), [sheets])

  const loadSections = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchSections()
      .then((rows) => {
        setSections(rows)
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load your sections.')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedSectionIds(new Set())
    setDueAt('')
    setInstructions('')
    setNewSectionName('')
    setResult(null)
    loadSections()
  }, [open, loadSections])

  if (!open) return null

  const toggleSection = (id) => {
    setSelectedSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit =
    !submitting && sheetIds.length > 0 && selectedSectionIds.size > 0 && sections.length > 0

  const handleCreateSection = async (e) => {
    e.preventDefault()
    const trimmed = newSectionName.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const created = await createSectionCall(trimmed)
      if (created) {
        setSections((prev) => [created, ...prev])
        setSelectedSectionIds((prev) => new Set(prev).add(created.id))
        setNewSectionName('')
      }
    } catch (err) {
      setError(err.message || 'Could not create section.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAssign = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // Step 1: wrap each sheet as a Material. We do this serially so an
      // error on sheet N doesn't leave a half-created state we can't reason
      // about — the count of created materials matches the progress.
      const createdMaterialIds = []
      for (const sheet of sheets) {
        const material = await createMaterialForSheet({
          sheetId: sheet.id,
          title: sheet.title || 'Untitled material',
          instructions,
        })
        if (material?.id) createdMaterialIds.push(material.id)
      }

      if (createdMaterialIds.length === 0) {
        throw new Error('No materials were created.')
      }

      // Step 2: bulk assign.
      const assignResult = await assignCall({
        materialIds: createdMaterialIds,
        sectionIds: Array.from(selectedSectionIds),
        dueAt,
      })

      setResult({
        created: assignResult?.created ?? 0,
        skipped: Array.isArray(assignResult?.skipped) ? assignResult.skipped.length : 0,
        sectionCount: selectedSectionIds.size,
      })
      if (typeof onAssigned === 'function') onAssigned(assignResult)
    } catch (err) {
      setError(err.message || 'Could not assign materials.')
    } finally {
      setSubmitting(false)
    }
  }

  const styles = sectionPickerStyles

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign materials to sections"
      style={styles.overlay}
      onClick={submitting ? undefined : onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="sh-card" style={styles.card}>
        <header style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.eyebrow}>Step 1 of 1</div>
            <h2 style={styles.title}>Assign to sections</h2>
            <p style={styles.subtitle}>
              {sheets.length} {sheets.length === 1 ? 'item' : 'items'} will be wrapped as materials
              and pushed to the sections you pick.
            </p>
          </div>
          <button
            type="button"
            onClick={submitting ? undefined : onClose}
            className="sh-press sh-focus-ring"
            style={styles.closeBtn}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        {result ? (
          <div style={styles.resultPanel}>
            <h3 style={styles.resultTitle}>
              Assigned {result.created} {result.created === 1 ? 'material' : 'materials'}.
            </h3>
            <p style={styles.resultBody}>
              Pushed to {result.sectionCount} {result.sectionCount === 1 ? 'section' : 'sections'}.
              {result.skipped > 0
                ? ` ${result.skipped} pair${result.skipped === 1 ? ' was' : 's were'} skipped (already assigned or not owned).`
                : ''}
            </p>
            <div style={styles.resultActions}>
              <button
                type="button"
                onClick={onClose}
                className="sh-press sh-focus-ring"
                style={styles.primaryBtn}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Sections</h3>
              {loading ? (
                <p style={styles.muted}>Loading sections…</p>
              ) : sections.length === 0 ? (
                <form onSubmit={handleCreateSection} style={styles.createForm}>
                  <p style={styles.muted}>
                    You have no sections yet. Name your first one to continue.
                  </p>
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="Period 3, Block B, Cohort 24…"
                    maxLength={120}
                    style={styles.input}
                  />
                  <button
                    type="submit"
                    disabled={!newSectionName.trim() || submitting}
                    className="sh-press sh-focus-ring"
                    style={styles.primaryBtn}
                  >
                    {submitting ? 'Creating…' : 'Create section'}
                  </button>
                </form>
              ) : (
                <ul style={styles.list}>
                  {sections.map((s) => {
                    const checked = selectedSectionIds.has(s.id)
                    return (
                      <li key={s.id} style={styles.row}>
                        <label
                          style={{
                            ...styles.rowLabel,
                            ...(checked ? styles.rowChecked : null),
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSection(s.id)}
                            style={{ marginRight: 10 }}
                          />
                          <span style={styles.rowName}>{s.name}</span>
                          {s._count ? (
                            <span style={styles.rowMeta}>{s._count.enrollments || 0} students</span>
                          ) : null}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Details</h3>
              <label style={styles.fieldLabel}>
                Due date (optional)
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldLabel}>
                Instructions shown to students (optional)
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                  placeholder="What should students do with this?"
                  rows={3}
                  style={{ ...styles.input, resize: 'vertical' }}
                />
                <span style={styles.counter}>
                  {instructions.length} / {MAX_INSTRUCTIONS}
                </span>
              </label>
            </section>

            {error ? (
              <div role="alert" style={styles.errorPanel}>
                {error}
              </div>
            ) : null}

            <footer style={styles.footer}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="sh-press sh-focus-ring"
                style={styles.secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!canSubmit}
                className="sh-press sh-focus-ring"
                style={{
                  ...styles.primaryBtn,
                  opacity: canSubmit ? 1 : 0.6,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting
                  ? 'Assigning…'
                  : `Assign ${sheets.length} ${sheets.length === 1 ? 'item' : 'items'}`}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

const sectionPickerStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 10, 20, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    padding: '22px 24px',
    display: 'grid',
    gap: 18,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--sh-muted)',
    marginBottom: 6,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--sh-heading)',
  },
  subtitle: {
    margin: '6px 0 0 0',
    fontSize: 13,
    color: 'var(--sh-muted)',
    lineHeight: 1.5,
  },
  closeBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  section: {
    display: 'grid',
    gap: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: 'var(--sh-heading)',
    letterSpacing: '-0.01em',
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: 'var(--sh-muted)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 6,
  },
  row: { margin: 0 },
  rowLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-soft)',
    cursor: 'pointer',
  },
  rowChecked: {
    background: 'var(--sh-info-bg)',
    borderColor: 'var(--sh-info-border)',
  },
  rowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sh-heading)',
  },
  rowMeta: {
    fontSize: 11,
    color: 'var(--sh-muted)',
  },
  fieldLabel: {
    display: 'grid',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--sh-muted)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  counter: {
    fontSize: 11,
    color: 'var(--sh-muted)',
    textAlign: 'right',
  },
  createForm: {
    display: 'grid',
    gap: 10,
  },
  errorPanel: {
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    background: 'var(--sh-danger-bg)',
    border: '1px solid var(--sh-danger-border)',
    color: 'var(--sh-danger-text)',
    fontSize: 13,
  },
  footer: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--sh-border)',
    paddingTop: 14,
  },
  primaryBtn: {
    padding: '10px 16px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-accent, #2563eb)',
    border: '1px solid transparent',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 16px',
    borderRadius: 'var(--radius-control)',
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  resultPanel: {
    display: 'grid',
    gap: 10,
    padding: '18px 20px',
    background: 'var(--sh-success-bg)',
    border: '1px solid var(--sh-success-border)',
    borderRadius: 'var(--radius)',
  },
  resultTitle: {
    margin: 0,
    fontSize: 16,
    color: 'var(--sh-success-text)',
  },
  resultBody: {
    margin: 0,
    fontSize: 13,
    color: 'var(--sh-success-text)',
    lineHeight: 1.5,
  },
  resultActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
}

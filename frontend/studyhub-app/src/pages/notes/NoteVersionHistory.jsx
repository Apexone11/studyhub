/* ═══════════════════════════════════════════════════════════════════════════
 * NoteVersionHistory.jsx — Version history slide-out panel for notes
 *
 * Shows all saved versions of a note with dates, messages, restore/view actions.
 * Renders as a fixed right-side panel using createPortal to work inside
 * animated containers.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils.js'
import { showToast } from '../../lib/toast'
import NoteVersionDiff from './NoteVersionDiff.jsx'

const PAGE_FONT = 'Plus Jakarta Sans, sans-serif'

const KIND_META = {
  MANUAL: { label: 'Manual', bg: 'var(--sh-success-bg)', fg: 'var(--sh-success-text)' },
  AUTO: { label: 'Auto', bg: 'var(--sh-soft)', fg: 'var(--sh-slate-700)' },
  PRE_RESTORE: {
    label: 'Before restore',
    bg: 'var(--sh-warning-bg)',
    fg: 'var(--sh-warning-text)',
  },
  CONFLICT_LOSER: {
    label: 'Conflict loser',
    bg: 'var(--sh-danger-bg)',
    fg: 'var(--sh-danger-text)',
  },
}

const KIND_FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'manual', label: 'Manual', match: (v) => v.kind === 'MANUAL' },
  { key: 'auto', label: 'Auto', match: (v) => v.kind === 'AUTO' },
  {
    key: 'system',
    label: 'System',
    match: (v) => v.kind === 'PRE_RESTORE' || v.kind === 'CONFLICT_LOSER',
  },
]

const FILTER_STORAGE_KEY = 'studyhub.noteVersionFilter'

function KindPill({ kind }) {
  const meta = KIND_META[kind] ?? KIND_META.AUTO
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontWeight: 600,
        fontFamily: PAGE_FONT,
      }}
    >
      {meta.label}
    </span>
  )
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n ?? 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatVersionDate(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return (
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' · ' +
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  )
}

function VersionItem({ version, onViewDiff, onRestore }) {
  return (
    <div
      data-testid="note-version-row"
      style={{
        borderBottom: '1px solid var(--sh-border)',
        padding: 'var(--space-4) 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
          >
            <KindPill kind={version.kind ?? 'AUTO'} />
            <span
              style={{
                fontSize: 'var(--type-sm)',
                fontWeight: 600,
                color: 'var(--sh-heading)',
              }}
            >
              {formatVersionDate(version.createdAt)}
            </span>
            {version.revision != null && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--sh-slate-600)',
                }}
              >
                r{version.revision}
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                color: 'var(--sh-slate-600)',
              }}
            >
              {formatBytes(version.bytesContent ?? 0)}
            </span>
          </div>
          {version.kind === 'MANUAL' && version.message && (
            <div
              style={{
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-text)',
                marginBottom: 'var(--space-2)',
              }}
            >
              {version.message}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => onViewDiff(version.id)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)',
              color: 'var(--sh-text)',
              fontSize: 'var(--type-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            View diff
          </button>
          <button
            type="button"
            data-testid="note-version-restore"
            onClick={() => onRestore(version.id)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--sh-brand)',
              background: 'var(--sh-brand)',
              color: 'white',
              fontSize: 'var(--type-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
            }}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NoteVersionHistory({ noteId, onRestore, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)
  const [diffVersionId, setDiffVersionId] = useState(null)
  const [filterKey, setFilterKey] = useState(() => {
    if (typeof window === 'undefined') return 'all'
    try {
      return window.localStorage?.getItem(FILTER_STORAGE_KEY) ?? 'all'
    } catch {
      return 'all'
    }
  })

  useEffect(() => {
    try {
      window.localStorage?.setItem(FILTER_STORAGE_KEY, filterKey)
    } catch {
      /* ignore */
    }
  }, [filterKey])

  // Fetch versions on mount
  useEffect(() => {
    async function fetchVersions() {
      if (!noteId) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API}/api/notes/${noteId}/versions`, {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to fetch versions')
        }

        const data = await response.json()
        setVersions(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error fetching versions:', error)
        showToast('Failed to load version history', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [noteId])

  // Handle escape key to close panel
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [onClose])

  async function handleSaveVersion() {
    if (!noteId) return
    setSavingVersion(true)

    try {
      const response = await fetch(`${API}/api/notes/${noteId}/versions`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: saveMessage.trim() || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save version')
      }

      const newVersion = await response.json()
      setVersions([newVersion, ...versions])
      setSaveMessage('')
      showToast('Version saved successfully', 'success')
    } catch (error) {
      console.error('Error saving version:', error)
      showToast('Failed to save version', 'error')
    } finally {
      setSavingVersion(false)
    }
  }

  async function handleRestore(versionId) {
    if (!noteId) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Restore this version? Your current note will be saved as a new version first, so nothing is lost.',
      )
    )
      return

    try {
      const response = await fetch(`${API}/api/notes/${noteId}/versions/${versionId}/restore`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (!response.ok) {
        showToast('Restore failed', 'error')
        return
      }

      const body = await response.json()
      const restoredNote = body?.note ?? body
      if (typeof onRestore === 'function') onRestore(restoredNote)
      showToast('Note restored successfully', 'success')
    } catch (error) {
      console.error('Error restoring version:', error)
      showToast('Restore failed (network)', 'error')
    }
  }

  const filterFn = KIND_FILTERS.find((f) => f.key === filterKey)?.match ?? (() => true)
  const visibleVersions = (versions ?? []).filter(filterFn)

  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(3px)',
          zIndex: 999,
          animation: 'fadeIn 150ms ease-out',
        }}
      />

      {/* Slide-out panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '380px',
          height: '100vh',
          background: 'var(--sh-surface)',
          boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.12)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-6)',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--type-md)',
              fontWeight: 700,
              color: 'var(--sh-heading)',
              fontFamily: PAGE_FONT,
            }}
          >
            Version History
          </h2>
          <button
            onClick={onClose}
            aria-label="Close version history"
            style={{
              border: 'none',
              background: 'none',
              fontSize: 20,
              color: 'var(--sh-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              lineHeight: 1,
              fontFamily: PAGE_FONT,
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--sh-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--sh-muted)'
            }}
          >
            ×
          </button>
        </div>

        {/* Save version section */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--sh-border)',
            flexShrink: 0,
          }}
        >
          <label
            style={{
              display: 'block',
              fontSize: 'var(--type-xs)',
              fontWeight: 600,
              color: 'var(--sh-muted)',
              marginBottom: 'var(--space-2)',
              fontFamily: PAGE_FONT,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Save current version
          </label>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <input
              type="text"
              placeholder="Optional message (e.g., 'Final draft')"
              aria-label="Version message"
              value={saveMessage}
              onChange={(e) => setSaveMessage(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-soft)',
                fontSize: 'var(--type-sm)',
                color: 'var(--sh-text)',
                fontFamily: PAGE_FONT,
                outline: 'none',
                transition: 'border-color 150ms ease, background-color 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--sh-brand)'
                e.currentTarget.style.background = 'var(--sh-surface)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--sh-border)'
                e.currentTarget.style.background = 'var(--sh-soft)'
              }}
            />
          </div>
          <button
            onClick={handleSaveVersion}
            disabled={savingVersion}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: savingVersion ? 'var(--sh-muted)' : 'var(--sh-brand)',
              color: 'white',
              fontSize: 'var(--type-sm)',
              fontWeight: 600,
              cursor: savingVersion ? 'not-allowed' : 'pointer',
              fontFamily: PAGE_FONT,
              transition: 'background-color 150ms ease, opacity 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!savingVersion) {
                e.currentTarget.style.opacity = '0.9'
              }
            }}
            onMouseLeave={(e) => {
              if (!savingVersion) {
                e.currentTarget.style.opacity = '1'
              }
            }}
          >
            {savingVersion ? 'Saving…' : 'Save Version'}
          </button>
        </div>

        {/* Filter chips */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            borderBottom: '1px solid var(--sh-border)',
            flexShrink: 0,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterKey(f.key)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 999,
                cursor: 'pointer',
                border: '1px solid var(--sh-border)',
                background: filterKey === f.key ? 'var(--sh-soft)' : 'transparent',
                color: 'var(--sh-slate-700)',
                fontFamily: PAGE_FONT,
                fontWeight: filterKey === f.key ? 600 : 500,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-6)',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--sh-muted)',
                fontSize: 'var(--type-sm)',
                fontFamily: PAGE_FONT,
              }}
            >
              Loading versions…
            </div>
          ) : visibleVersions.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                padding: 'var(--space-4)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    lineHeight: 1.5,
                    fontFamily: PAGE_FONT,
                  }}
                >
                  {versions.length === 0
                    ? 'No saved versions yet. Versions are created automatically as you edit.'
                    : 'No versions match this filter.'}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {visibleVersions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  onViewDiff={(id) => setDiffVersionId(id)}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {diffVersionId != null && (
        <NoteVersionDiff
          noteId={noteId}
          versionId={diffVersionId}
          against="current"
          onClose={() => setDiffVersionId(null)}
        />
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>,
    document.body,
  )
}

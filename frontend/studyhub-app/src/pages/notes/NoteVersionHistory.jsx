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
import { showToast } from '../../lib/toast'
import { MarkdownPreview } from './notesComponents'

const PAGE_FONT = 'Plus Jakarta Sans, sans-serif'

function formatVersionDate(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' · ' + date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function VersionItem({ version, onView, onRestore, expandedId }) {
  const isExpanded = expandedId === version.id

  return (
    <div style={{
      borderBottom: '1px solid var(--sh-border)',
      padding: 'var(--space-4) 0',
    }}>
      {/* Version header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        marginBottom: isExpanded ? 'var(--space-4)' : 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--type-sm)',
            fontWeight: 600,
            color: 'var(--sh-heading)',
            marginBottom: 'var(--space-2)',
          }}>
            {formatVersionDate(version.createdAt)}
          </div>
          {version.message && (
            <div style={{
              fontSize: 'var(--type-sm)',
              color: 'var(--sh-text)',
              marginBottom: 'var(--space-3)',
            }}>
              {version.message}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => onView(version.id)}
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
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--sh-surface)'
              e.currentTarget.style.borderColor = 'var(--sh-brand)'
              e.currentTarget.style.color = 'var(--sh-brand)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--sh-soft)'
              e.currentTarget.style.borderColor = 'var(--sh-border)'
              e.currentTarget.style.color = 'var(--sh-text)'
            }}
          >
            {isExpanded ? 'Hide' : 'View'}
          </button>
          <button
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
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            Restore
          </button>
        </div>
      </div>

      {/* Expanded content preview */}
      {isExpanded && (
        <div style={{
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--sh-soft)',
          border: '1px solid var(--sh-border)',
        }}>
          {version.content ? (
            <MarkdownPreview content={version.content} />
          ) : (
            <div style={{
              color: 'var(--sh-muted)',
              fontSize: 'var(--type-sm)',
              fontStyle: 'italic',
            }}>
              No content preview available
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NoteVersionHistory({ noteId, onRestore, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [saveMessage, setSaveMessage] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

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
        headers: { 'Content-Type': 'application/json' },
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

    try {
      const response = await fetch(
        `${API}/api/notes/${noteId}/versions/${versionId}/restore`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to restore version')
      }

      const restoredNote = await response.json()
      onRestore(restoredNote)
      showToast('Note restored successfully', 'success')
    } catch (error) {
      console.error('Error restoring version:', error)
      showToast('Failed to restore version', 'error')
    }
  }

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
        <div style={{
          padding: 'var(--space-6)',
          borderBottom: '1px solid var(--sh-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 'var(--type-md)',
            fontWeight: 700,
            color: 'var(--sh-heading)',
            fontFamily: PAGE_FONT,
          }}>
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
        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--sh-border)',
          flexShrink: 0,
        }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--type-xs)',
            fontWeight: 600,
            color: 'var(--sh-muted)',
            marginBottom: 'var(--space-2)',
            fontFamily: PAGE_FONT,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Save current version
          </label>
          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}>
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

        {/* Content area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-6)',
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--sh-muted)',
              fontSize: 'var(--type-sm)',
              fontFamily: PAGE_FONT,
            }}>
              Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              padding: 'var(--space-4)',
            }}>
              <div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--sh-muted)',
                  lineHeight: 1.5,
                  fontFamily: PAGE_FONT,
                }}>
                  No saved versions yet. Versions are created automatically as you edit.
                </div>
              </div>
            </div>
          ) : (
            <div>
              {versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  onView={(id) => setExpandedId(expandedId === id ? null : id)}
                  onRestore={handleRestore}
                  expandedId={expandedId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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
    document.body
  )
}

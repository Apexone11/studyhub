/* ═══════════════════════════════════════════════════════════════════════════
 * NotesList.jsx — Notes list/sidebar component
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { PAGE_FONT, timeAgo } from '../shared/pageUtils'
import { staggerEntrance } from '../../lib/animations'
import { SkeletonList } from '../../components/Skeleton'
import { stripHtmlForPreview } from './noteHtml.js'

export default function NotesList({
  visibleNotes,
  activeNote,
  filterTab,
  setFilterTab,
  searchQuery,
  setSearchQuery,
  selectedTag,
  setSelectedTag,
  clearFilters,
  availableTags,
  setActiveNote,
  selectNote,
  createNote,
  importFileAsNote,
  creating,
  loadingNotes,
}) {
  const notesListRef = useRef(null)
  const animatedRef = useRef(false)
  const fileInputRef = useRef(null)
  // dragOver counter rather than boolean — dragenter/dragleave fire on
  // every child element as the cursor moves, so a boolean flips on and
  // off rapidly and the dashed-outline flickers. A counter only goes to
  // zero when the cursor genuinely leaves the list region.
  const [dragDepth, setDragDepth] = useState(0)
  const isDragging = dragDepth > 0

  function handleFilePick(event) {
    const file = event.target.files?.[0]
    if (file && importFileAsNote) importFileAsNote(file)
    // Reset so picking the same file twice still re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDragEnter(event) {
    event.preventDefault()
    if (event.dataTransfer?.types?.includes('Files')) {
      setDragDepth((d) => d + 1)
    }
  }

  function handleDragLeave(event) {
    event.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }

  function handleDragOver(event) {
    // Required for drop to fire.
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragDepth(0)
    const file = event.dataTransfer?.files?.[0]
    if (file && importFileAsNote) importFileAsNote(file)
  }

  /* Animate notes list on first load */
  useEffect(() => {
    if (loadingNotes || animatedRef.current || visibleNotes.length === 0) return
    animatedRef.current = true
    if (notesListRef.current)
      staggerEntrance(notesListRef.current.children, { staggerMs: 50, duration: 400, y: 12 })
  }, [loadingNotes, visibleNotes.length])

  return (
    <div
      onDragEnter={importFileAsNote ? handleDragEnter : undefined}
      onDragLeave={importFileAsNote ? handleDragLeave : undefined}
      onDragOver={importFileAsNote ? handleDragOver : undefined}
      onDrop={importFileAsNote ? handleDrop : undefined}
      style={{
        position: 'relative',
        // Subtle outline + brand wash while a file is being dragged
        // over the list. Token-only colors per CLAUDE.md.
        outline: isDragging ? '2px dashed var(--sh-brand)' : 'none',
        outlineOffset: 4,
        borderRadius: 16,
        background: isDragging ? 'var(--sh-brand-bg, transparent)' : 'transparent',
        transition: 'background 0.15s, outline-color 0.15s',
      }}
    >
      {isDragging ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 2,
            background: 'var(--sh-modal-overlay, rgba(15, 23, 42, 0.04))',
            borderRadius: 16,
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderRadius: 12,
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-brand)',
              color: 'var(--sh-heading)',
              fontFamily: PAGE_FONT,
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            }}
          >
            Drop to import as a new note
          </div>
        </div>
      ) : null}
      {/* Header with filter tabs and new note button */}
      <div
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--sh-heading, #0f172a)',
              marginBottom: 4,
            }}
          >
            My Notes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--sh-muted, #64748b)' }}>
            Rich text notes per course. Private by default.
          </p>
          <div data-tutorial="notes-filters" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[
              ['all', 'All Notes'],
              ['private', 'Private'],
              ['shared', 'Shared'],
              ['starred', '★ Starred'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setFilterTab(id)
                  setActiveNote(null)
                }}
                aria-current={filterTab === id ? 'true' : undefined}
                style={{
                  padding: '5px 14px',
                  borderRadius: 99,
                  border:
                    filterTab === id
                      ? '1px solid var(--sh-brand, #3b82f6)'
                      : '1px solid var(--sh-border, #e2e8f0)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: PAGE_FONT,
                  background: filterTab === id ? 'var(--sh-brand)' : 'var(--sh-surface, #fff)',
                  color: filterTab === id ? 'var(--sh-surface)' : 'var(--sh-muted, #64748b)',
                  transition: 'all .15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search notes, content, or tags"
              aria-label="Search notes"
              style={{
                minWidth: 220,
                flex: '1 1 220px',
                borderRadius: 10,
                border: '1px solid var(--sh-border, #e2e8f0)',
                background: 'var(--sh-surface, #fff)',
                color: 'var(--sh-heading, #0f172a)',
                padding: '9px 12px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: PAGE_FONT,
                outline: 'none',
              }}
            />
            {searchQuery || selectedTag ? (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--sh-border, #e2e8f0)',
                  background: 'var(--sh-surface, #fff)',
                  color: 'var(--sh-muted, #64748b)',
                  padding: '9px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: PAGE_FONT,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          {availableTags.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {availableTags.map((tag) => {
                const isSelected = selectedTag === tag
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(isSelected ? '' : tag)}
                    aria-pressed={isSelected}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      border: isSelected
                        ? '1px solid var(--sh-brand, #3b82f6)'
                        : '1px solid var(--sh-border, #e2e8f0)',
                      background: isSelected
                        ? 'var(--sh-brand-soft, var(--sh-info-bg, #eff6ff))'
                        : 'var(--sh-surface, #fff)',
                      color: isSelected ? 'var(--sh-brand, #3b82f6)' : 'var(--sh-muted, #64748b)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: PAGE_FONT,
                    }}
                  >
                    #{tag}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Hidden file input + Import button. v1 accepts .txt / .md;
              backend rejects everything else with a clear message. The
              full list / drag-drop hint lives in the empty-state. */}
          {importFileAsNote ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={handleFilePick}
                style={{ display: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={creating}
                aria-label="Import a text or markdown file as a new note"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: 'var(--sh-surface, #fff)',
                  border: '1px solid var(--sh-border)',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--sh-heading)',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  fontFamily: PAGE_FONT,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import
              </button>
            </>
          ) : null}
          <button
            data-tutorial="notes-create"
            onClick={createNote}
            disabled={creating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'var(--sh-brand)',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sh-surface)',
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
              boxShadow: '0 2px 8px var(--sh-brand-shadow, rgba(59,130,246,0.25))',
              transition: 'box-shadow .15s',
            }}
          >
            {creating ? 'Creating…' : '+ New Note'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <SkeletonList count={4} />
      ) : visibleNotes.length === 0 ? (
        <div
          style={{
            background: 'var(--sh-surface, #fff)',
            borderRadius: 16,
            border: '2px dashed var(--sh-border, #cbd5e1)',
            padding: '52px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background:
                'linear-gradient(135deg, var(--sh-brand-bg, #eff6ff), var(--sh-soft, #dbeafe))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              color: 'var(--sh-brand)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--sh-heading, #0f172a)',
              marginBottom: 6,
            }}
          >
            {searchQuery || selectedTag
              ? 'No notes match these filters'
              : filterTab === 'private'
                ? 'No private notes'
                : filterTab === 'shared'
                  ? 'No shared notes'
                  : filterTab === 'starred'
                    ? 'No starred notes'
                    : 'No notes yet'}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--sh-muted, #94a3b8)',
              marginBottom: 18,
              lineHeight: 1.6,
            }}
          >
            {searchQuery || selectedTag
              ? 'Try a different keyword or remove the selected tag filter.'
              : filterTab === 'private'
                ? 'Create a note and keep the Private checkbox checked.'
                : filterTab === 'shared'
                  ? 'Uncheck "Private" on a note to share it with classmates.'
                  : filterTab === 'starred'
                    ? 'Click the Star control on any note to keep it in this quick-access view.'
                    : 'Create your first note to get started.'}
          </div>
          <button
            onClick={createNote}
            style={{
              background: 'var(--sh-brand)',
              color: 'var(--sh-surface)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 24px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: PAGE_FONT,
              boxShadow: '0 2px 8px var(--sh-brand-shadow, rgba(59,130,246,0.25))',
            }}
          >
            Create a Note
          </button>
        </div>
      ) : (
        <div ref={notesListRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleNotes.map((note) => {
            const isActive = activeNote?.id === note.id
            return (
              <button
                key={note.id}
                onClick={() => selectNote(note)}
                aria-label={`Open note: ${note.title || 'Untitled'}`}
                aria-current={isActive ? 'true' : undefined}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? 'var(--sh-info-bg, #eff6ff)' : 'var(--sh-surface, #fff)',
                  borderRadius: 12,
                  border: isActive
                    ? '1.5px solid var(--sh-brand-border, #93c5fd)'
                    : '1px solid var(--sh-border, #e2e8f0)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all .15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.borderColor = 'var(--sh-brand-border, #93c5fd)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = 'var(--sh-border, #e2e8f0)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--sh-heading, #0f172a)',
                      lineHeight: 1.3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {note.pinned && (
                      <span title="Pinned" style={{ fontSize: 11, color: 'var(--sh-brand)' }}>
                        &#x25C9;
                      </span>
                    )}
                    {note._starred && (
                      <span
                        title="Starred"
                        style={{ fontSize: 11, color: 'var(--sh-warning-text, #f59e0b)' }}
                      >
                        ★
                      </span>
                    )}
                    {note.title || 'Untitled'}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: 99,
                      fontWeight: 600,
                      background:
                        note.private !== false
                          ? 'var(--sh-soft, #f1f5f9)'
                          : 'var(--sh-success-bg, #dcfce7)',
                      color:
                        note.private !== false
                          ? 'var(--sh-muted, #64748b)'
                          : 'var(--sh-success-text, #16a34a)',
                      marginLeft: 8,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {note.private !== false ? 'Private' : 'Shared'}
                  </span>
                </div>
                {(() => {
                  const previewText = stripHtmlForPreview(note.content)
                  if (!previewText) return null
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--sh-subtext, #94a3b8)',
                        lineHeight: 1.5,
                        marginBottom: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}
                    >
                      {previewText.slice(0, 80)}
                    </div>
                  )
                })()}
                {note.tags?.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {note.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'var(--sh-brand-soft, var(--sh-info-bg, #eff6ff))',
                          color: 'var(--sh-brand, #3b82f6)',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--sh-subtext, #94a3b8)',
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  {note.course ? (
                    <span style={{ fontWeight: 600, color: 'var(--sh-brand, #3b82f6)' }}>
                      {note.course.code}
                    </span>
                  ) : null}
                  <span>{timeAgo(note.updatedAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

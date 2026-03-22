/* ═══════════════════════════════════════════════════════════════════════════
 * NotesList.jsx — Notes list/sidebar component
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { PAGE_FONT, timeAgo } from '../shared/pageUtils'
import { staggerEntrance } from '../../lib/animations'
import { SkeletonList } from '../../components/Skeleton'

export default function NotesList({
  visibleNotes,
  activeNote,
  filterTab,
  setFilterTab,
  setActiveNote,
  selectNote,
  createNote,
  creating,
  loadingNotes,
}) {
  const notesListRef = useRef(null)
  const animatedRef = useRef(false)

  /* Animate notes list on first load */
  useEffect(() => {
    if (loadingNotes || animatedRef.current || visibleNotes.length === 0) return
    animatedRef.current = true
    if (notesListRef.current) staggerEntrance(notesListRef.current.children, { staggerMs: 50, duration: 400, y: 12 })
  }, [loadingNotes, visibleNotes.length])

  return (
    <div>
      {/* Header with filter tabs and new note button */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--sh-heading, #0f172a)', marginBottom: 4 }}>My Notes</h1>
          <p style={{ fontSize: 13, color: 'var(--sh-muted, #64748b)' }}>Markdown notes per course. Private by default.</p>
          <div data-tutorial="notes-filters" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[
              ['all', 'All Notes'],
              ['private', 'Private'],
              ['shared', 'Shared'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setFilterTab(id); setActiveNote(null) }}
                style={{
                  padding: '5px 14px',
                  borderRadius: 99,
                  border: filterTab === id ? '1px solid #3b82f6' : '1px solid var(--sh-border, #e2e8f0)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: PAGE_FONT,
                  background: filterTab === id ? '#3b82f6' : 'var(--sh-surface, #fff)',
                  color: filterTab === id ? '#fff' : 'var(--sh-muted, #64748b)',
                  transition: 'all .15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          data-tutorial="notes-create"
          onClick={createNote}
          disabled={creating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#3b82f6', border: 'none',
            borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff',
            cursor: 'pointer', fontFamily: PAGE_FONT,
            boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
            transition: 'box-shadow .15s',
          }}
        >
          {creating ? 'Creating…' : '+ New Note'}
        </button>
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <SkeletonList count={4} />
      ) : visibleNotes.length === 0 ? (
        <div style={{ background: 'var(--sh-surface, #fff)', borderRadius: 16, border: '2px dashed var(--sh-border, #cbd5e1)', padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', marginBottom: 6 }}>
            {filterTab === 'private' ? 'No private notes' : filterTab === 'shared' ? 'No shared notes' : 'No notes yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--sh-muted, #94a3b8)', marginBottom: 18, lineHeight: 1.6 }}>
            {filterTab === 'private'
              ? 'Create a note and keep the Private checkbox checked.'
              : filterTab === 'shared'
                ? 'Uncheck "Private" on a note to share it with classmates.'
                : 'Create your first markdown note to get started.'}
          </div>
          <button
            onClick={createNote}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: PAGE_FONT, boxShadow: '0 2px 8px rgba(59,130,246,0.25)' }}
          >
            Create a Note
          </button>
        </div>
      ) : (
        <div ref={notesListRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleNotes.map((note) => {
            const isActive = activeNote?.id === note.id
            return (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                style={{
                  background: isActive ? '#eff6ff' : 'var(--sh-surface, #fff)',
                  borderRadius: 12,
                  border: isActive ? '1.5px solid #93c5fd' : '1px solid var(--sh-border, #e2e8f0)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = '#93c5fd' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--sh-border, #e2e8f0)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading, #0f172a)', lineHeight: 1.3 }}>
                    {note.title || 'Untitled'}
                  </div>
                  <span
                    style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 99, fontWeight: 600,
                      background: note.private !== false ? 'var(--sh-soft, #f1f5f9)' : '#dcfce7',
                      color: note.private !== false ? 'var(--sh-muted, #64748b)' : '#16a34a',
                      marginLeft: 8, whiteSpace: 'nowrap',
                    }}
                  >
                    {note.private !== false ? 'Private' : 'Shared'}
                  </span>
                </div>
                {note.content?.trim() ? (
                  <div style={{ fontSize: 12, color: 'var(--sh-subtext, #94a3b8)', lineHeight: 1.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {note.content.slice(0, 80)}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--sh-subtext, #94a3b8)', display: 'flex', gap: 10 }}>
                  {note.course ? <span style={{ fontWeight: 600, color: '#3b82f6' }}>{note.course.code}</span> : null}
                  <span>{timeAgo(note.updatedAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

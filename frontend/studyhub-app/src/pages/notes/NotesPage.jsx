/* ═══════════════════════════════════════════════════════════════════════════
 * NotesPage.jsx — Personal markdown notes with split-panel editor
 *
 * Editor surface:
 *   - Light-themed editor
 *   - Markdown formatting toolbar (bold, italic, heading, list, code, link)
 *   - markdown-to-HTML preview via marked + DOMPurify
 *   - Word count, typography hierarchy
 *
 * Layout (responsive):
 *   Desktop/Tablet: notes list (300px) | editor (flex) — side by side
 *   Phone: notes list OR editor — one at a time, back button to return
 *
 * Features: auto-save with 1.5s debounce, private/shared toggle, course
 * tagging, markdown toolbar, live preview, word count.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { useProtectedPage } from '../../lib/useProtectedPage'
import { useResponsiveAppLayout } from '../../lib/ui'
import { PageShell } from '../shared/pageScaffold'
import { PAGE_FONT } from '../shared/pageUtils'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { NOTES_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { usePageTitle } from '../../lib/usePageTitle'
import { useNotesData } from './useNotesData'
import NotesList from './NotesList'
import NoteEditor from './NoteEditor'
import { SkeletonList, SkeletonCard } from '../../components/Skeleton'

export default function NotesPage() {
  usePageTitle('My Notes')
  const { status: authStatus, error: authError } = useProtectedPage()
  const layout = useResponsiveAppLayout()

  /* Tutorial popup */
  const tutorial = useTutorial('notes', NOTES_STEPS, { version: TUTORIAL_VERSIONS.notes })

  /* All notes state and actions */
  const data = useNotesData()

  /* On phone, show list OR editor. On desktop/tablet, show both. */
  const showListPanel = !layout.isPhone || !data.activeNote
  const showEditorPanel = !layout.isPhone || Boolean(data.activeNote)

  /* ── Loading gate ────────────────────────────────────────────────────── */
  if (authStatus === 'loading') {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'My Notes', to: '/notes' }]} hideTabs />}
        sidebar={<AppSidebar />}
      >
        <div className="notes-split-panel">
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                background: 'var(--sh-surface)',
                borderRadius: 16,
                border: '1px solid var(--sh-border)',
                padding: '20px 22px',
              }}
            >
              <SkeletonList count={4} />
            </div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <SkeletonCard />
          </div>
        </div>
      </PageShell>
    )
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <PageShell
      nav={<Navbar crumbs={[{ label: 'My Notes', to: '/notes' }]} hideTabs />}
      sidebar={<AppSidebar />}
    >
      {authError ? (
        <div
          role="alert"
          style={{
            background: 'var(--sh-warning-bg)',
            border: '1px solid var(--sh-warning-border)',
            color: 'var(--sh-warning-text)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {authError}
        </div>
      ) : null}

      {/* Split panel: list (300px) | editor (flex) on desktop/tablet
       * Single panel on phone: either list or editor */}
      <div className="notes-split-panel">
        {showListPanel && (
          <div>
            <NotesList
              visibleNotes={data.visibleNotes}
              activeNote={data.activeNote}
              filterTab={data.filterTab}
              setFilterTab={data.setFilterTab}
              searchQuery={data.searchQuery}
              setSearchQuery={data.setSearchQuery}
              selectedTag={data.selectedTag}
              setSelectedTag={data.setSelectedTag}
              clearFilters={data.clearFilters}
              availableTags={data.availableTags}
              setActiveNote={data.setActiveNote}
              selectNote={data.selectNote}
              createNote={data.createNote}
              creating={data.creating}
              loadingNotes={data.loadingNotes}
            />
          </div>
        )}
        {showEditorPanel && (
          <div>
            <NoteEditor
              activeNote={data.activeNote}
              editorTitle={data.editorTitle}
              editorContent={data.editorContent}
              editorPrivate={data.editorPrivate}
              editorAllowDownloads={data.editorAllowDownloads}
              editorCourseId={data.editorCourseId}
              courses={data.courses}
              enrolledSchoolIds={data.enrolledSchoolIds}
              saving={data.saving}
              confirmDelete={data.confirmDelete}
              setConfirmDelete={data.setConfirmDelete}
              handleTitleChange={data.handleTitleChange}
              handleContentChange={data.handleContentChange}
              handlePrivateChange={data.handlePrivateChange}
              handleAllowDownloadsChange={data.handleAllowDownloadsChange}
              handleCourseChange={data.handleCourseChange}
              deleteNote={data.deleteNote}
              setActiveNote={data.setActiveNote}
              toggleStar={data.toggleStar}
              togglePin={data.togglePin}
              handleRestore={data.handleRestore}
              handleTagsChange={data.handleTagsChange}
              patchNoteLocally={data.patchNoteLocally}
              layout={layout}
            />
          </div>
        )}
      </div>

      {/* Tutorial popup */}
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button
          type="button"
          onClick={tutorial.restart}
          aria-label="Show tutorial"
          title="Show tutorial"
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--sh-brand)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: 'var(--sh-btn-primary-shadow, 0 4px 14px rgba(59,130,246,0.4))',
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ?
        </button>
      )}
    </PageShell>
  )
}

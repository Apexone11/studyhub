import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { IconArrowLeft, IconFork } from '../../components/Icons'
import { pageShell } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { timeAgo, truncateChecksum } from './sheetLabConstants'
import { DiffViewer } from './SheetLabPanels'
import SheetLabEditor from './SheetLabEditor'
import SheetLabChanges from './SheetLabChanges'
import SheetLabContribute from './SheetLabContribute'
import SheetLabReviews from './SheetLabReviews'
import SheetLabLineage from './SheetLabLineage'
import TutorialBanner from '../../components/TutorialBanner'
import useSheetLab from './useSheetLab'
import './SheetLabPage.css'

/* ── Tab definitions ───────────────────────────────────────── */

function buildTabs(isOwner, isFork) {
  const tabs = []
  if (isOwner) {
    tabs.push({ id: 'editor', label: 'Editor' })
    tabs.push({ id: 'changes', label: 'Changes' })
  }
  tabs.push({ id: 'history', label: 'History' })
  tabs.push({ id: 'lineage', label: 'Lineage' })
  if (isOwner && isFork) {
    tabs.push({ id: 'contribute', label: 'Contribute' })
  }
  if (isOwner && !isFork) {
    tabs.push({ id: 'reviews', label: 'Reviews' })
  }
  return tabs
}

/* ── Status badge helper ───────────────────────────────────── */

function StatusBadge({ status }) {
  if (!status) return null
  return (
    <span className={`sheet-lab__status-badge sheet-lab__status-badge--${status}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

/* ── History tab content (existing timeline) ───────────────── */

function HistoryTab({ lab }) {
  const {
    commits, page, totalPages, loading,
    expandedCommitId, expandedContent, loadingContent,
    showCreateModal, setShowCreateModal, commitMessage, setCommitMessage,
    autoSummary, setAutoSummary, loadingSummary, creating,
    restoring, restorePreview, setRestorePreview, loadingRestorePreview,
    compareMode, setCompareMode, compareSelection, diff, loadingDiff,
    timelineRef, isOwner, loadCommits, toggleCommitContent,
    handleCreateCommit, handlePreviewRestore, handleRestore, toggleCompareSelection,
  } = lab

  return (
    <>
      {/* Actions */}
      <div className="sheet-lab__actions">
        {isOwner ? (
          <button
            type="button"
            className="sheet-lab__btn sheet-lab__btn--primary"
            onClick={() => setShowCreateModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Create Snapshot
          </button>
        ) : null}
        {commits.length >= 2 ? (
          <button
            type="button"
            className={`sheet-lab__btn sheet-lab__btn--compare${compareMode ? ' active' : ''}`}
            onClick={() => setCompareMode((v) => !v)}
          >
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
        ) : null}
      </div>

      {/* Diff viewer */}
      {compareMode && diff ? <DiffViewer diff={diff} title="Diff" /> : null}
      {compareMode && loadingDiff ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--sh-muted)', fontSize: 13 }}>
          Computing diff...
        </div>
      ) : null}
      {compareMode && compareSelection.length < 2 ? (
        <div style={{
          background: 'var(--sh-info-bg, #eff6ff)', border: '1px solid var(--sh-info-border, #dbeafe)',
          borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--sh-info-text, #1d4ed8)', marginBottom: 16,
        }}>
          Select two snapshots to compare. ({compareSelection.length}/2 selected)
        </div>
      ) : null}

      {/* Timeline */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)', fontSize: 14 }}>
          Loading version history...
        </div>
      ) : commits.length === 0 ? (
        <div className="sheet-lab__empty">
          <div className="sheet-lab__empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="sheet-lab__empty-title">No snapshots yet</p>
          <p className="sheet-lab__empty-text">
            {isOwner
              ? 'Create your first snapshot to start tracking changes.'
              : 'The sheet owner has not created any snapshots yet.'}
          </p>
        </div>
      ) : (
        <div className="sheet-lab__timeline" ref={timelineRef}>
          {commits.map((commit) => {
            const isSelected = compareSelection.includes(commit.id)
            const isExpanded = expandedCommitId === commit.id
            return (
              <div
                key={commit.id}
                className={`sheet-lab__commit${isSelected ? ' sheet-lab__commit--selected' : ''}`}
              >
                <div className="sheet-lab__commit-dot" />
                <div
                  className="sheet-lab__commit-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (compareMode) toggleCompareSelection(commit.id)
                    else toggleCommitContent(commit.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (compareMode) toggleCompareSelection(commit.id)
                      else toggleCommitContent(commit.id)
                    }
                  }}
                >
                  <div className="sheet-lab__commit-top">
                    <p className="sheet-lab__commit-message">
                      {commit.message || 'Snapshot'}
                      {commit.kind && commit.kind !== 'snapshot' ? (
                        <span className={`sheet-lab__commit-kind sheet-lab__commit-kind--${commit.kind}`}>
                          {commit.kind.replace('_', ' ')}
                        </span>
                      ) : null}
                    </p>
                    <span className="sheet-lab__commit-time">{timeAgo(commit.createdAt)}</span>
                  </div>
                  <div className="sheet-lab__commit-meta">
                    <span className="sheet-lab__commit-author">
                      {commit.author?.avatarUrl ? (
                        <img src={commit.author.avatarUrl} alt="" className="sheet-lab__commit-avatar" />
                      ) : (
                        <span
                          className="sheet-lab__commit-avatar"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800, color: '#6366f1',
                          }}
                        >
                          {(commit.author?.username || '?')[0].toUpperCase()}
                        </span>
                      )}
                      {commit.author?.username || 'Unknown'}
                    </span>
                    <span className="sheet-lab__commit-checksum">
                      {truncateChecksum(commit.checksum)}
                    </span>
                  </div>

                  {!compareMode ? (
                    <div className="sheet-lab__commit-actions">
                      {isOwner ? (
                        <button
                          type="button"
                          className="sheet-lab__restore-btn"
                          disabled={restoring === commit.id || loadingRestorePreview === commit.id}
                          onClick={(e) => { e.stopPropagation(); handlePreviewRestore(commit.id) }}
                        >
                          {loadingRestorePreview === commit.id ? 'Loading preview...' : 'Restore'}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="sheet-lab__commit-actions">
                      <span
                        className={`sheet-lab__compare-check${isSelected ? ' selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleCompareSelection(commit.id) }}
                      >
                        {isSelected ? 'Selected' : 'Select for compare'}
                      </span>
                    </div>
                  )}

                  {isExpanded && !compareMode ? (
                    <div className="sheet-lab__content-preview">
                      {loadingContent ? 'Loading content...' : (expandedContent || '(empty)')}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginTop: 20, fontSize: 13, fontWeight: 600,
        }}>
          <button type="button" disabled={page <= 1} className="sheet-lab__btn sheet-lab__btn--cancel" onClick={() => loadCommits(page - 1)}>
            Previous
          </button>
          <span style={{ padding: '8px 4px', color: 'var(--sh-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} className="sheet-lab__btn sheet-lab__btn--cancel" onClick={() => loadCommits(page + 1)}>
            Next
          </button>
        </div>
      ) : null}

      {/* Create Snapshot Modal */}
      {showCreateModal ? (
        <div className="sheet-lab__modal-overlay" onClick={() => setShowCreateModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowCreateModal(false) }} role="presentation">
          <div className="sheet-lab__modal" role="dialog" aria-modal="true" aria-label="Create snapshot" onClick={(e) => e.stopPropagation()}>
            <h2>Create Snapshot</h2>
            <p>Save the current state of this sheet as a versioned snapshot. You can restore any snapshot later.</p>
            {autoSummary && !loadingSummary ? (
              <div className="sheet-lab__auto-summary">
                <span className="sheet-lab__auto-summary-label">Auto-detected changes:</span>
                <span className="sheet-lab__auto-summary-text">{autoSummary}</span>
                {commitMessage !== autoSummary ? (
                  <button type="button" className="sheet-lab__auto-summary-use" onClick={() => setCommitMessage(autoSummary)}>
                    Use this
                  </button>
                ) : null}
              </div>
            ) : null}
            {loadingSummary ? (
              <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginBottom: 10 }}>Analyzing changes...</div>
            ) : null}
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe what changed (optional)..."
              rows={3}
              maxLength={500}
            />
            <div className="sheet-lab__modal-actions">
              <button type="button" className="sheet-lab__btn sheet-lab__btn--cancel" onClick={() => { setShowCreateModal(false); setAutoSummary(''); setCommitMessage('') }}>
                Cancel
              </button>
              <button type="button" className="sheet-lab__btn sheet-lab__btn--primary" disabled={creating} onClick={handleCreateCommit}>
                {creating ? 'Creating...' : 'Create Snapshot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Restore Preview Modal */}
      {restorePreview ? (
        <div className="sheet-lab__modal-overlay" onClick={() => setRestorePreview(null)} onKeyDown={(e) => { if (e.key === 'Escape') setRestorePreview(null) }} role="presentation">
          <div className="sheet-lab__modal sheet-lab__modal--wide" role="dialog" aria-modal="true" aria-label="Restore preview" onClick={(e) => e.stopPropagation()}>
            <h2>Restore Preview</h2>
            <p>Review the changes that will be applied when restoring to snapshot{restorePreview.commit?.message ? ` "${restorePreview.commit.message}"` : ''}.</p>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 16 }}>
              <DiffViewer diff={restorePreview.diff} title="Changes to apply" />
            </div>
            <div className="sheet-lab__modal-actions">
              <button type="button" className="sheet-lab__btn sheet-lab__btn--cancel" onClick={() => setRestorePreview(null)}>Cancel</button>
              <button type="button" className="sheet-lab__btn sheet-lab__btn--primary" disabled={restoring === restorePreview.commitId} onClick={() => handleRestore(restorePreview.commitId)} style={{ background: '#dc2626' }}>
                {restoring === restorePreview.commitId ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/* ── Main page component ───────────────────────────────────── */

export default function SheetLabPage() {
  usePageTitle('Sheet Lab')

  const lab = useSheetLab()
  const { sheet, error, isOwner, isFork, activeTab, setActiveTab, handleBack, deleting, handleDeleteFork, publishing, handlePublish } = lab
  const tabs = buildTabs(isOwner, isFork)

  // Ensure activeTab is valid for current tab set
  const validTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0]?.id || 'history'

  return (
    <>
      <Navbar />
      <div className="sheet-lab">
        <div style={pageShell('reading', 26, 48)}>
          {/* ── Header ─────────────────────────────────── */}
          <div className="sheet-lab__header">
            <button type="button" onClick={handleBack} className="sheet-lab__back">
              <IconArrowLeft size={14} />
              Back to sheet
            </button>
          </div>

          <h1 className="sheet-lab__title">
            {sheet ? sheet.title : 'Sheet Lab'}
          </h1>

          {sheet ? (
            <div className="sheet-lab__meta">
              <StatusBadge status={sheet.status} />
              {isFork && sheet.forkSource ? (
                <span className="sheet-lab__fork-badge">
                  <IconFork size={12} />
                  Forked from{' '}
                  <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {sheet.forkSource.title}
                  </Link>
                  {sheet.forkSource.author ? ` by ${sheet.forkSource.author.username}` : ''}
                </span>
              ) : null}
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--sh-soft)', color: 'var(--sh-muted)', fontWeight: 700 }}>
                {isOwner ? 'Owner' : 'Read-only'}
              </span>
              {isOwner && sheet.status === 'draft' ? (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  style={{
                    border: 'none', borderRadius: 8, padding: '3px 12px',
                    fontSize: 11, fontWeight: 700, cursor: publishing ? 'not-allowed' : 'pointer',
                    background: '#16a34a', color: '#fff', fontFamily: 'inherit',
                  }}
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              ) : null}
              {isOwner && isFork ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this fork? This cannot be undone.')) handleDeleteFork()
                  }}
                  disabled={deleting}
                  style={{
                    marginLeft: 'auto', border: '1px solid var(--sh-danger-border, #fecaca)',
                    borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                    background: 'var(--sh-danger-bg, #fef2f2)', color: 'var(--sh-danger-text, #dc2626)',
                    cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete fork'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* ── Error banner ───────────────────────────── */}
          {error ? (
            <div style={{
              background: 'var(--sh-danger-bg, #fef2f2)', color: 'var(--sh-danger-text, #dc2626)',
              border: '1px solid var(--sh-danger-border, #fecaca)',
              borderRadius: 14, padding: '12px 14px', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          ) : null}

          {/* ── Tab navigation ─────────────────────────── */}
          <nav className="sheet-lab__tabs" aria-label="Sheet Lab tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`sheet-lab__tab${validTab === tab.id ? ' sheet-lab__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-selected={validTab === tab.id}
                role="tab"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ── Tutorial ────────────────────────────────── */}
          {isOwner ? (
            <TutorialBanner
              featureKey={isFork ? 'sheetlab_fork' : 'sheetlab_owner'}
              title={isFork ? 'Welcome to your fork\'s SheetLab' : 'Welcome to SheetLab'}
              steps={isFork ? [
                'Use the Editor tab to edit your fork\'s content with live preview.',
                'Switch to Changes to see what you modified and commit a snapshot.',
                'Use Contribute to submit your changes to the original author.',
                'Sync from original pulls the latest version from the source sheet.',
              ] : [
                'Use the Editor tab to write content with a live preview.',
                'Switch to Changes to review your edits and commit snapshots.',
                'History shows all your snapshots — compare or restore any version.',
                'Reviews shows contributions from users who forked your sheet.',
              ]}
            />
          ) : null}

          {/* ── Tab content ────────────────────────────────── */}
          {validTab === 'editor' ? <SheetLabEditor sheet={sheet} onContentSaved={() => lab.loadCommits(1)} /> : null}
          {validTab === 'changes' ? <SheetLabChanges sheet={sheet} onCommitCreated={() => lab.loadCommits(1)} /> : null}
          {validTab === 'history' ? <HistoryTab lab={lab} /> : null}
          {validTab === 'lineage' ? <SheetLabLineage lab={lab} /> : null}
          {validTab === 'contribute' ? <SheetLabContribute sheet={sheet} onContributed={() => lab.reloadSheet()} /> : null}
          {validTab === 'reviews' ? <SheetLabReviews sheet={sheet} onReviewed={() => lab.reloadSheet()} /> : null}
        </div>
      </div>
    </>
  )
}

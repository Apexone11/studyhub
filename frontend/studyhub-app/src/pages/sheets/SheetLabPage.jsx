import Navbar from '../../components/Navbar'
import { IconArrowLeft } from '../../components/Icons'
import { pageShell } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { timeAgo, truncateChecksum } from './sheetLabConstants'
import { DiffViewer } from './SheetLabPanels'
import useSheetLab from './useSheetLab'
import './SheetLabPage.css'

export default function SheetLabPage() {
  usePageTitle('Sheet Lab')

  const {
    sheet,
    commits,
    total,
    page,
    totalPages,
    loading,
    error,
    expandedCommitId,
    expandedContent,
    loadingContent,
    showCreateModal,
    setShowCreateModal,
    commitMessage,
    setCommitMessage,
    autoSummary,
    setAutoSummary,
    loadingSummary,
    creating,
    restoring,
    restorePreview,
    setRestorePreview,
    loadingRestorePreview,
    compareMode,
    setCompareMode,
    compareSelection,
    diff,
    loadingDiff,
    timelineRef,
    isOwner,
    loadCommits,
    toggleCommitContent,
    handleCreateCommit,
    handlePreviewRestore,
    handleRestore,
    toggleCompareSelection,
    handleBack,
  } = useSheetLab()

  return (
    <>
      <Navbar />
      <div className="sheet-lab">
        <div style={pageShell('reading', 26, 48)}>
          {/* ── Header ─────────────────────────────────────── */}
          <div className="sheet-lab__header">
            <button type="button" onClick={handleBack} className="sheet-lab__back">
              <IconArrowLeft size={14} />
              Back to sheet
            </button>
          </div>
          <h1 className="sheet-lab__title">
            {sheet ? sheet.title : 'Sheet Lab'}
          </h1>
          <p className="sheet-lab__subtitle">
            Version history {total > 0 ? `\u2014 ${total} snapshot${total === 1 ? '' : 's'}` : ''}
          </p>

          {/* ── Actions ────────────────────────────────────── */}
          <div className="sheet-lab__actions" style={{ marginTop: 16 }}>
            {isOwner ? (
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--primary"
                onClick={() => setShowCreateModal(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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

          {/* ── Error ──────────────────────────────────────── */}
          {error ? (
            <div style={{
              background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
              borderRadius: 14, padding: '12px 14px', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          ) : null}

          {/* ── Diff viewer ────────────────────────────────── */}
          {compareMode && diff ? (
            <DiffViewer diff={diff} title="Diff" />
          ) : null}

          {compareMode && loadingDiff ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
              Computing diff...
            </div>
          ) : null}

          {compareMode && compareSelection.length < 2 ? (
            <div style={{
              background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12,
              padding: '10px 14px', fontSize: 13, color: '#1d4ed8', marginBottom: 16,
            }}>
              Select two snapshots to compare. ({compareSelection.length}/2 selected)
            </div>
          ) : null}

          {/* ── Timeline ───────────────────────────────────── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 14 }}>
              Loading version history...
            </div>
          ) : commits.length === 0 ? (
            <div className="sheet-lab__empty">
              <div className="sheet-lab__empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
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
                        if (compareMode) {
                          toggleCompareSelection(commit.id)
                        } else {
                          toggleCommitContent(commit.id)
                        }
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
                        </p>
                        <span className="sheet-lab__commit-time">{timeAgo(commit.createdAt)}</span>
                      </div>
                      <div className="sheet-lab__commit-meta">
                        <span className="sheet-lab__commit-author">
                          {commit.author?.avatarUrl ? (
                            <img
                              src={commit.author.avatarUrl}
                              alt=""
                              className="sheet-lab__commit-avatar"
                            />
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

                      {/* Actions row */}
                      {!compareMode ? (
                        <div className="sheet-lab__commit-actions">
                          {isOwner ? (
                            <button
                              type="button"
                              className="sheet-lab__restore-btn"
                              disabled={restoring === commit.id || loadingRestorePreview === commit.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePreviewRestore(commit.id)
                              }}
                            >
                              {loadingRestorePreview === commit.id ? 'Loading preview...' : 'Restore'}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="sheet-lab__commit-actions">
                          <span
                            className={`sheet-lab__compare-check${isSelected ? ' selected' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCompareSelection(commit.id)
                            }}
                          >
                            {isSelected ? 'Selected' : 'Select for compare'}
                          </span>
                        </div>
                      )}

                      {/* Expanded content preview */}
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

          {/* ── Pagination ─────────────────────────────────── */}
          {totalPages > 1 ? (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 10,
              marginTop: 20, fontSize: 13, fontWeight: 600,
            }}>
              <button
                type="button"
                disabled={page <= 1}
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => loadCommits(page - 1)}
              >
                Previous
              </button>
              <span style={{ padding: '8px 4px', color: '#64748b' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => loadCommits(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Create Snapshot Modal ──────────────────────────── */}
      {showCreateModal ? (
        <div className="sheet-lab__modal-overlay" onClick={() => setShowCreateModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowCreateModal(false) }} role="presentation">
          <div className="sheet-lab__modal" role="dialog" aria-modal="true" aria-label="Create snapshot" onClick={(e) => e.stopPropagation()}>
            <h2>Create Snapshot</h2>
            <p>
              Save the current state of this sheet as a versioned snapshot. You can restore any snapshot later.
            </p>
            {autoSummary && !loadingSummary ? (
              <div className="sheet-lab__auto-summary">
                <span className="sheet-lab__auto-summary-label">Auto-detected changes:</span>
                <span className="sheet-lab__auto-summary-text">{autoSummary}</span>
                {commitMessage !== autoSummary ? (
                  <button
                    type="button"
                    className="sheet-lab__auto-summary-use"
                    onClick={() => setCommitMessage(autoSummary)}
                  >
                    Use this
                  </button>
                ) : null}
              </div>
            ) : null}
            {loadingSummary ? (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Analyzing changes...
              </div>
            ) : null}
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe what changed (optional)..."
              rows={3}
              maxLength={500}
            />
            <div className="sheet-lab__modal-actions">
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => { setShowCreateModal(false); setAutoSummary(''); setCommitMessage('') }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--primary"
                disabled={creating}
                onClick={handleCreateCommit}
              >
                {creating ? 'Creating...' : 'Create Snapshot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Restore Preview Modal ──────────────────────────── */}
      {restorePreview ? (
        <div className="sheet-lab__modal-overlay" onClick={() => setRestorePreview(null)} onKeyDown={(e) => { if (e.key === 'Escape') setRestorePreview(null) }} role="presentation">
          <div className="sheet-lab__modal sheet-lab__modal--wide" role="dialog" aria-modal="true" aria-label="Restore preview" onClick={(e) => e.stopPropagation()}>
            <h2>Restore Preview</h2>
            <p>
              Review the changes that will be applied to your sheet when restoring to snapshot
              {restorePreview.commit?.message ? ` "${restorePreview.commit.message}"` : ''}.
            </p>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 16 }}>
              <DiffViewer diff={restorePreview.diff} title="Changes to apply" />
            </div>
            <div className="sheet-lab__modal-actions">
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => setRestorePreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--primary"
                disabled={restoring === restorePreview.commitId}
                onClick={() => handleRestore(restorePreview.commitId)}
                style={{ background: '#dc2626' }}
              >
                {restoring === restorePreview.commitId ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

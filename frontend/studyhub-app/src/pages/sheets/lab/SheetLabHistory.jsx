/**
 * SheetLabHistory — visual commit timeline with author avatars,
 * version browsing, compare mode, snapshot creation, and restore previews.
 * Extracted from SheetLabPage.jsx (Track 5.1).
 */
import { Link } from 'react-router-dom'
import { timeAgo, truncateChecksum } from './sheetLabConstants'
import { DiffViewer } from './SheetLabPanels'

/* ── Commit kind config ──────────────────────────────────── */

const KIND_META = {
  fork_base: { label: 'Fork base', icon: '⑂', cls: 'fork_base' },
  restore:   { label: 'Restored', icon: '↩', cls: 'restore' },
  merge:     { label: 'Merged',   icon: '⤞', cls: 'merge' },
}

/* ── Main component ─────────────────────────────────────── */

export default function SheetLabHistory({ lab }) {
  const {
    sheetId,
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

      {/* Compare diff viewer */}
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
          {commits.map((commit, index) => {
            const isSelected = compareSelection.includes(commit.id)
            const isExpanded = expandedCommitId === commit.id
            const isFirst = index === 0
            const kindMeta = commit.kind && commit.kind !== 'snapshot' ? KIND_META[commit.kind] : null
            return (
              <div
                key={commit.id}
                className={`sheet-lab__commit${isSelected ? ' sheet-lab__commit--selected' : ''}`}
              >
                {/* Timeline dot — author avatar or initial */}
                <div className={`sheet-lab__commit-dot${isFirst ? ' sheet-lab__commit-dot--latest' : ''}`}>
                  {commit.author?.avatarUrl ? (
                    <img
                      src={commit.author.avatarUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '100%', height: '100%', fontSize: 9, fontWeight: 800,
                      color: isFirst ? '#fff' : 'var(--sh-brand, #6366f1)',
                    }}>
                      {(commit.author?.username || '?')[0].toUpperCase()}
                    </span>
                  )}
                </div>

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
                      {kindMeta ? (
                        <span className={`sheet-lab__commit-kind sheet-lab__commit-kind--${kindMeta.cls}`}>
                          <span aria-hidden="true" style={{ marginRight: 3 }}>{kindMeta.icon}</span>
                          {kindMeta.label}
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

                  {/* Actions row */}
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
                      <Link
                        to={`/sheets/${sheetId}/lab?tab=history&version=${commit.id}`}
                        className="sheet-lab__browse-btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Browse at this version
                      </Link>
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

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import Navbar from '../../../components/navbar/Navbar'
import ReportModal from '../../../components/ReportModal'
import ModerationBanner from '../../../components/ModerationBanner'
import PendingReviewBanner from '../../../components/PendingReviewBanner'
import AppSidebar from '../../../components/sidebar/AppSidebar'
import SafeJoyride from '../../../components/SafeJoyride'
import { SkeletonCard } from '../../../components/Skeleton'
import { IconGitPullRequest } from '../../../components/Icons'
import { useResponsiveAppLayout, pageShell } from '../../../lib/ui'
import { useTutorial } from '../../../lib/useTutorial'
import { VIEWER_STEPS, TUTORIAL_VERSIONS } from '../../../lib/tutorialSteps'
import useSheetViewer from './useSheetViewer'
import SheetViewerSidebar from './SheetViewerSidebar'
import SheetHeader from './SheetHeader'
import SheetActionsMenu from './SheetActionsMenu'
import SheetContentPanel from './SheetContentPanel'
import SheetCommentsPanel from './SheetCommentsPanel'
import RelatedSheetsPanel from './RelatedSheetsPanel'
import SheetReadme from './SheetReadme'
import SheetActivityFeed from './SheetActivityFeed'
import { FONT, errorBanner } from './sheetViewerConstants'

export default function SheetViewerPage() {
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('viewer', VIEWER_STEPS, { version: TUTORIAL_VERSIONS.viewer })

  const {
    user,
    sheet,
    sheetState,
    commentsState,
    commentDraft,
    setCommentDraft,
    commentSaving,
    forking,
    contributing,
    showContributeModal,
    setShowContributeModal,
    contributeMessage,
    setContributeMessage,
    reviewingId,
    safePreviewUrl,
    runtimeUrl,
    previewLoading,
    runtimeLoading,
    htmlWarningAcked,
    viewerInteractive,
    toggleViewerInteractive,
    relatedSheets,
    readmeData,
    sheetPanelRef,
    canEdit,
    canToggleInteractive,
    isHtmlSheet,
    previewKind,
    attachmentPreviewUrl,
    acceptHtmlWarning,
    handleBack,
    updateStar,
    updateReaction,
    handleFork,
    handleShare,
    handleContribute,
    handleReviewContribution,
    submitComment,
    deleteComment,
    reactToComment,
    studyStatus,
    setStudyStatus,
    STUDY_STATUSES,
    handleSheetUpdate,
  } = useSheetViewer()

  const [reportOpen, setReportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('content')

  /* Refs for scroll-to-section navigation */
  const contentRef = useRef(null)
  const activityRef = useRef(null)
  const commentsRef = useRef(null)
  const relatedRef = useRef(null)

  const scrollToRef = (ref, tab) => {
    setActiveTab(tab)
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Navbar />
      <div style={{ background: 'var(--sh-bg)', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('reading', 26, 48)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.isCompact
                ? 'minmax(0, 1fr)'
                : layout.columns.readingThreeColumn,
              gap: 22,
              alignItems: 'start',
            }}
          >
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={{ display: 'grid', gap: 16 }}>
              <SheetHeader sheet={sheet} handleBack={handleBack} />

              {/* ── Navigation tab strip ──────────────────────────── */}
              {sheet && (
                <nav
                  style={{
                    display: 'flex', gap: 0, borderBottom: '2px solid var(--sh-border)',
                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                  }}
                  aria-label="Sheet sections"
                >
                  {[
                    { key: 'content', label: 'Content', ref: contentRef },
                    { key: 'activity', label: 'Activity', ref: activityRef },
                    { key: 'comments', label: `Comments${commentsState.total > 0 ? ` (${commentsState.total})` : ''}`, ref: commentsRef },
                    { key: 'related', label: `Related${relatedSheets.length > 0 ? ` (${relatedSheets.length})` : ''}`, ref: relatedRef },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => scrollToRef(tab.ref, tab.key)}
                      style={{
                        padding: '10px 18px', border: 'none', background: 'none',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                        color: activeTab === tab.key ? 'var(--sh-brand)' : 'var(--sh-muted)',
                        borderBottom: activeTab === tab.key ? '2px solid var(--sh-brand)' : '2px solid transparent',
                        marginBottom: -2, whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s',
                      }}
                      aria-current={activeTab === tab.key ? 'true' : undefined}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              )}

              {sheet && (
                <SheetActionsMenu
                  sheet={sheet}
                  user={user}
                  canEdit={canEdit}
                  isHtmlSheet={isHtmlSheet}
                  forking={forking}
                  studyStatus={studyStatus}
                  setStudyStatus={setStudyStatus}
                  STUDY_STATUSES={STUDY_STATUSES}
                  updateStar={updateStar}
                  updateReaction={updateReaction}
                  handleFork={handleFork}
                  handleShare={handleShare}
                  setShowContributeModal={setShowContributeModal}
                  setReportOpen={setReportOpen}
                  onSheetUpdate={handleSheetUpdate}
                />
              )}

              {errorBanner(sheetState.error)}

              {sheet && user && sheet.userId === user.id && (
                <ModerationBanner status={sheet.status === 'removed_by_moderation' ? 'confirmed_violation' : sheet.moderationStatus} />
              )}
              {sheet && sheet.status === 'pending_review' && user && sheet.userId === user.id && (
                <PendingReviewBanner />
              )}

              {/* ── Compact stats bar (mobile/tablet only) ───────── */}
              {layout.isCompact && sheet && (
                <div
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
                    padding: '12px 16px', borderRadius: 14,
                    background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
                    fontSize: 12, fontWeight: 600, color: 'var(--sh-subtext)',
                    alignItems: 'center',
                  }}
                >
                  <span>{sheet.stars || 0} stars</span>
                  <span>{sheet.forks || 0} forks</span>
                  <span>{sheet.commentCount || 0} comments</span>
                  <span>{sheet.downloads || 0} downloads</span>
                  {canEdit && (
                    <Link
                      to={`/sheets/${sheet.id}/lab`}
                      style={{ color: 'var(--sh-brand)', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}
                    >
                      View history
                    </Link>
                  )}
                </div>
              )}

              {/* ── README landing section ─────────────────────── */}
              {sheet && <SheetReadme sheet={sheet} readmeData={readmeData} />}

              <div ref={contentRef}>
                {sheetState.loading ? (
                  <SkeletonCard style={{ padding: '28px 24px' }} />
                ) : sheet ? (
                  <SheetContentPanel
                    sheet={sheet}
                    isHtmlSheet={isHtmlSheet}
                    previewMode={sheet.htmlWorkflow?.previewMode || 'interactive'}
                    canEdit={canEdit}
                    canToggleInteractive={canToggleInteractive}
                    htmlWarningAcked={htmlWarningAcked}
                    acceptHtmlWarning={acceptHtmlWarning}
                    safePreviewUrl={safePreviewUrl}
                    runtimeUrl={runtimeUrl}
                    previewLoading={previewLoading}
                    runtimeLoading={runtimeLoading}
                    viewerInteractive={viewerInteractive}
                    toggleViewerInteractive={toggleViewerInteractive}
                    sheetPanelRef={sheetPanelRef}
                  />
                ) : null}
              </div>

              {sheet && (
                <div ref={activityRef}>
                  <SheetActivityFeed sheetId={sheet.id} />
                </div>
              )}

              {errorBanner(commentsState.error)}

              <div ref={commentsRef}>
                <SheetCommentsPanel
                  user={user}
                  commentsState={commentsState}
                  commentDraft={commentDraft}
                  setCommentDraft={setCommentDraft}
                  commentSaving={commentSaving}
                  submitComment={submitComment}
                  deleteComment={deleteComment}
                  onReactToComment={reactToComment}
                />
              </div>

              <div ref={relatedRef}>
                <RelatedSheetsPanel sheet={sheet} relatedSheets={relatedSheets} />
              </div>
            </main>

            {/* Right sidebar — hidden on compact screens to avoid awkward stacking */}
            {!layout.isCompact && (
              <SheetViewerSidebar
                sheet={sheet}
                canEdit={canEdit}
                previewKind={previewKind}
                attachmentPreviewUrl={attachmentPreviewUrl}
                reviewingId={reviewingId}
                handleReviewContribution={handleReviewContribution}
              />
            )}
          </div>
        </div>
      </div>

      {/* Contribute-back modal — portaled to body for proper fixed positioning */}
      {showContributeModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', display: 'grid', placeItems: 'center',
          }}
          onClick={() => setShowContributeModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowContributeModal(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Contribute changes"
        >
          <div
            style={{
              background: 'var(--sh-surface)', borderRadius: 18, padding: '24px 18px', width: 'calc(100% - 32px)', maxWidth: 440, boxSizing: 'border-box',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: FONT,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--sh-heading)' }}>
              <IconGitPullRequest size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Contribute Changes Back
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--sh-subtext)', fontSize: 13, lineHeight: 1.6 }}>
              Submit your changes to the original author for review. They can accept or reject your contribution.
            </p>
            <textarea
              value={contributeMessage}
              onChange={(e) => setContributeMessage(e.target.value)}
              placeholder="Describe what you changed and why (optional)..."
              rows={3}
              maxLength={500}
              style={{
                width: '100%', resize: 'vertical', borderRadius: 12, border: '1px solid var(--sh-input-border)',
                padding: 12, fontSize: 13, fontFamily: 'inherit', marginBottom: 16,
                background: 'var(--sh-input-bg)', color: 'var(--sh-input-text)',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowContributeModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid var(--sh-btn-secondary-border)',
                  background: 'var(--sh-btn-secondary-bg)', color: 'var(--sh-btn-secondary-text)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContribute}
                disabled={contributing}
                style={{
                  padding: '8px 18px', borderRadius: 10, border: 'none',
                  background: contributing ? 'var(--sh-success-border)' : 'var(--sh-success)', color: 'var(--sh-btn-primary-text)',
                  fontSize: 13, fontWeight: 700, cursor: contributing ? 'wait' : 'pointer',
                  fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <IconGitPullRequest size={13} />
                {contributing ? 'Submitting...' : 'Submit Contribution'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <SafeJoyride {...tutorial.joyrideProps} />
      {sheet && <ReportModal open={reportOpen} targetType="sheet" targetId={sheet.id} onClose={() => setReportOpen(false)} />}
    </>
  )
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Navbar from '../../components/Navbar'
import ReportModal from '../../components/ReportModal'
import ModerationBanner from '../../components/ModerationBanner'
import PendingReviewBanner from '../../components/PendingReviewBanner'
import AppSidebar from '../../components/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import { SkeletonCard } from '../../components/Skeleton'
import { IconGitPullRequest } from '../../components/Icons'
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { VIEWER_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import useSheetViewer from './useSheetViewer'
import SheetViewerSidebar from './SheetViewerSidebar'
import SheetHeader from './SheetHeader'
import SheetActionsMenu from './SheetActionsMenu'
import SheetContentPanel from './SheetContentPanel'
import SheetCommentsPanel from './SheetCommentsPanel'
import RelatedSheetsPanel from './RelatedSheetsPanel'
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
    sheetPanelRef,
    canEdit,
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
    studyStatus,
    setStudyStatus,
    STUDY_STATUSES,
  } = useSheetViewer()

  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
      <Navbar />
      <div style={{ background: 'var(--sh-bg)', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('reading', 26, 48)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.columns.readingThreeColumn,
              gap: 22,
              alignItems: 'start',
            }}
          >
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={{ display: 'grid', gap: 16 }}>
              <SheetHeader sheet={sheet} handleBack={handleBack} />

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
                />
              )}

              {errorBanner(sheetState.error)}

              {sheet && user && sheet.userId === user.id && (
                <ModerationBanner status={sheet.status === 'removed_by_moderation' ? 'confirmed_violation' : sheet.moderationStatus} />
              )}
              {sheet && sheet.status === 'pending_review' && user && sheet.userId === user.id && (
                <PendingReviewBanner />
              )}

              {sheetState.loading ? (
                <SkeletonCard style={{ padding: '28px 24px' }} />
              ) : sheet ? (
                <SheetContentPanel
                  sheet={sheet}
                  isHtmlSheet={isHtmlSheet}
                  previewMode={sheet.htmlWorkflow?.previewMode || 'interactive'}
                  canEdit={canEdit}
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

              {errorBanner(commentsState.error)}

              <SheetCommentsPanel
                user={user}
                commentsState={commentsState}
                commentDraft={commentDraft}
                setCommentDraft={setCommentDraft}
                commentSaving={commentSaving}
                submitComment={submitComment}
                deleteComment={deleteComment}
              />

              <RelatedSheetsPanel sheet={sheet} relatedSheets={relatedSheets} />
            </main>

            <SheetViewerSidebar
              sheet={sheet}
              canEdit={canEdit}
              previewKind={previewKind}
              attachmentPreviewUrl={attachmentPreviewUrl}
              reviewingId={reviewingId}
              handleReviewContribution={handleReviewContribution}
            />
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
        >
          <div
            style={{
              background: 'var(--sh-surface)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440,
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

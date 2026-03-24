import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import { SkeletonCard } from '../../components/Skeleton'
import MentionText from '../../components/MentionText'
import {
  IconArrowLeft,
  IconDownload,
  IconEye,
  IconFork,
  IconGitPullRequest,
  IconStar,
  IconStarFilled,
} from '../../components/Icons'
import { API } from '../../config'
import { useResponsiveAppLayout, pageShell } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { VIEWER_STEPS } from '../../lib/tutorialSteps'
import useSheetViewer from './useSheetViewer'
import SheetViewerSidebar from './SheetViewerSidebar'
import { FONT, panelStyle, actionButton, linkButton, errorBanner, timeAgo } from './sheetViewerConstants'

export default function SheetViewerPage() {
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('viewer', VIEWER_STEPS)

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
    runtimeUrl,
    runtimeLoading,
    htmlWarningAcked,
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
  } = useSheetViewer()

  const previewMode = sheet?.htmlWorkflow?.previewMode || 'interactive'

  return (
    <>
      <Navbar />
      <div style={{ background: '#edf0f5', minHeight: '100vh', fontFamily: FONT }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleBack} style={actionButton('#475569')}>
                  <IconArrowLeft size={14} />
                  Back
                </button>
                {sheet ? (
                  <div data-tutorial="viewer-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? '#f59e0b' : '#475569')}>
                      {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                      {sheet.stars || 0}
                    </button>
                    <button type="button" onClick={handleShare} style={actionButton('#0891b2')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      Share
                    </button>
                    <button type="button" onClick={() => updateReaction('like')} style={actionButton(sheet.reactions?.userReaction === 'like' ? '#16a34a' : '#475569')}>
                      Helpful {sheet.reactions?.likes || 0}
                    </button>
                    <button type="button" onClick={() => updateReaction('dislike')} style={actionButton(sheet.reactions?.userReaction === 'dislike' ? '#dc2626' : '#475569')}>
                      Needs work {sheet.reactions?.dislikes || 0}
                    </button>
                    {sheet.hasAttachment ? (
                      <Link to={`/preview/sheet/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Preview attachment
                      </Link>
                    ) : null}
                    {isHtmlSheet && (sheet.status !== 'pending_review' || canEdit) ? (
                      <Link to={`/sheets/preview/html/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Open sandbox preview
                      </Link>
                    ) : null}
                    {sheet.allowDownloads === false ? null : (
                      <a href={`${API}/api/sheets/${sheet.id}/download`} style={linkButton()}>
                        <IconDownload size={14} />
                        Download
                      </a>
                    )}
                    {canEdit ? (
                      <Link to={`/sheets/${sheet.id}/edit`} style={linkButton()}>
                        Edit
                      </Link>
                    ) : null}
                    {user ? (
                      <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
                        Sheet Lab
                      </Link>
                    ) : null}
                    {user && sheet.userId !== user.id ? (
                      <button type="button" onClick={handleFork} disabled={forking} style={actionButton('#6366f1')}>
                        <IconFork size={13} />
                        {forking ? 'Forking…' : 'Fork'}
                      </button>
                    ) : null}
                    {user && sheet.forkOf && sheet.userId === user.id ? (
                      <button type="button" onClick={() => setShowContributeModal(true)} style={actionButton('#059669')}>
                        <IconGitPullRequest size={13} />
                        Contribute Back
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {errorBanner(sheetState.error)}

              {sheetState.loading ? (
                <SkeletonCard style={{ padding: '28px 24px' }} />
              ) : sheet ? (
                <section ref={sheetPanelRef} data-tutorial="viewer-content" style={panelStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>{sheet.title}</h1>
                      <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                        by {sheet.author?.username || 'Unknown'} • {sheet.course?.code || 'General'} • updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
                      </div>
                      {isHtmlSheet ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                            HTML sheet
                          </span>
                          {previewMode === 'safe' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-warning)', background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)', borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' }}>
                              Flagged
                            </span>
                          ) : previewMode === 'restricted' || previewMode === 'disabled' || sheet.status === 'pending_review' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-warning-text)', background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)', borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' }}>
                              Pending Review
                            </span>
                          ) : null}
                          {previewMode !== 'interactive' && sheet.htmlWorkflow?.riskSummary && (
                            <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600 }}>
                              {sheet.htmlWorkflow.riskSummary}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {sheet.forkSource ? (
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: '#475569', fontSize: 12 }}>
                        <IconFork size={13} />
                        Forked from {sheet.forkSource.title}
                      </div>
                    ) : null}
                  </div>

                  {sheet.description ? (
                    <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14, lineHeight: 1.7 }}>{sheet.description}</p>
                  ) : null}

                  {isHtmlSheet ? (
                    previewMode === 'disabled' ? (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-danger)', marginBottom: 8 }}>Quarantined</div>
                        <div style={{ fontSize: 13, color: 'var(--sh-danger)', lineHeight: 1.6 }}>
                          This sheet has been quarantined because our scanner detected a security risk. Preview is disabled. If you believe this is an error, contact support.
                        </div>
                      </div>
                    ) : previewMode === 'restricted' && !canEdit ? (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-warning-border)', background: 'var(--sh-warning-bg)', padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sh-warning-text)', marginBottom: 8 }}>Pending Safety Review</div>
                        <div style={{ fontSize: 13, color: 'var(--sh-warning-text)', lineHeight: 1.6 }}>
                          This sheet is awaiting admin review. The preview is disabled until it has been approved.
                        </div>
                      </div>
                    ) : !htmlWarningAcked ? (
                      <div
                        style={{
                          borderRadius: 16,
                          border: previewMode !== 'interactive' ? '1px solid var(--sh-warning-border)' : '1px solid var(--sh-border)',
                          background: previewMode !== 'interactive' ? 'var(--sh-warning-bg)' : 'var(--sh-soft)',
                          padding: 24,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 800, color: previewMode !== 'interactive' ? 'var(--sh-warning-text)' : 'var(--sh-heading)', marginBottom: 8 }}>
                          {previewMode !== 'interactive' ? 'Flagged HTML Sheet' : 'Interactive HTML Sheet'}
                        </div>
                        <div style={{ fontSize: 13, color: previewMode !== 'interactive' ? 'var(--sh-warning-text)' : 'var(--sh-subtext)', lineHeight: 1.6, marginBottom: 16 }}>
                          {previewMode !== 'interactive'
                            ? 'This sheet contains flagged HTML features. Scripts are disabled in the preview. It runs in a secure sandbox with no network access.'
                            : 'This sheet contains HTML with scripts. It runs in a secure sandbox with no network access, no popups, and no access to your session. Click below to load it.'}
                        </div>
                        <button
                          type="button"
                          onClick={acceptHtmlWarning}
                          style={{
                            padding: '9px 20px',
                            borderRadius: 10,
                            border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          {previewMode !== 'interactive' ? 'Load safe preview' : 'Load interactive sheet'}
                        </button>
                      </div>
                    ) : runtimeLoading ? (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-border)', padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>Loading {previewMode !== 'interactive' ? 'safe preview' : 'interactive sheet'}…</div>
                      </div>
                    ) : runtimeUrl ? (
                      <div
                        style={{
                          borderRadius: 16,
                          border: '1px solid var(--sh-border)',
                          overflow: 'hidden',
                          background: 'var(--sh-surface)',
                        }}
                      >
                        <iframe
                          title={`sheet-html-${sheet.id}`}
                          sandbox={previewMode !== 'interactive' ? '' : 'allow-scripts'}
                          referrerPolicy="no-referrer"
                          src={runtimeUrl}
                          style={{ width: '100%', minHeight: 560, border: 'none' }}
                        />
                      </div>
                    ) : (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', padding: 18 }}>
                        <div style={{ fontSize: 13, color: 'var(--sh-danger)' }}>Could not load the interactive sheet runtime.</div>
                      </div>
                    )
                  ) : (
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        padding: 18,
                        color: '#1e293b',
                        fontSize: 14,
                        lineHeight: 1.8,
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                      }}
                    >
                      {sheet.content}
                    </div>
                  )}
                </section>
              ) : null}

              {errorBanner(commentsState.error)}

              <section data-tutorial="viewer-comments" style={panelStyle()}>
                <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Comments</h2>
                <form onSubmit={submitComment} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Add a comment or @mention a classmate."
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 12,
                      border: '1px solid #cbd5e1',
                      padding: 12,
                      font: 'inherit',
                    }}
                  />
                  <div>
                    <button
                      type="submit"
                      disabled={commentSaving}
                      style={{
                        borderRadius: 10,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 13,
                        padding: '10px 14px',
                        cursor: commentSaving ? 'wait' : 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      {commentSaving ? 'Posting...' : 'Post comment'}
                    </button>
                  </div>
                </form>

                {commentsState.loading ? (
                  <div style={{ color: '#64748b', fontSize: 14 }}>Loading comments...</div>
                ) : commentsState.comments.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No comments yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {commentsState.comments.map((comment) => (
                      <div key={comment.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                          <Link to={`/users/${comment.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
                            {comment.author?.username || 'Unknown'}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(comment.createdAt)}</span>
                            {user && (user.id === comment.author?.id || user.role === 'admin') ? (
                              <button
                                type="button"
                                onClick={() => deleteComment(comment.id)}
                                style={{
                                  padding: '2px 8px', borderRadius: 6, border: '1px solid #fecaca',
                                  background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: FONT,
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          <MentionText text={comment.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
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

      {/* ── Contribute-back modal ────────────────────────────────────── */}
      {showContributeModal ? (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', display: 'grid', placeItems: 'center',
          }}
          onClick={() => setShowContributeModal(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: FONT,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#0f172a' }}>
              <IconGitPullRequest size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Contribute Changes Back
            </h2>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Submit your changes to the original author for review. They can accept or reject your contribution.
            </p>
            <textarea
              value={contributeMessage}
              onChange={(e) => setContributeMessage(e.target.value)}
              placeholder="Describe what you changed and why (optional)…"
              rows={3}
              maxLength={500}
              style={{
                width: '100%', resize: 'vertical', borderRadius: 12, border: '1px solid #cbd5e1',
                padding: 12, fontSize: 13, fontFamily: 'inherit', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowContributeModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid #cbd5e1',
                  background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
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
                  background: contributing ? '#86efac' : '#059669', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: contributing ? 'wait' : 'pointer',
                  fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <IconGitPullRequest size={13} />
                {contributing ? 'Submitting…' : 'Submit Contribution'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SafeJoyride {...tutorial.joyrideProps} />
    </>
  )
}

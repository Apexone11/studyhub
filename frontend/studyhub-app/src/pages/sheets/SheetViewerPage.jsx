import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import ReportModal from '../../components/ReportModal'
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

  const previewMode = sheet?.htmlWorkflow?.previewMode || 'interactive'
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleBack} style={actionButton('var(--sh-slate-600)')}>
                  <IconArrowLeft size={14} />
                  Back
                </button>
                {sheet ? (
                  <div data-tutorial="viewer-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? 'var(--sh-warning)' : 'var(--sh-slate-600)')}>
                      {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                      {sheet.stars || 0}
                    </button>
                    <button type="button" onClick={handleShare} style={actionButton('var(--sh-info-text)')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      Share
                    </button>
                    <button type="button" onClick={() => updateReaction('like')} style={actionButton(sheet.reactions?.userReaction === 'like' ? 'var(--sh-success)' : 'var(--sh-slate-600)')}>
                      Helpful {sheet.reactions?.likes || 0}
                    </button>
                    <button type="button" onClick={() => updateReaction('dislike')} style={actionButton(sheet.reactions?.userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-slate-600)')}>
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
                      <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
                        Edit in SheetLab
                      </Link>
                    ) : user && sheet.userId !== user.id ? (
                      <button type="button" onClick={handleFork} disabled={forking} style={actionButton('var(--sh-brand)')}>
                        <IconFork size={13} />
                        {forking ? 'Forking...' : 'Make your own copy'}
                      </button>
                    ) : null}
                    {user && sheet.forkOf && sheet.userId === user.id ? (
                      <button type="button" onClick={() => setShowContributeModal(true)} style={actionButton('var(--sh-success)')}>
                        <IconGitPullRequest size={13} />
                        Contribute Back
                      </button>
                    ) : null}
                    {user ? (
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() => setStatusMenuOpen((prev) => !prev)}
                          style={actionButton(studyStatus ? STUDY_STATUSES.find((s) => s.value === studyStatus)?.color || 'var(--sh-slate-600)' : 'var(--sh-slate-600)')}
                        >
                          {studyStatus ? STUDY_STATUSES.find((s) => s.value === studyStatus)?.label : 'Mark status'}
                        </button>
                        {statusMenuOpen ? (
                          <div
                            style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: 4,
                              background: 'var(--sh-surface)',
                              border: '1px solid var(--sh-border)',
                              borderRadius: 10,
                              boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                              padding: 4,
                              zIndex: 20,
                              minWidth: 140,
                            }}
                          >
                            {STUDY_STATUSES.map((s) => (
                              <button
                                key={s.value}
                                type="button"
                                onClick={() => { setStudyStatus(studyStatus === s.value ? null : s.value, sheet); setStatusMenuOpen(false) }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  width: '100%',
                                  padding: '8px 10px',
                                  border: 'none',
                                  borderRadius: 8,
                                  background: studyStatus === s.value ? 'var(--sh-soft)' : 'transparent',
                                  color: 'var(--sh-heading)',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                {s.label}
                                {studyStatus === s.value ? ' ✓' : ''}
                              </button>
                            ))}
                            {studyStatus ? (
                              <button
                                type="button"
                                onClick={() => { setStudyStatus(null, sheet); setStatusMenuOpen(false) }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '8px 10px',
                                  border: 'none',
                                  borderRadius: 8,
                                  borderTop: '1px solid var(--sh-border)',
                                  background: 'transparent',
                                  color: 'var(--sh-muted)',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  textAlign: 'left',
                                  marginTop: 2,
                                }}
                              >
                                Clear status
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {user && sheet.userId !== user.id ? (
                      <button type="button" onClick={() => setReportOpen(true)} style={actionButton('var(--sh-warning-text)')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                        Report
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
                      <h1 style={{ margin: 0, fontSize: 30, color: 'var(--sh-heading)' }}>{sheet.title}</h1>
                      <div style={{ marginTop: 6, color: 'var(--sh-subtext)', fontSize: 13 }}>
                        by {sheet.author?.username || 'Unknown'} • {sheet.course?.code || 'General'} • updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
                      </div>
                      {isHtmlSheet ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sh-brand-hover)', textTransform: 'uppercase' }}>
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
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--sh-subtext)', fontSize: 12, flexWrap: 'wrap' }}>
                        <IconFork size={13} />
                        Forked from{' '}
                        <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
                          {sheet.forkSource.title}
                        </Link>
                        {sheet.forkSource.author ? (
                          <span>
                            by{' '}
                            <Link to={`/users/${sheet.forkSource.author.username}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
                              {sheet.forkSource.author.username}
                            </Link>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {sheet.description ? (
                    <p style={{ margin: '0 0 16px', color: 'var(--sh-subtext)', fontSize: 14, lineHeight: 1.7 }}>{sheet.description}</p>
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
                            background: 'var(--sh-btn-primary-bg)',
                            color: 'var(--sh-btn-primary-text)',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          {previewMode !== 'interactive' ? 'Load safe preview' : 'Load preview'}
                        </button>
                      </div>
                    ) : previewLoading || (viewerInteractive && runtimeLoading) ? (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-border)', padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: 'var(--sh-subtext)' }}>Loading {viewerInteractive ? 'interactive preview' : 'safe preview'}…</div>
                      </div>
                    ) : safePreviewUrl ? (
                      <div
                        style={{
                          borderRadius: 16,
                          border: '1px solid var(--sh-border)',
                          overflow: 'hidden',
                          background: 'var(--sh-surface)',
                        }}
                      >
                        {canEdit && previewMode === 'interactive' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--sh-border)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--sh-border)' }}>
                              <button
                                type="button"
                                onClick={() => viewerInteractive && toggleViewerInteractive()}
                                style={{
                                  padding: '4px 12px', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                                  background: !viewerInteractive ? 'var(--sh-brand)' : 'var(--sh-soft)',
                                  color: !viewerInteractive ? '#fff' : 'var(--sh-subtext)',
                                }}
                              >
                                Safe
                              </button>
                              <button
                                type="button"
                                onClick={() => !viewerInteractive && toggleViewerInteractive()}
                                style={{
                                  padding: '4px 12px', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                                  background: viewerInteractive ? 'var(--sh-brand)' : 'var(--sh-soft)',
                                  color: viewerInteractive ? '#fff' : 'var(--sh-subtext)',
                                }}
                              >
                                Interactive
                              </button>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--sh-muted)', lineHeight: 1.3 }}>
                              {viewerInteractive
                                ? 'Scripts enabled in a locked sandbox — no access to your account or network.'
                                : 'Scripts disabled for maximum security.'}
                            </span>
                          </div>
                        ) : null}
                        <iframe
                          title={`sheet-html-${sheet.id}`}
                          sandbox={viewerInteractive && runtimeUrl ? 'allow-scripts allow-forms' : ''}
                          referrerPolicy="no-referrer"
                          src={viewerInteractive && runtimeUrl ? runtimeUrl : safePreviewUrl}
                          style={{ width: '100%', minHeight: 560, border: 'none' }}
                        />
                      </div>
                    ) : (
                      <div style={{ borderRadius: 16, border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg)', padding: 18 }}>
                        <div style={{ fontSize: 13, color: 'var(--sh-danger)' }}>Could not load the sheet preview.</div>
                      </div>
                    )
                  ) : (
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid var(--sh-border)',
                        background: 'var(--sh-soft)',
                        padding: 18,
                        color: 'var(--sh-text)',
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
                <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>
                  Comments{commentsState.total > 0 ? ` (${commentsState.total})` : ''}
                </h2>
                <form onSubmit={submitComment} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Share a clarification, correction, or study tip…"
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 12,
                      border: '1px solid var(--sh-input-border)',
                      padding: 12,
                      font: 'inherit',
                      background: 'var(--sh-input-bg)',
                      color: 'var(--sh-input-text)',
                    }}
                  />
                  <div>
                    <button
                      type="submit"
                      disabled={commentSaving}
                      style={{
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--sh-btn-primary-bg)',
                        color: 'var(--sh-btn-primary-text)',
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
                  <SkeletonCard style={{ padding: 16, minHeight: 60 }} />
                ) : commentsState.comments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>No comments yet</div>
                    <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
                      Be the first to leave feedback — corrections, study tips, and clarifications help everyone.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {commentsState.comments.map((comment) => (
                      <div key={comment.id} style={{ borderTop: '1px solid var(--sh-soft)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                          <Link to={`/users/${comment.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}>
                            {comment.author?.username || 'Unknown'}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{timeAgo(comment.createdAt)}</span>
                            {user && (user.id === comment.author?.id || user.role === 'admin') ? (
                              <button
                                type="button"
                                onClick={() => deleteComment(comment.id)}
                                style={{
                                  padding: '2px 8px', borderRadius: 6, border: '1px solid var(--sh-danger-border)',
                                  background: 'var(--sh-surface)', color: 'var(--sh-danger)', fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: FONT,
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          <MentionText text={comment.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Related sheets / continue learning ─────────────────── */}
              {relatedSheets.length > 0 ? (
                <section style={panelStyle()}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>
                    {sheet?.course?.code ? `More from ${sheet.course.code}` : 'Related sheets'}
                  </h2>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {relatedSheets.map((related) => (
                      <Link
                        key={related.id}
                        to={`/sheets/${related.id}`}
                        style={{
                          display: 'block',
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid var(--sh-border)',
                          background: 'var(--sh-soft)',
                          textDecoration: 'none',
                          color: 'var(--sh-text)',
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)', marginBottom: 2 }}>
                          {related.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sh-muted)', display: 'flex', gap: 12 }}>
                          <span>by {related.author?.username || 'Unknown'}</span>
                          <span>{related.stars || 0} stars</span>
                          {related.forks > 0 ? <span>{related.forks} forks</span> : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                  {sheet?.course?.id ? (
                    <div style={{ marginTop: 12 }}>
                      <Link
                        to={`/sheets?courseId=${sheet.course.id}`}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-brand)', textDecoration: 'none' }}
                      >
                        Browse all {sheet.course.code} sheets →
                      </Link>
                    </div>
                  ) : null}
                </section>
              ) : null}
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
              placeholder="Describe what you changed and why (optional)…"
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
                {contributing ? 'Submitting…' : 'Submit Contribution'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SafeJoyride {...tutorial.joyrideProps} />
      {sheet && <ReportModal open={reportOpen} targetType="sheet" targetId={sheet.id} onClose={() => setReportOpen(false)} />}
    </>
  )
}

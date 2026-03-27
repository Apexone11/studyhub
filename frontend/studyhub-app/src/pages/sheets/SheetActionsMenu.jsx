import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  IconStar,
  IconStarFilled,
  IconFork,
  IconGitPullRequest,
  IconMoreHorizontal,
  IconDownload,
  IconEye,
} from '../../components/Icons'
import { API } from '../../config'
import { FONT, actionButton, linkButton, secondaryDropdown, dropdownItem } from './sheetViewerConstants'

export default function SheetActionsMenu({
  sheet,
  user,
  canEdit,
  isHtmlSheet,
  forking,
  studyStatus,
  setStudyStatus,
  STUDY_STATUSES,
  updateStar,
  updateReaction,
  handleFork,
  handleShare,
  setShowContributeModal,
  setReportOpen,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  if (!sheet) return null

  return (
    <div data-tutorial="viewer-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Primary actions */}
      <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? 'var(--sh-warning)' : 'var(--sh-slate-600)')}>
        {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        {sheet.stars || 0}
      </button>

      {canEdit ? (
        <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
          Edit in SheetLab
        </Link>
      ) : user && sheet.userId !== user.id ? (
        <button type="button" onClick={handleFork} disabled={forking} style={actionButton('var(--sh-brand)')}>
          <IconFork size={13} />
          {forking ? 'Forking...' : 'Fork'}
        </button>
      ) : null}

      {user && sheet.forkOf && sheet.userId === user.id && (
        <button type="button" onClick={() => setShowContributeModal(true)} style={actionButton('var(--sh-success)')}>
          <IconGitPullRequest size={13} />
          Contribute
        </button>
      )}

      {/* Secondary actions dropdown */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{ ...actionButton('var(--sh-slate-600)'), padding: '6px 8px' }}
          aria-label="More actions"
        >
          <IconMoreHorizontal size={16} />
        </button>

        {menuOpen && (
          <div style={secondaryDropdown()}>
            <button type="button" onClick={() => { handleShare(); setMenuOpen(false) }} style={dropdownItem()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>

            {sheet.allowDownloads !== false && (
              <a href={`${API}/api/sheets/${sheet.id}/download`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconDownload size={14} />
                Download
              </a>
            )}

            {sheet.hasAttachment && (
              <Link to={`/preview/sheet/${sheet.id}`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconEye size={14} />
                Preview attachment
              </Link>
            )}

            {isHtmlSheet && (sheet.status !== 'pending_review' || canEdit) && (
              <Link to={`/sheets/preview/html/${sheet.id}`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconEye size={14} />
                Open sandbox preview
              </Link>
            )}

            <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />

            <button
              type="button"
              onClick={() => { updateReaction('like'); setMenuOpen(false) }}
              style={{ ...dropdownItem(), color: sheet.reactions?.userReaction === 'like' ? 'var(--sh-success)' : 'var(--sh-text)' }}
            >
              <span style={{ fontSize: 14 }}>👍</span>
              Helpful {sheet.reactions?.likes || 0}
            </button>
            <button
              type="button"
              onClick={() => { updateReaction('dislike'); setMenuOpen(false) }}
              style={{ ...dropdownItem(), color: sheet.reactions?.userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-text)' }}
            >
              <span style={{ fontSize: 14 }}>👎</span>
              Needs work {sheet.reactions?.dislikes || 0}
            </button>

            <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />

            {/* Study status section */}
            {user && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Study status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STUDY_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => { setStudyStatus(studyStatus === s.value ? null : s.value, sheet); setMenuOpen(false) }}
                      style={{
                        padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: FONT,
                        background: studyStatus === s.value ? s.color : 'var(--sh-soft)',
                        color: studyStatus === s.value ? '#fff' : 'var(--sh-text)',
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {user && sheet.userId !== user.id && (
              <>
                <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => { setReportOpen(true); setMenuOpen(false) }}
                  style={{ ...dropdownItem(), color: 'var(--sh-danger)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                  Report
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline helpful/needs-work summary (read-only) */}
      {(sheet.reactions?.likes > 0 || sheet.reactions?.dislikes > 0) && (
        <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600, display: 'flex', gap: 8 }}>
          {sheet.reactions.likes > 0 && <span>👍 {sheet.reactions.likes}</span>}
          {sheet.reactions.dislikes > 0 && <span>👎 {sheet.reactions.dislikes}</span>}
        </span>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import {
  IconArrowLeft,
  IconDownload,
  IconEye,
  IconFork,
  IconStar,
  IconStarFilled,
} from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function attachmentExtension(name = '') {
  const dotIndex = String(name).lastIndexOf('.')
  if (dotIndex < 0) return ''
  return String(name).slice(dotIndex + 1).toLowerCase()
}

function attachmentPreviewKind(attachmentType, attachmentName) {
  const normalized = String(attachmentType || '').toLowerCase()
  const extension = attachmentExtension(attachmentName)
  if (normalized === 'pdf' || extension === 'pdf') return 'pdf'
  if (normalized === 'image' || normalized.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  return 'document'
}

function panelStyle() {
  return {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    padding: 18,
  }
}

function actionButton(color = '#475569') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function errorBanner(message) {
  if (!message) return null
  return (
    <div
      style={{
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: 14,
        padding: '12px 14px',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  )
}

function ContributionList({ title, items }) {
  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>{title}</h2>
      {items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>No contributions yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {item.forkSheet?.title || 'Contribution'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>
                  {item.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                {item.proposer?.username ? `Proposed by ${item.proposer.username}. ` : ''}
                {item.message || 'No message included.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function SheetViewerPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [sheetState, setSheetState] = useState({ sheet: null, loading: true, error: '' })
  const [commentsState, setCommentsState] = useState({ comments: [], total: 0, loading: true, error: '' })
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  const sheetId = Number.parseInt(id, 10)

  useEffect(() => {
    if (Number.isInteger(sheetId)) return
    setSheetState({ sheet: null, loading: false, error: 'Invalid sheet ID.' })
    setCommentsState({ comments: [], total: 0, loading: false, error: '' })
  }, [sheetId])

  const loadSheet = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}`, {
        headers: authHeaders(),
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        apply(() => setSheetState({
          sheet: null,
          loading: false,
          error: getApiErrorMessage(data, 'You do not have access to this sheet.'),
        }))
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load this sheet.'))
      }

      apply(() => setSheetState({ sheet: data, loading: false, error: '' }))
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => setSheetState({ sheet: null, loading: false, error: error.message || 'Could not load this sheet.' }))
    }
  }, [clearSession, navigate, sheetId])

  const loadComments = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments?limit=20`, {
        headers: authHeaders(),
        signal,
      })
      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        apply(() => {
          setCommentsState((current) => ({
            ...current,
            loading: false,
            error: getApiErrorMessage(data, 'You do not have access to these comments.'),
          }))
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load comments.'))
      }
      apply(() => {
        setCommentsState({
          comments: Array.isArray(data.comments) ? data.comments : [],
          total: data.total || 0,
          loading: false,
          error: '',
        })
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => {
        setCommentsState({ comments: [], total: 0, loading: false, error: error.message || 'Could not load comments.' })
      })
    }
  }, [sheetId])

  useLivePolling(loadSheet, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 45000,
  })

  useLivePolling(loadComments, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 60000,
  })

  const { sheet } = sheetState
  const canEdit = useMemo(() => user && sheet && (user.role === 'admin' || user.id === sheet.userId), [sheet, user])
  const isHtmlSheet = sheet?.contentFormat === 'html'
  const previewKind = attachmentPreviewKind(sheet?.attachmentType, sheet?.attachmentName)
  const attachmentPreviewUrl = sheet?.id ? `${API}/api/sheets/${sheet.id}/attachment/preview` : ''

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/sheets', { replace: true })
  }

  const updateStar = async () => {
    if (!sheet) return
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the star.')
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, starred: data.starred, stars: data.stars } : current.sheet,
        error: '',
      }))
    } catch (error) {
      setSheetState((current) => ({ ...current, error: error.message || 'Could not update the star.' }))
    }
  }

  const updateReaction = async (type) => {
    if (!sheet) return
    const nextType = sheet.reactions?.userReaction === type ? null : type
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/react`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: nextType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the reaction.')
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, reactions: data } : current.sheet,
        error: '',
      }))
    } catch (error) {
      setSheetState((current) => ({ ...current, error: error.message || 'Could not update the reaction.' }))
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!commentDraft.trim()) return

    setCommentSaving(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: commentDraft.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not post the comment.')
      }

      setCommentDraft('')
      setCommentsState((current) => ({
        ...current,
        comments: [data, ...current.comments],
        total: current.total + 1,
        error: '',
      }))
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, commentCount: (current.sheet.commentCount || 0) + 1 } : current.sheet,
      }))
    } catch (error) {
      setCommentsState((current) => ({ ...current, error: error.message || 'Could not post the comment.' }))
    } finally {
      setCommentSaving(false)
    }
  }

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

            <main style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleBack} style={actionButton('#475569')}>
                  <IconArrowLeft size={14} />
                  Back
                </button>
                {sheet ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? '#f59e0b' : '#475569')}>
                      {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                      {sheet.stars || 0}
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
                    {isHtmlSheet ? (
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
                  </div>
                ) : null}
              </div>

              {errorBanner(sheetState.error)}

              {sheetState.loading ? (
                <section style={panelStyle()}>
                  <div style={{ color: '#64748b', fontSize: 14 }}>Loading sheet...</div>
                </section>
              ) : sheet ? (
                <section style={panelStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>{sheet.title}</h1>
                      <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                        by {sheet.author?.username || 'Unknown'} • {sheet.course?.code || 'General'} • updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
                      </div>
                      {isHtmlSheet ? (
                        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                          HTML sheet
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
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        background: '#fff',
                      }}
                    >
                      <iframe
                        title={`sheet-html-${sheet.id}`}
                        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
                        srcDoc={sheet.content || ''}
                        style={{ width: '100%', minHeight: 560, border: 'none' }}
                      />
                    </div>
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

              <section style={panelStyle()}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{comment.author?.username || 'Unknown'}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(comment.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {comment.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </main>

            <aside style={{ display: 'grid', gap: 16 }}>
              {sheet ? (
                <section style={panelStyle()}>
                  <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>Sheet stats</h2>
                  <div style={{ display: 'grid', gap: 10, color: '#64748b', fontSize: 13 }}>
                    <div>{sheet.stars || 0} stars</div>
                    <div>{sheet.commentCount || 0} comments</div>
                    <div>{sheet.downloads || 0} downloads</div>
                    <div>{sheet.forks || 0} forks</div>
                    {sheet.allowDownloads === false ? <div>Downloads disabled</div> : null}
                    {sheet.hasAttachment ? (
                      <Link to={`/preview/sheet/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Full preview
                      </Link>
                    ) : null}
                    {sheet.hasAttachment && sheet.allowDownloads !== false ? (
                      <a href={`${API}/api/sheets/${sheet.id}/attachment`} style={linkButton()}>
                        <IconDownload size={14} />
                        Download attachment
                      </a>
                    ) : null}
                  </div>
                  {sheet.hasAttachment ? (
                    <div
                      style={{
                        marginTop: 12,
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#fff',
                      }}
                    >
                      {previewKind === 'image' ? (
                        <img
                          src={attachmentPreviewUrl}
                          alt={sheet.attachmentName || 'Attachment preview'}
                          style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }}
                        />
                      ) : (
                        <iframe
                          src={attachmentPreviewUrl}
                          title={`Sheet attachment preview ${sheet.id}`}
                          loading="lazy"
                          style={{ width: '100%', height: 220, border: 'none' }}
                        />
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {sheet?.incomingContributions ? (
                <ContributionList title="Incoming contributions" items={sheet.incomingContributions} />
              ) : null}
              {sheet?.outgoingContributions ? (
                <ContributionList title="Outgoing contributions" items={sheet.outgoingContributions} />
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}

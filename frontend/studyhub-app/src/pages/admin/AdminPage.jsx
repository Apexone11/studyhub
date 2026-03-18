import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import { API, SUPPORT_EMAIL } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const PAGE_SIZE = 20

const TABS = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['sheets', 'Sheets'],
  ['sheet-reviews', 'Sheet Reviews'],
  ['announcements', 'Announcements'],
  ['deletion-reasons', 'Deletion Reasons'],
  ['email-suppressions', 'Email Suppressions'],
  ['settings', 'Admin Settings'],
]

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function createPageState() {
  return {
    loading: false,
    loaded: false,
    error: '',
    page: 1,
    total: 0,
    items: [],
  }
}

function createAuditState() {
  return {
    loading: false,
    loaded: false,
    error: '',
    page: 1,
    total: 0,
    entries: [],
    suppression: null,
    suppressionId: null,
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

function formatLabel(value, fallback = 'Unknown') {
  const normalized = String(value || '').replace(/[_-]/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function StatsGrid({ stats }) {
  const cards = [
    ['Users', stats.totalUsers, '#2563eb'],
    ['Sheets', stats.totalSheets, '#059669'],
    ['Comments', stats.totalComments, '#7c3aed'],
    ['Flagged Requests', stats.flaggedRequests, '#dc2626'],
    ['Stars', stats.totalStars, '#f59e0b'],
    ['Notes', stats.totalNotes, '#0f766e'],
    ['Follows', stats.totalFollows, '#475569'],
    ['Reactions', stats.totalReactions, '#db2777'],
  ]

  return (
    <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
      {cards.map(([label, value, tone]) => (
        <div
          key={label}
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '18px 18px 20px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', marginBottom: 8 }}>
            {label.toUpperCase()}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: tone }}>{value ?? 0}</div>
        </div>
      ))}
    </div>
  )
}

function Pager({ page, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE))
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={pagerButton(page <= 1)}
      >
        Prev
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>Page {page}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        style={pagerButton(page >= totalPages)}
      >
        Next
      </button>
    </div>
  )
}

function pagerButton(disabled) {
  return {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: disabled ? '#cbd5e1' : '#475569',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
  }
}

function AccessDeniedCard({ user }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #fecaca',
        padding: '26px 24px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', letterSpacing: '.08em', marginBottom: 10 }}>
        ACCESS DENIED
      </div>
      <h1 style={{ margin: '0 0 10px', fontSize: 24, color: '#0f172a' }}>Admin access required</h1>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.8, maxWidth: 720 }}>
        You are signed in as <strong>{user?.username || 'this account'}</strong>, but admin tools are only available to admin accounts.
        Your session is still active, and you can safely return to the regular app.
      </p>
      <Link to="/feed" style={primaryButtonLink}>
        Back to feed
      </Link>
    </section>
  )
}


export default function AdminPage() {
  const navigate = useNavigate()
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const isAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState('overview')
  const [overview, setOverview] = useState({ loading: true, loaded: false, error: '', stats: null })
  const [usersState, setUsersState] = useState(createPageState)
  const [sheetsState, setSheetsState] = useState(createPageState)
  const [reviewState, setReviewState] = useState(createPageState)
  const [announcementsState, setAnnouncementsState] = useState(createPageState)
  const [deletionsState, setDeletionsState] = useState(createPageState)
  const [suppressionsState, setSuppressionsState] = useState(createPageState)
  const [suppressionStatus, setSuppressionStatus] = useState('active')
  const [suppressionQueryInput, setSuppressionQueryInput] = useState('')
  const [suppressionQuery, setSuppressionQuery] = useState('')
  const [suppressionMessage, setSuppressionMessage] = useState('')
  const [unsuppressReasonById, setUnsuppressReasonById] = useState({})
  const [unsuppressErrorById, setUnsuppressErrorById] = useState({})
  const [unsuppressSavingId, setUnsuppressSavingId] = useState(null)
  const [auditState, setAuditState] = useState(createAuditState)
  const [reviewStatus, setReviewStatus] = useState('pending_review')
  const [announceForm, setAnnounceForm] = useState({ title: '', body: '', pinned: false })
  const [announceSaving, setAnnounceSaving] = useState(false)
  const [announceError, setAnnounceError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) // { title, message, variant, onConfirm }

  const apiJson = useCallback(async (url, options = {}) => {
    const response = await fetch(`${API}${url}`, {
      headers: authHeaders(),
      ...options,
    })
    const data = await readJsonSafely(response, {})

    if (response.status === 401) {
      clearSession()
      navigate('/login', { replace: true })
      throw new Error(getApiErrorMessage(data, 'Your session expired.'))
    }
    if (response.status === 403) {
      throw new Error(getApiErrorMessage(data, 'You do not have permission to run this admin action.'))
    }

    if (!response.ok) {
      throw new Error(getApiErrorMessage(data, 'Request failed.'))
    }
    return data
  }, [clearSession, navigate])

  const loadOverview = useCallback(async ({ signal } = {}) => {

    try {
      setOverview((current) => ({ ...current, loading: true, error: '' }))
      const response = await fetch(`${API}/api/admin/stats`, {
        headers: authHeaders(),
        signal,
      })
      const data = await readJsonSafely(response, {})

      if (response.status === 401) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      if (response.status === 403) {
        setOverview((current) => ({
          ...current,
          loading: false,
          loaded: current.loaded,
          error: getApiErrorMessage(data, 'You do not have permission to view admin statistics.'),
        }))
        return
      }

      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load admin stats.'))

      setOverview({ loading: false, loaded: true, error: '', stats: data })
    } catch (error) {
      if (error?.name === 'AbortError') return
      setOverview((current) => ({
        loading: false,
        loaded: current.loaded,
        error: error.message || 'Could not load admin stats.',
        stats: current.stats,
      }))
    }
  }, [clearSession, navigate])

  const loadPagedData = useCallback(async (tab, page = 1) => {
    const stateSetters = {
      users: setUsersState,
      sheets: setSheetsState,
      'sheet-reviews': setReviewState,
      announcements: setAnnouncementsState,
      'deletion-reasons': setDeletionsState,
      'email-suppressions': setSuppressionsState,
    }

    const endpoints = {
      users: `/api/admin/users?page=${page}`,
      sheets: `/api/admin/sheets?page=${page}`,
      'sheet-reviews': `/api/admin/sheets/review?page=${page}&status=${encodeURIComponent(reviewStatus)}`,
      announcements: `/api/admin/announcements?page=${page}`,
      'deletion-reasons': `/api/admin/deletion-reasons?page=${page}`,
      'email-suppressions': `/api/admin/email-suppressions?page=${page}&status=${encodeURIComponent(suppressionStatus)}${suppressionQuery ? `&q=${encodeURIComponent(suppressionQuery)}` : ''}`,
    }

    const setState = stateSetters[tab]
    if (!setState) return

    setState((current) => ({ ...current, loading: true, error: '', page }))
    try {
      const data = await apiJson(endpoints[tab])
      const items =
        data.users ||
        data.sheets ||
        data.announcements ||
        data.reasons ||
        data.suppressions ||
        []

      setState({
        loading: false,
        loaded: true,
        error: '',
        page: data.page || page,
        total: data.total || items.length,
        items,
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Could not load this tab.',
      }))
    }
  }, [apiJson, reviewStatus, suppressionQuery, suppressionStatus])

  useEffect(() => {
    if (!user || user.role !== 'admin') return

    if (activeTab === 'overview' && !overview.loaded && !overview.loading) {
      void loadOverview()
      return
    }

    if (activeTab === 'users' && !usersState.loaded && !usersState.loading) {
      void loadPagedData('users', usersState.page)
      return
    }

    if (activeTab === 'sheets' && !sheetsState.loaded && !sheetsState.loading) {
      void loadPagedData('sheets', sheetsState.page)
      return
    }

    if (activeTab === 'sheet-reviews' && !reviewState.loaded && !reviewState.loading) {
      void loadPagedData('sheet-reviews', reviewState.page)
      return
    }

    if (activeTab === 'announcements' && !announcementsState.loaded && !announcementsState.loading) {
      void loadPagedData('announcements', announcementsState.page)
      return
    }

    if (activeTab === 'deletion-reasons' && !deletionsState.loaded && !deletionsState.loading) {
      void loadPagedData('deletion-reasons', deletionsState.page)
      return
    }

    if (activeTab === 'email-suppressions' && !suppressionsState.loaded && !suppressionsState.loading) {
      void loadPagedData('email-suppressions', suppressionsState.page)
    }
  }, [
    activeTab,
    announcementsState.loaded,
    announcementsState.loading,
    announcementsState.page,
    deletionsState.loaded,
    deletionsState.loading,
    deletionsState.page,
    loadOverview,
    loadPagedData,
    overview.loaded,
    overview.loading,
    reviewState.loaded,
    reviewState.loading,
    reviewState.page,
    sheetsState.loaded,
    sheetsState.loading,
    sheetsState.page,
    suppressionsState.loaded,
    suppressionsState.loading,
    suppressionsState.page,
    user,
    usersState.loaded,
    usersState.loading,
    usersState.page,
  ])

  useLivePolling(loadOverview, {
    enabled: Boolean(user?.role === 'admin' && activeTab === 'overview'),
    intervalMs: 45000,
  })

  useLivePolling(async () => {
    await loadPagedData('sheet-reviews', reviewState.page)
  }, {
    enabled: Boolean(user?.role === 'admin' && activeTab === 'sheet-reviews'),
    intervalMs: 30000,
    refreshKey: `${reviewState.page}|${reviewStatus}`,
  })

  const tabState = useMemo(() => {
    switch (activeTab) {
      case 'users':
        return usersState
      case 'sheets':
        return sheetsState
      case 'sheet-reviews':
        return reviewState
      case 'announcements':
        return announcementsState
      case 'deletion-reasons':
        return deletionsState
      case 'email-suppressions':
        return suppressionsState
      default:
        return null
    }
  }, [activeTab, announcementsState, deletionsState, reviewState, sheetsState, suppressionsState, usersState])

  if (!user) return null

  async function patchRole(userId, role) {
    await apiJson(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    await Promise.all([loadPagedData('users', usersState.page), loadOverview()])
  }

  function deleteUser(userId) {
    setConfirmAction({
      title: 'Delete this user?',
      message: 'This will permanently remove the user and all their data. This cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/users/${userId}`, { method: 'DELETE' })
        await Promise.all([loadPagedData('users', usersState.page), loadOverview()])
      },
    })
  }

  function deleteSheet(sheetId) {
    setConfirmAction({
      title: 'Delete this sheet?',
      message: 'The sheet and all associated data will be permanently removed.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/sheets/${sheetId}`, { method: 'DELETE' })
        await Promise.all([loadPagedData('sheets', sheetsState.page), loadOverview()])
      },
    })
  }

  function reviewSheet(sheetId, action) {
    setConfirmAction({
      title: action === 'approve' ? 'Approve this sheet?' : 'Reject this sheet?',
      message: action === 'approve'
        ? 'This will publish the sheet and make it visible to all users.'
        : 'This will reject the sheet submission.',
      variant: action === 'approve' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/sheets/${sheetId}/review`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        })
        await Promise.all([
          loadPagedData('sheet-reviews', reviewState.page),
          loadPagedData('sheets', sheetsState.page),
          loadOverview(),
        ])
      },
    })
  }

  async function saveAnnouncement(event) {
    event.preventDefault()
    setAnnounceSaving(true)
    setAnnounceError('')

    try {
      await apiJson('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify(announceForm),
      })
      setAnnounceForm({ title: '', body: '', pinned: false })
      await loadPagedData('announcements', 1)
    } catch (error) {
      setAnnounceError(error.message || 'Could not save announcement.')
    } finally {
      setAnnounceSaving(false)
    }
  }

  async function togglePin(announcementId) {
    await apiJson(`/api/admin/announcements/${announcementId}/pin`, { method: 'PATCH' })
    await loadPagedData('announcements', announcementsState.page)
  }

  function deleteAnnouncement(announcementId) {
    setConfirmAction({
      title: 'Delete this announcement?',
      message: 'This will permanently remove the announcement.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        await apiJson(`/api/admin/announcements/${announcementId}`, { method: 'DELETE' })
        await loadPagedData('announcements', announcementsState.page)
      },
    })
  }

  async function loadSuppressionAudit(suppressionId, page = 1) {
    setAuditState((current) => ({
      ...current,
      loading: true,
      error: '',
      page,
      suppressionId,
    }))

    try {
      const data = await apiJson(`/api/admin/email-suppressions/${suppressionId}/audit?page=${page}`)
      setAuditState({
        loading: false,
        loaded: true,
        error: '',
        page: data.page || page,
        total: data.total || 0,
        entries: data.entries || [],
        suppression: data.suppression || null,
        suppressionId,
      })
    } catch (error) {
      setAuditState((current) => ({
        ...current,
        loading: false,
        loaded: current.loaded,
        error: error.message || 'Could not load suppression audit.',
        suppressionId,
      }))
    }
  }

  function submitSuppressionSearch(event) {
    event.preventDefault()
    setSuppressionMessage('')
    setSuppressionsState(createPageState())
    setSuppressionQuery(suppressionQueryInput.trim())
  }

  function clearSuppressionFilters() {
    setSuppressionMessage('')
    setSuppressionStatus('active')
    setSuppressionQueryInput('')
    setSuppressionQuery('')
    setSuppressionsState(createPageState())
  }

  async function unsuppressRecipient(record) {
    const reason = String(unsuppressReasonById[record.id] || '').trim()
    if (reason.length < 8) {
      setUnsuppressErrorById((current) => ({
        ...current,
        [record.id]: 'Provide an unsuppress reason with at least 8 characters.',
      }))
      return
    }

    setSuppressionMessage('')
    setUnsuppressSavingId(record.id)
    setUnsuppressErrorById((current) => ({ ...current, [record.id]: '' }))

    try {
      await apiJson(`/api/admin/email-suppressions/${record.id}/unsuppress`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      })

      setUnsuppressReasonById((current) => ({ ...current, [record.id]: '' }))
      const followUp = [
        loadPagedData('email-suppressions', suppressionsState.page),
        loadOverview(),
      ]

      if (auditState.suppressionId === record.id) {
        followUp.push(loadSuppressionAudit(record.id, auditState.page))
      }

      await Promise.all(followUp)
      setSuppressionMessage('Recipient unsuppressed successfully.')
    } catch (error) {
      setUnsuppressErrorById((current) => ({
        ...current,
        [record.id]: error.message || 'Could not unsuppress recipient.',
      }))
    } finally {
      setUnsuppressSavingId(null)
    }
  }

  const navActions = (
    <Link
      to="/feed"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #334155',
        color: '#94a3b8',
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      ← Feed
    </Link>
  )

  return (
  <>
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Admin', to: '/admin' }]} hideTabs actions={navActions} />
      <div
        style={{
          ...pageShell('app'),
          display: 'grid',
          gridTemplateColumns: layout.columns.appTwoColumn,
          gap: 20,
        }}
      >
        <AppSidebar mode={layout.sidebarMode} />

        <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isAdmin ? (
            // Keep the route shell mounted so non-admin users understand why /admin is unavailable without losing their session.
            <AccessDeniedCard user={user} />
          ) : (
            <>
              <section
                style={{
                  background: '#fff',
                  borderRadius: 18,
                  border: '1px solid #e2e8f0',
                  padding: '18px 20px',
                }}
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TABS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActiveTab(value)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: activeTab === value ? '1px solid #2563eb' : '1px solid #e2e8f0',
                        background: activeTab === value ? '#eff6ff' : '#fff',
                        color: activeTab === value ? '#1d4ed8' : '#475569',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {activeTab === 'overview' ? (
            <section
              style={{
                background: '#fff',
                borderRadius: 18,
                border: '1px solid #e2e8f0',
                padding: '22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Admin Overview</h1>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    This tab polls lightly in the background. Other tabs load only when you open them.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadOverview()}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Refresh
                </button>
              </div>

              {overview.error ? (
                <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
                  {overview.error}
                </div>
              ) : null}

              {!overview.stats && overview.loading ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading admin stats…</div>
              ) : overview.stats ? (
                <StatsGrid stats={overview.stats} />
              ) : null}
            </section>
              ) : null}

              {activeTab !== 'overview' && activeTab !== 'settings' ? (
            <section
              style={{
                background: '#fff',
                borderRadius: 18,
                border: '1px solid #e2e8f0',
                padding: '22px',
              }}
            >
              {tabState?.error ? (
                <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>
                  {tabState.error}
                </div>
              ) : null}

              {activeTab === 'users' ? (
                <>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                    {usersState.total} total users
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          {['Username', 'Email', 'Role', 'Sheets', 'Joined', 'Actions'].map((header) => (
                            <th key={header} style={tableHeadStyle}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {usersState.items.map((record) => (
                          <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={tableCellStrong}>{record.username}</td>
                            <td style={tableCell}>{record.email || '—'}</td>
                            <td style={tableCell}>{record.role}</td>
                            <td style={tableCell}>{record._count?.studySheets ?? 0}</td>
                            <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
                            <td style={{ ...tableCell, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {record.role === 'student' ? (
                                <button type="button" onClick={() => void patchRole(record.id, 'admin')} style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                                  Make admin
                                </button>
                              ) : (
                                <button type="button" onClick={() => void patchRole(record.id, 'student')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                                  Revoke admin
                                </button>
                              )}
                              {record.id !== user.id ? (
                                <button type="button" onClick={() => void deleteUser(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                                  Delete
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={usersState.page} total={usersState.total} onChange={(page) => void loadPagedData('users', page)} />
                </>
              ) : null}

              {activeTab === 'sheets' ? (
                <>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                    {sheetsState.total} total sheets
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {sheetsState.items.map((record) => (
                      <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 5 }}>{record.title}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {record.course?.code || 'No course'} · by {record.author?.username || 'unknown'}
                          </div>
                        </div>
                        <button type="button" onClick={() => void deleteSheet(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                  <Pager page={sheetsState.page} total={sheetsState.total} onChange={(page) => void loadPagedData('sheets', page)} />
                </>
              ) : null}

              {activeTab === 'sheet-reviews' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {reviewState.total} sheets in review queue ({reviewStatus})
                    </div>
                    <select
                      value={reviewStatus}
                      onChange={(event) => {
                        setReviewStatus(event.target.value)
                        setReviewState(createPageState())
                      }}
                      style={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        padding: '7px 10px',
                        fontSize: 12,
                        color: '#334155',
                        fontFamily: FONT,
                      }}
                    >
                      <option value="pending_review">Pending review</option>
                      <option value="rejected">Rejected</option>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {reviewState.items.map((record) => (
                      <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                              {record.title}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {record.course?.code || 'No course'} · by {record.author?.username || 'unknown'} · format {record.contentFormat || 'markdown'}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                            {record.status}
                          </span>
                        </div>
                        {record.description ? (
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                            {record.description}
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Link to={`/sheets/${record.id}`} style={{ ...pillButton('#eff6ff', '#1d4ed8', '#bfdbfe'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                            Open
                          </Link>
                          {record.contentFormat === 'html' ? (
                            <Link to={`/sheets/preview/html/${record.id}`} style={{ ...pillButton('#eff6ff', '#1d4ed8', '#bfdbfe'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                              Preview HTML
                            </Link>
                          ) : null}
                          <button type="button" onClick={() => void reviewSheet(record.id, 'approve')} style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}>
                            Approve
                          </button>
                          <button type="button" onClick={() => void reviewSheet(record.id, 'reject')} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pager page={reviewState.page} total={reviewState.total} onChange={(page) => void loadPagedData('sheet-reviews', page)} />
                </>
              ) : null}

              {activeTab === 'announcements' ? (
                <>
                  <form onSubmit={saveAnnouncement} style={{ marginBottom: 18, display: 'grid', gap: 10 }}>
                    <input
                      value={announceForm.title}
                      onChange={(event) => setAnnounceForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Announcement title"
                      style={inputStyle}
                    />
                    <textarea
                      value={announceForm.body}
                      onChange={(event) => setAnnounceForm((current) => ({ ...current, body: event.target.value }))}
                      placeholder="Announcement body"
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
                      <input
                        type="checkbox"
                        checked={announceForm.pinned}
                        onChange={(event) => setAnnounceForm((current) => ({ ...current, pinned: event.target.checked }))}
                      />
                      Pin this announcement
                    </label>
                    {announceError ? <div style={{ color: '#b91c1c', fontSize: 12 }}>{announceError}</div> : null}
                    <button type="submit" disabled={announceSaving} style={primaryButton}>
                      {announceSaving ? 'Posting…' : 'Post announcement'}
                    </button>
                  </form>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {announcementsState.items.map((record) => (
                      <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', background: record.pinned ? '#fffbeb' : '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            {record.pinned ? (
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 5 }}>PINNED</div>
                            ) : null}
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{record.title}</div>
                            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>{record.body}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                            <button type="button" onClick={() => void togglePin(record.id)} style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                              {record.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button type="button" onClick={() => void deleteAnnouncement(record.id)} style={pillButton('#fef2f2', '#dc2626', '#fecaca')}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pager page={announcementsState.page} total={announcementsState.total} onChange={(page) => void loadPagedData('announcements', page)} />
                </>
              ) : null}

              {activeTab === 'deletion-reasons' ? (
                <>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                    {deletionsState.total} deletion records
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          {['Username', 'Reason', 'Details', 'Date'].map((header) => (
                            <th key={header} style={tableHeadStyle}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deletionsState.items.map((record) => (
                          <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={tableCellStrong}>{record.username}</td>
                            <td style={tableCell}>{String(record.reason || '').replace(/_/g, ' ') || '—'}</td>
                            <td style={tableCell}>{record.details || '—'}</td>
                            <td style={tableCell}>{new Date(record.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={deletionsState.page} total={deletionsState.total} onChange={(page) => void loadPagedData('deletion-reasons', page)} />
                </>
              ) : null}

              {activeTab === 'email-suppressions' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {suppressionsState.total} total suppression records
                    </div>
                    <form onSubmit={submitSuppressionSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select
                        value={suppressionStatus}
                        onChange={(event) => {
                          setSuppressionStatus(event.target.value)
                          setSuppressionMessage('')
                          setSuppressionsState(createPageState())
                        }}
                        style={{
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          padding: '7px 10px',
                          fontSize: 12,
                          color: '#334155',
                          fontFamily: FONT,
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="all">All</option>
                      </select>
                      <input
                        value={suppressionQueryInput}
                        onChange={(event) => setSuppressionQueryInput(event.target.value)}
                        placeholder="Search by email"
                        style={{ ...inputStyle, width: 220, padding: '8px 10px' }}
                      />
                      <button type="submit" style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                        Search
                      </button>
                      <button
                        type="button"
                        onClick={clearSuppressionFilters}
                        style={pillButton('#fff', '#475569', '#cbd5e1')}
                        disabled={!suppressionQueryInput && !suppressionQuery && suppressionStatus === 'active'}
                      >
                        Reset
                      </button>
                    </form>
                  </div>

                  {suppressionMessage ? (
                    <div style={{ color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
                      {suppressionMessage}
                    </div>
                  ) : null}

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          {['Email', 'Reason', 'Source', 'Updated', 'Status', 'Actions'].map((header) => (
                            <th key={header} style={tableHeadStyle}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {suppressionsState.items.map((record) => (
                          <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={tableCellStrong}>{record.email}</td>
                            <td style={tableCell}>{formatLabel(record.reason, '—')}</td>
                            <td style={tableCell}>
                              <div style={{ marginBottom: 4 }}>
                                {formatLabel(record.provider)} · {formatLabel(record.sourceEventType)}
                              </div>
                              {record.sourceMessageId ? (
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>msg: {record.sourceMessageId}</div>
                              ) : null}
                            </td>
                            <td style={tableCell}>{formatDateTime(record.updatedAt || record.lastSuppressedAt)}</td>
                            <td style={tableCell}>
                              <span style={suppressionStatusPill(record.active)}>{record.active ? 'Active' : 'Inactive'}</span>
                            </td>
                            <td style={{ ...tableCell, minWidth: 260 }}>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => void loadSuppressionAudit(record.id, 1)}
                                    style={pillButton('#eff6ff', '#1d4ed8', '#bfdbfe')}
                                    aria-label={`View audit for ${record.email}`}
                                  >
                                    View audit
                                  </button>
                                  {record.active ? (
                                    <button
                                      type="button"
                                      onClick={() => void unsuppressRecipient(record)}
                                      style={pillButton('#ecfdf5', '#047857', '#a7f3d0')}
                                      disabled={unsuppressSavingId === record.id}
                                      aria-label={`Unsuppress ${record.email}`}
                                    >
                                      {unsuppressSavingId === record.id ? 'Unsuppressing…' : 'Unsuppress'}
                                    </button>
                                  ) : null}
                                </div>
                                {record.active ? (
                                  <input
                                    value={unsuppressReasonById[record.id] || ''}
                                    onChange={(event) => {
                                      const { value } = event.target
                                      setUnsuppressReasonById((current) => ({ ...current, [record.id]: value }))
                                      if (unsuppressErrorById[record.id]) {
                                        setUnsuppressErrorById((current) => ({ ...current, [record.id]: '' }))
                                      }
                                    }}
                                    placeholder="Unsuppress reason (min 8 chars)"
                                    aria-label={`Unsuppress reason for ${record.email}`}
                                    style={{ ...inputStyle, padding: '8px 10px' }}
                                  />
                                ) : null}
                                {unsuppressErrorById[record.id] ? (
                                  <div style={{ fontSize: 12, color: '#b91c1c' }}>{unsuppressErrorById[record.id]}</div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {suppressionsState.items.length === 0 && !suppressionsState.loading ? (
                    <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
                      No suppression records for this filter.
                    </div>
                  ) : null}

                  <Pager
                    page={suppressionsState.page}
                    total={suppressionsState.total}
                    onChange={(page) => void loadPagedData('email-suppressions', page)}
                  />

                  {auditState.suppressionId ? (
                    <section
                      style={{
                        marginTop: 18,
                        border: '1px solid #e2e8f0',
                        borderRadius: 14,
                        padding: '14px 16px',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>Audit timeline</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{auditState.suppression?.email || `Suppression #${auditState.suppressionId}`}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAuditState(createAuditState())}
                          style={pillButton('#fff', '#475569', '#cbd5e1')}
                        >
                          Close
                        </button>
                      </div>

                      {auditState.error ? (
                        <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 8 }}>{auditState.error}</div>
                      ) : null}

                      {auditState.loading && !auditState.loaded ? (
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading audit timeline…</div>
                      ) : auditState.entries.length ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {auditState.entries.map((entry) => (
                            <div key={entry.id} style={{ border: '1px solid #dbe1e8', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{formatLabel(entry.action)}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDateTime(entry.createdAt)}</div>
                              </div>
                              <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{entry.reason || 'No reason provided.'}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                Actor: {entry.performedBy?.username || 'System'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 12 }}>No audit entries recorded yet.</div>
                      )}

                      {auditState.loaded ? (
                        <Pager
                          page={auditState.page}
                          total={auditState.total}
                          onChange={(page) => void loadSuppressionAudit(auditState.suppressionId, page)}
                        />
                      ) : null}
                    </section>
                  ) : null}
                </>
              ) : null}

              {tabState?.loading && !tabState.loaded ? (
                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>Loading tab…</div>
              ) : null}
            </section>
              ) : null}

              {activeTab === 'settings' ? (
            <section
              style={{
                background: '#fff',
                borderRadius: 18,
                border: '1px solid #e2e8f0',
                padding: '22px',
              }}
            >
              <h1 style={{ margin: '0 0 10px', fontSize: 22, color: '#0f172a' }}>Admin Settings</h1>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
                Core account changes now live under the shared settings flow so admin and student verification behavior stay consistent.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={settingsCardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>ADMIN EMAIL</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    {user.email || SUPPORT_EMAIL}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Verification status: {user.emailVerified ? 'verified' : 'verification required'}
                  </div>
                </div>
                <div style={settingsCardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>SECURITY</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                    Use the main settings page to change email, password, username, 2-step verification, and enrolled courses.
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Link to="/settings" style={primaryButtonLink}>
                  Open account settings
                </Link>
              </div>
            </section>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
    <ConfirmDialog
      open={confirmAction !== null}
      title={confirmAction?.title}
      message={confirmAction?.message}
      confirmLabel={confirmAction?.variant === 'danger' ? 'Delete' : 'Confirm'}
      cancelLabel="Cancel"
      variant={confirmAction?.variant || 'default'}
      onConfirm={confirmAction?.onConfirm}
      onCancel={() => setConfirmAction(null)}
    />
  </>
  )
}

const tableHeadStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

const tableCell = {
  padding: '10px 14px',
  color: '#475569',
  verticalAlign: 'top',
}

const tableCellStrong = {
  ...tableCell,
  fontWeight: 700,
  color: '#0f172a',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #dbe1e8',
  fontSize: 13,
  color: '#0f172a',
  fontFamily: FONT,
}

const primaryButton = {
  width: 'fit-content',
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
}

const primaryButtonLink = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 10,
  background: '#3b82f6',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
}

const secondaryButtonLink = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
}

const settingsCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: '16px 18px',
  background: '#f8fafc',
}

function pillButton(background, color, borderColor) {
  return {
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${borderColor}`,
    background,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function suppressionStatusPill(active) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    border: active ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
    background: active ? '#ecfdf5' : '#f8fafc',
    color: active ? '#047857' : '#475569',
    fontSize: 11,
    fontWeight: 700,
  }
}

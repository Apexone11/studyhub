import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { showToast } from '../../lib/toast'
import { authHeaders, createPageState, createAuditState } from './adminConstants'

export function useAdminData() {
  const navigate = useNavigate()
  const { user, clearSession } = useSession()

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
  const [reviewFormatFilter, setReviewFormatFilter] = useState('')
  const [reviewScanFilter, setReviewScanFilter] = useState('')
  const [announceForm, setAnnounceForm] = useState({ title: '', body: '', pinned: false })
  const [announceSaving, setAnnounceSaving] = useState(false)
  const [announceError, setAnnounceError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [reviewPanelSheetId, setReviewPanelSheetId] = useState(null)
  const [htmlKillSwitch, setHtmlKillSwitch] = useState({
    loading: true,
    enabled: true,
    source: 'default',
    envOverride: null,
    error: '',
  })
  const [htmlToggleSaving, setHtmlToggleSaving] = useState(false)

  const apiJson = useCallback(
    async (url, options = {}) => {
      const response = await fetch(`${API}${url}`, {
        headers: authHeaders(),
        credentials: 'include',
        ...options,
      })
      const data = await readJsonSafely(response, {})
      if (response.status === 401) {
        clearSession()
        navigate('/login', { replace: true })
        throw new Error(getApiErrorMessage(data, 'Your session expired.'))
      }
      if (response.status === 403) {
        throw new Error(
          getApiErrorMessage(data, 'You do not have permission to run this admin action.'),
        )
      }
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Request failed.'))
      }
      return data
    },
    [clearSession, navigate],
  )

  const loadOverview = useCallback(
    async ({ signal } = {}) => {
      try {
        setOverview((current) => ({ ...current, loading: true, error: '' }))
        const response = await fetch(`${API}/api/admin/stats`, {
          headers: authHeaders(),
          credentials: 'include',
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
    },
    [clearSession, navigate],
  )

  const loadPagedData = useCallback(
    async (tab, page = 1) => {
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
        'sheet-reviews': `/api/admin/sheets/review?page=${page}&status=${encodeURIComponent(reviewStatus)}${reviewFormatFilter ? `&contentFormat=${encodeURIComponent(reviewFormatFilter)}` : ''}${reviewScanFilter ? `&htmlScanStatus=${encodeURIComponent(reviewScanFilter)}` : ''}`,
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
          data.users || data.sheets || data.announcements || data.reasons || data.suppressions || []
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
    },
    [
      apiJson,
      reviewStatus,
      reviewFormatFilter,
      reviewScanFilter,
      suppressionQuery,
      suppressionStatus,
    ],
  )

  const loadHtmlKillSwitch = useCallback(async () => {
    try {
      const data = await apiJson('/admin/settings/html-uploads')
      setHtmlKillSwitch({
        loading: false,
        enabled: data.enabled,
        source: data.source,
        envOverride: data.envOverride,
        error: '',
      })
    } catch (err) {
      setHtmlKillSwitch((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load HTML upload status.',
      }))
    }
  }, [apiJson])

  const toggleHtmlUploads = useCallback(
    async (newEnabled) => {
      setHtmlToggleSaving(true)
      try {
        const data = await apiJson('/admin/settings/html-uploads', {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newEnabled }),
        })
        setHtmlKillSwitch((prev) => ({
          ...prev,
          enabled: data.enabled,
          source: data.source,
          envOverride: data.envOverride,
          error: data.message || '',
        }))
      } catch (err) {
        setHtmlKillSwitch((prev) => ({ ...prev, error: err.message || 'Toggle failed.' }))
      } finally {
        setHtmlToggleSaving(false)
      }
    },
    [apiJson],
  )

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
        try {
          await apiJson(`/api/admin/sheets/${sheetId}`, { method: 'DELETE' })
          showToast('Sheet deleted.', 'success')
          await Promise.all([loadPagedData('sheets', sheetsState.page), loadOverview()])
        } catch (err) {
          showToast(err.message || 'Could not delete sheet.', 'error')
        }
      },
    })
  }

  function reviewSheet(sheetId, action) {
    setConfirmAction({
      title: action === 'approve' ? 'Quick-approve this sheet?' : 'Quick-reject this sheet?',
      message:
        action === 'approve'
          ? 'This will publish the sheet. For HTML sheets, use "Review HTML" for detailed inspection.'
          : 'This will reject the sheet submission. For HTML sheets, use "Review HTML" for detailed inspection.',
      variant: action === 'approve' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          const reason =
            action === 'approve'
              ? 'Quick-approved via admin panel.'
              : 'Quick-rejected via admin panel.'
          await apiJson(`/api/admin/sheets/${sheetId}/review`, {
            method: 'PATCH',
            body: JSON.stringify({ action, reason }),
          })
          showToast(
            action === 'approve' ? 'Sheet approved and published.' : 'Sheet rejected.',
            'success',
          )
          await Promise.all([
            loadPagedData('sheet-reviews', reviewState.page),
            loadPagedData('sheets', sheetsState.page),
            loadOverview(),
          ])
        } catch (err) {
          showToast(err.message || `Could not ${action} sheet.`, 'error')
        }
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
    setAuditState((current) => ({ ...current, loading: true, error: '', page, suppressionId }))
    try {
      const data = await apiJson(
        `/api/admin/email-suppressions/${suppressionId}/audit?page=${page}`,
      )
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
      setUnsuppressErrorById((c) => ({
        ...c,
        [record.id]: 'Provide an unsuppress reason with at least 8 characters.',
      }))
      return
    }
    setSuppressionMessage('')
    setUnsuppressSavingId(record.id)
    setUnsuppressErrorById((c) => ({ ...c, [record.id]: '' }))
    try {
      await apiJson(`/api/admin/email-suppressions/${record.id}/unsuppress`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      })
      setUnsuppressReasonById((c) => ({ ...c, [record.id]: '' }))
      const followUp = [loadPagedData('email-suppressions', suppressionsState.page), loadOverview()]
      if (auditState.suppressionId === record.id)
        followUp.push(loadSuppressionAudit(record.id, auditState.page))
      await Promise.all(followUp)
      setSuppressionMessage('Recipient unsuppressed successfully.')
    } catch (error) {
      setUnsuppressErrorById((c) => ({
        ...c,
        [record.id]: error.message || 'Could not unsuppress recipient.',
      }))
    } finally {
      setUnsuppressSavingId(null)
    }
  }

  return {
    user,
    overview,
    usersState,
    sheetsState,
    reviewState,
    announcementsState,
    deletionsState,
    suppressionsState,
    suppressionStatus,
    suppressionQueryInput,
    suppressionQuery,
    suppressionMessage,
    unsuppressReasonById,
    unsuppressErrorById,
    unsuppressSavingId,
    auditState,
    reviewStatus,
    reviewFormatFilter,
    reviewScanFilter,
    announceForm,
    announceSaving,
    announceError,
    confirmAction,
    reviewPanelSheetId,
    htmlKillSwitch,
    htmlToggleSaving,
    setSuppressionStatus,
    setSuppressionQueryInput,
    setSuppressionMessage,
    setSuppressionsState,
    setUnsuppressReasonById,
    setUnsuppressErrorById,
    setReviewStatus,
    setReviewFormatFilter,
    setReviewScanFilter,
    setReviewState,
    setAnnounceForm,
    setConfirmAction,
    setReviewPanelSheetId,
    setAuditState,
    apiJson,
    loadOverview,
    loadPagedData,
    loadHtmlKillSwitch,
    toggleHtmlUploads,
    patchRole,
    deleteUser,
    deleteSheet,
    reviewSheet,
    saveAnnouncement,
    togglePin,
    deleteAnnouncement,
    loadSuppressionAudit,
    submitSuppressionSearch,
    clearSuppressionFilters,
    unsuppressRecipient,
  }
}

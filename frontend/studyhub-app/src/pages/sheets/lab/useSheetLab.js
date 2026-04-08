/**
 * Sheet Lab — custom hook for all state management and API calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { API } from '../../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../../lib/http'
import { useSession } from '../../../lib/session-context'
import { staggerEntrance } from '../../../lib/animations'
import { showToast } from '../../../lib/toast'
import { authHeaders } from './sheetLabConstants'

export default function useSheetLab() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const sheetId = Number.parseInt(id, 10)
  const { user, clearSession } = useSession()

  const [sheet, setSheet] = useState(null)
  const [commits, setCommits] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedCommitId, setExpandedCommitId] = useState(null)
  const [expandedContent, setExpandedContent] = useState(null)
  const [loadingContent, setLoadingContent] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [autoSummary, setAutoSummary] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [creating, setCreating] = useState(false)

  const [restoring, setRestoring] = useState(null)
  const [restorePreview, setRestorePreview] = useState(null)
  const [loadingRestorePreview, setLoadingRestorePreview] = useState(null)

  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState([])
  const [diff, setDiff] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const timelineRef = useRef(null)
  const animatedRef = useRef(false)

  const [activeTab, setActiveTab] = useState('history')

  const isOwner = user && sheet && (user.role === 'admin' || user.id === sheet.userId)
  const isFork = Boolean(sheet?.forkOf)

  // Load sheet info. Retries once on 404 to absorb the brief race that happens
  // immediately after a fork is created and the user is redirected here.
  const reloadSheet = useCallback(async () => {
    if (!Number.isInteger(sheetId)) return
    const fetchOnce = async () => {
      const response = await fetch(`${API}/api/sheets/${sheetId}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      return { response, data }
    }
    try {
      let { response, data } = await fetchOnce()
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      if (response.status === 404) {
        // Race after fork: wait briefly and retry once before surfacing an error.
        await new Promise((resolve) => setTimeout(resolve, 800))
        ;({ response, data } = await fetchOnce())
        if (isAuthSessionFailure(response, data)) {
          clearSession()
          navigate('/login', { replace: true })
          return
        }
      }
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'Hang tight — this sheet is still loading. If it does not appear in a moment, it may have been removed.'
            : getApiErrorMessage(data, 'Could not load sheet.'),
        )
      }
      setSheet(data)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [sheetId, clearSession, navigate])

  useEffect(() => {
    if (!Number.isInteger(sheetId)) {
      setError('Invalid sheet ID.')
      setLoading(false)
      return
    }
    reloadSheet()
  }, [sheetId, reloadSheet])

  // Route guard: non-owners of non-published sheets get redirected (unless editing is allowed)
  useEffect(() => {
    if (!sheet || !user) return
    const owns = user.role === 'admin' || user.id === sheet.userId
    if (!owns && sheet.status !== 'published' && !sheet.allowEditing) {
      showToast("You can\u2019t edit this sheet directly. Go back and click \u2018Make your own copy\u2019 to get started.", 'error')
      navigate(`/sheets/${sheetId}`, { replace: true })
    }
  }, [sheet, user, sheetId, navigate])

  // Default to editor tab for owners, history for everyone else.
  // URL ?tab= param takes priority (used by fork redirect).
  const initialTabSet = useRef(false)
  useEffect(() => {
    if (sheet && user && !initialTabSet.current) {
      initialTabSet.current = true
      const urlTab = searchParams.get('tab')
      const validTabs = ['editor', 'history', 'contribute', 'reviews', 'lineage']
      if (urlTab && validTabs.includes(urlTab)) {
        setActiveTab(urlTab)
      } else {
        const owns = user.role === 'admin' || user.id === sheet.userId
        const canEditAsNonOwner = !owns && sheet.allowEditing === true
        setActiveTab(owns || canEditAsNonOwner ? 'editor' : 'history')
      }
    }
  }, [sheet, user, searchParams])

  // Load commits
  const loadCommits = useCallback(async (targetPage = 1) => {
    if (!Number.isInteger(sheetId)) return
    setLoading(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/commits?page=${targetPage}&limit=20`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load commits.'))
      setCommits(data.commits || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
      setTotalPages(data.totalPages || 1)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sheetId, clearSession, navigate])

  useEffect(() => {
    loadCommits(1)
  }, [loadCommits])

  // Animate timeline on first data load
  useEffect(() => {
    if (loading || animatedRef.current || commits.length === 0) return
    animatedRef.current = true
    if (timelineRef.current) {
      const items = timelineRef.current.querySelectorAll('.sheet-lab__commit')
      items.forEach((el) => el.classList.add('animate-init'))
      if (items.length > 0) staggerEntrance(items, { staggerMs: 60, y: 16 })
    }
  }, [loading, commits.length])

  // Expand / collapse commit content
  const toggleCommitContent = async (commitId) => {
    if (expandedCommitId === commitId) {
      setExpandedCommitId(null)
      setExpandedContent(null)
      return
    }
    setExpandedCommitId(commitId)
    setLoadingContent(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/commits/${commitId}`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load commit content.'))
      setExpandedContent(data.commit?.content || '')
    } catch (err) {
      showToast(err.message, 'error')
      setExpandedContent(null)
    } finally {
      setLoadingContent(false)
    }
  }

  // Fetch auto-summary when create modal opens
  const fetchAutoSummary = useCallback(async () => {
    if (!Number.isInteger(sheetId)) return
    setLoadingSummary(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/auto-summary`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (response.ok && data.summary) {
        setAutoSummary(data.summary)
        if (!commitMessage.trim()) setCommitMessage(data.summary)
      }
    } catch {
      // Non-critical — silently skip
    } finally {
      setLoadingSummary(false)
    }
  }, [sheetId, commitMessage])

  useEffect(() => {
    if (showCreateModal) fetchAutoSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateModal])

  // Create snapshot
  const handleCreateCommit = async () => {
    if (creating) return
    setCreating(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/lab/commits`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: commitMessage.trim() || 'Snapshot' }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not create snapshot.'))
      showToast('Snapshot created!', 'success')
      setShowCreateModal(false)
      setCommitMessage('')
      setAutoSummary('')
      animatedRef.current = false
      loadCommits(1)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  // Preview-before-restore
  const handlePreviewRestore = async (commitId) => {
    if (loadingRestorePreview) return
    setLoadingRestorePreview(commitId)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/restore-preview/${commitId}`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not preview restore.'))
      setRestorePreview({ diff: data.diff, commit: data.commit, commitId })
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingRestorePreview(null)
    }
  }

  // Confirm restore
  const handleRestore = async (commitId) => {
    if (restoring) return
    setRestoring(commitId)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/lab/restore/${commitId}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not restore snapshot.'))
      showToast('Sheet restored to selected snapshot.', 'success')
      setRestorePreview(null)
      animatedRef.current = false
      loadCommits(1)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRestoring(null)
    }
  }

  // Compare mode
  const toggleCompareSelection = (commitId) => {
    setCompareSelection((prev) => {
      if (prev.includes(commitId)) return prev.filter((cid) => cid !== commitId)
      if (prev.length >= 2) return [prev[1], commitId]
      return [...prev, commitId]
    })
  }

  useEffect(() => {
    if (!compareMode) {
      setCompareSelection([])
      setDiff(null)
    }
  }, [compareMode])

  const runDiff = async () => {
    if (compareSelection.length !== 2) return
    const [idA, idB] = compareSelection
    setLoadingDiff(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/diff/${idA}/${idB}`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not compute diff.'))
      setDiff(data.diff)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingDiff(false)
    }
  }

  useEffect(() => {
    if (compareSelection.length === 2) runDiff()
    else setDiff(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSelection])

  const [deleting, setDeleting] = useState(false)

  const handleDeleteFork = async () => {
    if (deleting || !sheet?.id || !isFork) return
    setDeleting(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not delete fork.'))
      showToast('Fork deleted.', 'success')
      navigate('/sheets', { replace: true })
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Lineage / fork tree
  const [lineage, setLineage] = useState(null)
  const [loadingLineage, setLoadingLineage] = useState(false)

  const loadLineage = useCallback(async () => {
    if (!Number.isInteger(sheetId)) return
    setLoadingLineage(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/lineage`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load fork tree.'))
      setLineage(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingLineage(false)
    }
  }, [sheetId])

  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    if (publishing || !sheet?.id) return
    setPublishing(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ status: 'published' }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not publish sheet.'))
      showToast(data.message || 'Sheet published!', 'success')
      reloadSheet()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setPublishing(false)
    }
  }

  const handleBack = () => {
    navigate(`/sheets/${sheetId}`)
  }

  return {
    sheetId,
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
    isFork,
    activeTab,
    setActiveTab,
    loadCommits,
    toggleCommitContent,
    handleCreateCommit,
    handlePreviewRestore,
    handleRestore,
    toggleCompareSelection,
    handleBack,
    deleting,
    handleDeleteFork,
    reloadSheet,
    publishing,
    handlePublish,
    lineage,
    loadingLineage,
    loadLineage,
  }
}

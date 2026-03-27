import { useCallback, useEffect, useState } from 'react'
import { FONT } from './adminConstants'
import { SUB_TABS, createState } from './moderationHelpers'
import { showToast } from '../../../lib/toast'
import OverviewSubTab from './OverviewSubTab'
import CasesSubTab from './CasesSubTab'
import StrikesSubTab from './StrikesSubTab'
import AppealsSubTab from './AppealsSubTab'
import RestrictionsSubTab from './RestrictionsSubTab'

export default function ModerationTab({ apiJson, setConfirmAction, formatDateTime }) {
  const [subTab, setSubTab] = useState('overview')

  const [casesState, setCasesState] = useState(createState)
  const [strikesState, setStrikesState] = useState(createState)
  const [appealsState, setAppealsState] = useState(createState)
  const [restrictionsState, setRestrictionsState] = useState(createState)
  const [overviewData, setOverviewData] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [caseStatus, setCaseStatus] = useState('pending')
  const [caseSource, setCaseSource] = useState('')
  const [caseClaimed, setCaseClaimed] = useState('')
  const [caseTrustFilter, setCaseTrustFilter] = useState('')
  const [caseSort, setCaseSort] = useState('date')
  const [expandedCase, setExpandedCase] = useState(null)
  const [expandedCaseLoading, setExpandedCaseLoading] = useState(false)
  const [casePreview, setCasePreview] = useState(null)
  const [casePreviewLoading, setCasePreviewLoading] = useState(false)
  const [appealStatus, setAppealStatus] = useState('pending')
  const [strikeForm, setStrikeForm] = useState({ userId: '', reason: '', _selectedUser: null })
  const [strikeSaving, setStrikeSaving] = useState(false)
  const [strikeError, setStrikeError] = useState('')

  /* ── Loaders ─────────────────────────────────────────────────── */
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const data = await apiJson('/api/admin/moderation/cases/overview')
      setOverviewData(data)
    } catch {
      setOverviewData(null)
    } finally {
      setOverviewLoading(false)
    }
  }, [apiJson])

  const loadCases = useCallback(async (page = 1) => {
    setCasesState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const params = new URLSearchParams({ page, status: caseStatus })
      if (caseSource) params.set('source', caseSource)
      if (caseClaimed) params.set('claimed', caseClaimed)
      if (caseTrustFilter) params.set('trustLevel', caseTrustFilter)
      const data = await apiJson(`/api/admin/moderation/cases?${params}`)
      setCasesState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.cases || [] })
    } catch (err) {
      setCasesState((s) => ({ ...s, loading: false, error: err.message || 'Could not load cases.' }))
    }
  }, [apiJson, caseStatus, caseSource, caseClaimed, caseTrustFilter])

  const loadStrikes = useCallback(async (page = 1) => {
    setStrikesState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/strikes?page=${page}`)
      setStrikesState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.strikes || [] })
    } catch (err) {
      setStrikesState((s) => ({ ...s, loading: false, error: err.message || 'Could not load strikes.' }))
    }
  }, [apiJson])

  const loadAppeals = useCallback(async (page = 1) => {
    setAppealsState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/appeals?page=${page}&status=${encodeURIComponent(appealStatus)}`)
      setAppealsState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.appeals || [] })
    } catch (err) {
      setAppealsState((s) => ({ ...s, loading: false, error: err.message || 'Could not load appeals.' }))
    }
  }, [apiJson, appealStatus])

  const loadRestrictions = useCallback(async (page = 1) => {
    setRestrictionsState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/restrictions?page=${page}`)
      setRestrictionsState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.restrictions || [] })
    } catch (err) {
      setRestrictionsState((s) => ({ ...s, loading: false, error: err.message || 'Could not load restrictions.' }))
    }
  }, [apiJson])

  useEffect(() => { if (subTab === 'overview') void loadOverview() }, [subTab, loadOverview])
  useEffect(() => { if (subTab === 'cases') void loadCases(1) }, [subTab, loadCases])
  useEffect(() => { if (subTab === 'strikes' && !strikesState.loaded && !strikesState.loading) void loadStrikes(1) }, [subTab, strikesState.loaded, strikesState.loading, loadStrikes])
  useEffect(() => { if (subTab === 'appeals') void loadAppeals(1) }, [subTab, loadAppeals])
  useEffect(() => { if (subTab === 'restrictions' && !restrictionsState.loaded && !restrictionsState.loading) void loadRestrictions(1) }, [subTab, restrictionsState.loaded, restrictionsState.loading, loadRestrictions])

  /* ── Case detail ─────────────────────────────────────────────── */
  async function loadCaseDetail(caseId) {
    if (expandedCase?.id === caseId) { setExpandedCase(null); setCasePreview(null); return }
    setExpandedCaseLoading(true)
    setCasePreview(null)
    setCasePreviewLoading(true)
    try {
      const [data, preview] = await Promise.all([
        apiJson(`/api/admin/moderation/cases/${caseId}`),
        apiJson(`/api/admin/moderation/cases/${caseId}/preview`).catch(() => null),
      ])
      setExpandedCase(data)
      setCasePreview(preview)
    } catch (err) {
      setExpandedCase({ id: caseId, _error: err.message || 'Could not load case details.' })
    } finally {
      setExpandedCaseLoading(false)
      setCasePreviewLoading(false)
    }
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  function reviewCase(caseId, action) {
    const verb = action === 'dismiss' ? 'Dismiss' : 'Confirm'
    setConfirmAction({
      title: `${verb} this case?`,
      message: action === 'dismiss'
        ? 'The case will be marked as dismissed. No strike will be issued.'
        : 'The case will be confirmed. You can issue a strike separately if needed.',
      variant: action === 'dismiss' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          await apiJson(`/api/admin/moderation/cases/${caseId}/review`, { method: 'PATCH', body: JSON.stringify({ action }) })
          showToast(`Case ${action === 'dismiss' ? 'dismissed' : 'confirmed'}.`, 'success')
          setExpandedCase(null)
          await loadCases(casesState.page)
        } catch (err) {
          showToast(err.message || `Could not ${action} case.`, 'error')
        }
      },
    })
  }

  async function submitStrike() {
    const userId = Number.parseInt(strikeForm.userId, 10)
    if (!userId || !strikeForm.reason.trim()) { setStrikeError('User ID and reason are required.'); return }
    setStrikeSaving(true); setStrikeError('')
    try {
      await apiJson('/api/admin/moderation/strikes', { method: 'POST', body: JSON.stringify({ userId: Number(strikeForm.userId), reason: strikeForm.reason }) })
      setStrikeForm({ userId: '', reason: '', _selectedUser: null })
      await loadStrikes(1)
    } catch (err) {
      setStrikeError(err.message || 'Could not issue strike.')
    } finally {
      setStrikeSaving(false)
    }
  }

  function liftRestriction(restrictionId) {
    setConfirmAction({
      title: 'Lift this restriction?',
      message: 'The user will regain full write access immediately.',
      variant: 'default',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          await apiJson(`/api/admin/moderation/restrictions/${restrictionId}/lift`, { method: 'PATCH' })
          showToast('Restriction lifted.', 'success')
          await loadRestrictions(restrictionsState.page)
        } catch (err) {
          showToast(err.message || 'Could not lift restriction.', 'error')
        }
      },
    })
  }

  function reviewAppeal(appealId, action) {
    const verb = action === 'approve' ? 'Approve' : 'Reject'
    setConfirmAction({
      title: `${verb} this appeal?`,
      message: action === 'approve'
        ? 'Approving will decay the linked strike, dismiss the case, and may lift any active restriction.'
        : 'The appeal will be marked as rejected.',
      variant: action === 'approve' ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          await apiJson(`/api/admin/moderation/appeals/${appealId}/review`, { method: 'PATCH', body: JSON.stringify({ action }) })
          showToast(`Appeal ${action === 'approve' ? 'approved' : 'rejected'}.`, 'success')
          await loadAppeals(appealsState.page)
        } catch (err) {
          showToast(err.message || `Could not ${action} appeal.`, 'error')
        }
      },
    })
  }

  /* ── Claim / Unclaim ────────────────────────────────────────── */
  async function claimCase(caseId) {
    try {
      await apiJson(`/api/admin/moderation/cases/${caseId}/claim`, { method: 'POST' })
      showToast('Case claimed.', 'success')
      await loadCaseDetail(caseId)
      await loadCases(casesState.page)
    } catch (err) {
      showToast(err.message || 'Could not claim case.', 'error')
    }
  }

  async function unclaimCase(caseId) {
    try {
      await apiJson(`/api/admin/moderation/cases/${caseId}/unclaim`, { method: 'POST' })
      showToast('Claim released.', 'success')
      await loadCaseDetail(caseId)
      await loadCases(casesState.page)
    } catch (err) {
      showToast(err.message || 'Could not release claim.', 'error')
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--sh-border)', paddingBottom: 8, flexWrap: 'wrap' }}>
        {SUB_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSubTab(key)}
            style={{ padding: '7px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: subTab === key ? 'var(--sh-info-bg)' : 'transparent', color: subTab === key ? 'var(--sh-brand)' : 'var(--sh-muted)', fontWeight: subTab === key ? 800 : 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT, borderBottom: subTab === key ? '2px solid var(--sh-brand)' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <OverviewSubTab data={overviewData} loading={overviewLoading} formatDateTime={formatDateTime}
          onNavigateCase={(caseId) => { setSubTab('cases'); setTimeout(() => loadCaseDetail(caseId), 100) }} />
      )}
      {subTab === 'cases' && (
        <CasesSubTab casesState={casesState} caseStatus={caseStatus} setCaseStatus={setCaseStatus}
          caseSource={caseSource} setCaseSource={setCaseSource}
          caseClaimed={caseClaimed} setCaseClaimed={setCaseClaimed}
          caseTrustFilter={caseTrustFilter} setCaseTrustFilter={setCaseTrustFilter}
          caseSort={caseSort} setCaseSort={setCaseSort} expandedCase={expandedCase}
          setExpandedCase={setExpandedCase} expandedCaseLoading={expandedCaseLoading}
          casePreview={casePreview} casePreviewLoading={casePreviewLoading}
          loadCaseDetail={loadCaseDetail} loadCases={loadCases} reviewCase={reviewCase}
          claimCase={claimCase} unclaimCase={unclaimCase}
          apiJson={apiJson}
          setSubTab={setSubTab} setStrikeForm={setStrikeForm} formatDateTime={formatDateTime} />
      )}
      {subTab === 'strikes' && (
        <StrikesSubTab state={strikesState} strikeForm={strikeForm} strikeSaving={strikeSaving}
          strikeError={strikeError} onStrikeFormChange={setStrikeForm} onSubmitStrike={submitStrike}
          onPageChange={(p) => void loadStrikes(p)} />
      )}
      {subTab === 'appeals' && (
        <AppealsSubTab state={appealsState} appealStatus={appealStatus} onAppealStatusChange={setAppealStatus}
          onReviewAppeal={reviewAppeal} onPageChange={(p) => void loadAppeals(p)} />
      )}
      {subTab === 'restrictions' && (
        <RestrictionsSubTab state={restrictionsState} onLift={liftRestriction}
          onPageChange={(p) => void loadRestrictions(p)} />
      )}
    </>
  )
}

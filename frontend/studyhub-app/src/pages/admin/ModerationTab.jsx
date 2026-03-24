import { useCallback, useEffect, useState } from 'react'
import { FONT } from './adminConstants'
import { SUB_TABS, createState } from './moderationHelpers'
import { showToast } from '../../lib/toast'
import CasesSubTab from './CasesSubTab'
import StrikesSubTab from './StrikesSubTab'
import AppealsSubTab from './AppealsSubTab'
import RestrictionsSubTab from './RestrictionsSubTab'

export default function ModerationTab({ apiJson, setConfirmAction, formatDateTime }) {
  const [subTab, setSubTab] = useState('cases')

  const [casesState, setCasesState] = useState(createState)
  const [strikesState, setStrikesState] = useState(createState)
  const [appealsState, setAppealsState] = useState(createState)
  const [restrictionsState, setRestrictionsState] = useState(createState)

  const [caseStatus, setCaseStatus] = useState('pending')
  const [caseSort, setCaseSort] = useState('date')
  const [expandedCase, setExpandedCase] = useState(null)
  const [expandedCaseLoading, setExpandedCaseLoading] = useState(false)
  const [appealStatus, setAppealStatus] = useState('pending')
  const [strikeForm, setStrikeForm] = useState({ userId: '', reason: '', caseId: '' })
  const [strikeSaving, setStrikeSaving] = useState(false)
  const [strikeError, setStrikeError] = useState('')

  /* ── Loaders ─────────────────────────────────────────────────── */
  const loadCases = useCallback(async (page = 1) => {
    setCasesState((s) => ({ ...s, loading: true, error: '', page }))
    try {
      const data = await apiJson(`/api/admin/moderation/cases?page=${page}&status=${encodeURIComponent(caseStatus)}`)
      setCasesState({ loading: false, loaded: true, error: '', page: data.page || page, total: data.total || 0, items: data.cases || [] })
    } catch (err) {
      setCasesState((s) => ({ ...s, loading: false, error: err.message || 'Could not load cases.' }))
    }
  }, [apiJson, caseStatus])

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

  useEffect(() => { if (subTab === 'cases') void loadCases(1) }, [subTab, loadCases])
  useEffect(() => { if (subTab === 'strikes' && !strikesState.loaded && !strikesState.loading) void loadStrikes(1) }, [subTab, strikesState.loaded, strikesState.loading, loadStrikes])
  useEffect(() => { if (subTab === 'appeals') void loadAppeals(1) }, [subTab, loadAppeals])
  useEffect(() => { if (subTab === 'restrictions' && !restrictionsState.loaded && !restrictionsState.loading) void loadRestrictions(1) }, [subTab, restrictionsState.loaded, restrictionsState.loading, loadRestrictions])

  /* ── Case detail ─────────────────────────────────────────────── */
  async function loadCaseDetail(caseId) {
    if (expandedCase?.id === caseId) { setExpandedCase(null); return }
    setExpandedCaseLoading(true)
    try {
      const data = await apiJson(`/api/admin/moderation/cases/${caseId}`)
      setExpandedCase(data)
    } catch (err) {
      setExpandedCase({ id: caseId, _error: err.message || 'Could not load case details.' })
    } finally {
      setExpandedCaseLoading(false)
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
      const body = { userId, reason: strikeForm.reason.trim() }
      if (strikeForm.caseId) body.caseId = Number.parseInt(strikeForm.caseId, 10)
      await apiJson('/api/admin/moderation/strikes', { method: 'POST', body: JSON.stringify(body) })
      setStrikeForm({ userId: '', reason: '', caseId: '' })
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

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        {SUB_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSubTab(key)}
            style={{ padding: '7px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: subTab === key ? '#eff6ff' : 'transparent', color: subTab === key ? '#1d4ed8' : '#64748b', fontWeight: subTab === key ? 800 : 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT, borderBottom: subTab === key ? '2px solid #3b82f6' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'cases' && (
        <CasesSubTab casesState={casesState} caseStatus={caseStatus} setCaseStatus={setCaseStatus}
          caseSort={caseSort} setCaseSort={setCaseSort} expandedCase={expandedCase}
          setExpandedCase={setExpandedCase} expandedCaseLoading={expandedCaseLoading}
          loadCaseDetail={loadCaseDetail} loadCases={loadCases} reviewCase={reviewCase}
          setSubTab={setSubTab} setStrikeForm={setStrikeForm} formatDateTime={formatDateTime} />
      )}
      {subTab === 'strikes' && (
        <StrikesSubTab strikesState={strikesState} strikeForm={strikeForm} setStrikeForm={setStrikeForm}
          strikeSaving={strikeSaving} strikeError={strikeError} submitStrike={submitStrike}
          loadStrikes={loadStrikes} formatDateTime={formatDateTime} />
      )}
      {subTab === 'appeals' && (
        <AppealsSubTab appealsState={appealsState} appealStatus={appealStatus} setAppealStatus={setAppealStatus}
          loadAppeals={loadAppeals} reviewAppeal={reviewAppeal} formatDateTime={formatDateTime} />
      )}
      {subTab === 'restrictions' && (
        <RestrictionsSubTab restrictionsState={restrictionsState} loadRestrictions={loadRestrictions}
          liftRestriction={liftRestriction} formatDateTime={formatDateTime} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ModerationTab.jsx — Orchestrator for user-facing moderation UI
 *
 * Manages data fetching and section state. Renders:
 *   - StatusSection: Current restriction + strike counts
 *   - CasesSection: List of cases with inline appeal buttons
 *   - AppealsSection: Submitted appeals and outcomes
 *   - HistorySection: Paginated log of moderation actions
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { FONT } from './settingsState'
import { AppealModal } from './components/ModerationAppealModal'
import { StatusSection } from './components/ModerationStatusSection'
import { CasesSection } from './components/ModerationCasesSection'
import { AppealsSection } from './components/ModerationAppealsSection'
import { HistorySection } from './components/ModerationHistorySection'

const SECTION_TABS = ['status', 'cases', 'appeals', 'history']
const SECTION_LABELS = { status: 'My Status', cases: 'My Cases', appeals: 'My Appeals', history: 'My History' }

export default function ModerationTab() {
  const [section, setSection] = useState('status')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [appealTarget, setAppealTarget] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/moderation/my-status`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to load moderation status.')
      const json = await res.json()
      setData(json)
    } catch {
      setError('Could not load moderation status. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmitAppeal(caseId, reasonCategory, reason) {
    try {
      const res = await fetch(`${API}/api/moderation/appeals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, reasonCategory, reason }),
      })
      const json = await res.json()
      if (!res.ok) return { ok: false, error: json.error || 'Failed to submit appeal.' }
      await loadData()
      setSuccessMsg('Appeal submitted successfully. You will be notified when it is reviewed.')
      setTimeout(() => setSuccessMsg(''), 6000)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error. Please try again.' }
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ height: 80, background: 'var(--sh-soft)', borderRadius: 14, marginBottom: 12 }} />
        <div style={{ height: 60, background: 'var(--sh-soft)', borderRadius: 14 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
        background: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border)',
      }}>
        {error}
        <button
          type="button"
          onClick={loadData}
          style={{
            marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: 'none',
            background: 'var(--sh-danger)', color: '#fff', fontSize: 12,
            fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--sh-heading)' }}>
        Reports &amp; Moderation
      </h2>

      {/* Success toast */}
      {successMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14,
          background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)',
          border: '1px solid var(--sh-success-border)',
        }}>
          {successMsg}
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {SECTION_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: section === s ? 'var(--sh-brand)' : 'var(--sh-soft)',
              color: section === s ? '#fff' : 'var(--sh-subtext)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Section content */}
      {section === 'status' && <StatusSection data={data} />}
      {section === 'cases' && <CasesSection data={data} onAppeal={setAppealTarget} />}
      {section === 'appeals' && <AppealsSection data={data} />}
      {section === 'history' && <HistorySection />}

      {/* Appeal modal */}
      <AppealModal
        key={appealTarget?.id ?? 'closed'}
        open={!!appealTarget}
        caseData={appealTarget}
        onClose={() => setAppealTarget(null)}
        onSubmit={handleSubmitAppeal}
      />
    </div>
  )
}

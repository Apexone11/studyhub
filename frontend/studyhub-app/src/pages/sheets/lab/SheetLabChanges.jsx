/**
 * SheetLab Changes tab — shows uncommitted diff, lets owners commit,
 * and allows comparing any two versions via dropdown selectors.
 * Fetches GET /api/sheets/:id/lab/uncommitted-diff for the diff,
 * POST /api/sheets/:id/lab/commits to create a snapshot,
 * GET /api/sheets/:id/lab/diff/:a/:b to compare arbitrary versions.
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../../config'
import { authHeaders, truncateChecksum, timeAgo } from './sheetLabConstants'
import { getApiErrorMessage, readJsonSafely } from '../../../lib/http'
import { showToast } from '../../../lib/toast'
import { DiffViewer } from './SheetLabPanels'

export default function SheetLabChanges({ sheet, onCommitCreated }) {
  const [loading, setLoading] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [diff, setDiff] = useState(null)
  const [summary, setSummary] = useState('')
  const [lastCommit, setLastCommit] = useState(null)

  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  /* Version comparison state */
  const [allCommits, setAllCommits] = useState([])
  const [compareBase, setCompareBase] = useState('')
  const [compareHead, setCompareHead] = useState('')
  const [compareDiff, setCompareDiff] = useState(null)
  const [loadingCompare, setLoadingCompare] = useState(false)

  const fetchDiff = useCallback(async () => {
    if (!sheet?.id) return
    setLoading(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/uncommitted-diff`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load changes.'))
      setHasChanges(data.hasChanges || false)
      setDiff(data.diff || null)
      setSummary(data.summary || '')
      setLastCommit(data.lastCommit || null)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [sheet?.id])

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  /* Load all commits for the version comparison dropdowns */
  const fetchCommits = useCallback(async () => {
    if (!sheet?.id) return
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/commits?page=1&limit=100`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (response.ok && Array.isArray(data.commits)) {
        setAllCommits(data.commits)
      }
    } catch {
      // Non-critical — silently skip
    }
  }, [sheet?.id])

  useEffect(() => {
    fetchCommits()
  }, [fetchCommits])

  /* Fetch diff between two selected versions */
  useEffect(() => {
    if (!compareBase || !compareHead || compareBase === compareHead || !sheet?.id) {
      setCompareDiff(null)
      return
    }
    let cancelled = false
    const run = async () => {
      setLoadingCompare(true)
      try {
        const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/diff/${compareBase}/${compareHead}`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        const data = await readJsonSafely(response, {})
        if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not compute diff.'))
        if (!cancelled) setCompareDiff(data.diff)
      } catch (err) {
        if (!cancelled) showToast(err.message, 'error')
      } finally {
        if (!cancelled) setLoadingCompare(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [compareBase, compareHead, sheet?.id])

  const handleCommit = async () => {
    if (committing || !sheet?.id) return
    setCommitting(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/lab/commits`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: commitMessage.trim() || summary || 'Snapshot' }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not create snapshot.'))
      showToast('Snapshot created!', 'success')
      setCommitMessage('')
      if (onCommitCreated) onCommitCreated()
      // Refresh the diff — should now show "no changes"
      fetchDiff()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCommitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--sh-muted)', fontSize: 14 }}>
        Loading changes...
      </div>
    )
  }

  if (!hasChanges) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={emptyContainerStyle}>
          <div style={emptyIconStyle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--sh-success-text, #16a34a)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p style={emptyTitleStyle}>Everything is committed</p>
          <p style={emptyTextStyle}>
            {lastCommit
              ? `Last snapshot: "${lastCommit.message || 'Snapshot'}"`
              : 'No snapshots yet. Edit your sheet and come back to see changes.'}
          </p>
        </div>
        {allCommits.length >= 2 ? <VersionCompare commits={allCommits} compareBase={compareBase} compareHead={compareHead} setCompareBase={setCompareBase} setCompareHead={setCompareHead} compareDiff={compareDiff} loadingCompare={loadingCompare} /> : null}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary bar */}
      <div style={summaryBarStyle}>
        <span style={{ fontWeight: 700, color: 'var(--sh-heading)' }}>Uncommitted changes</span>
        <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>{summary}</span>
      </div>

      {/* Diff viewer */}
      {diff ? <DiffViewer diff={diff} title="Changes since last snapshot" /> : null}

      {/* Commit form */}
      <div style={commitBoxStyle}>
        <label style={labelStyle} htmlFor="commit-msg">Commit message</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            id="commit-msg"
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value.slice(0, 500))}
            placeholder={summary || 'Describe what changed...'}
            maxLength={500}
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter' && !committing) handleCommit() }}
          />
          <button
            type="button"
            onClick={handleCommit}
            disabled={committing}
            style={commitButtonStyle}
          >
            {committing ? 'Committing...' : 'Commit snapshot'}
          </button>
        </div>
      </div>

      {/* Version comparison */}
      {allCommits.length >= 2 ? <VersionCompare commits={allCommits} compareBase={compareBase} compareHead={compareHead} setCompareBase={setCompareBase} setCompareHead={setCompareHead} compareDiff={compareDiff} loadingCompare={loadingCompare} /> : null}
    </div>
  )
}

/* ── Version comparison sub-component ──────────────────────── */

function VersionCompare({ commits, compareBase, compareHead, setCompareBase, setCompareHead, compareDiff, loadingCompare }) {
  return (
    <div style={compareBoxStyle} aria-label="Version comparison">
      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        Compare versions
      </h4>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="compare-base" style={dropdownLabelStyle}>Base (older)</label>
          <select
            id="compare-base"
            value={compareBase}
            onChange={(e) => setCompareBase(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select version...</option>
            {commits.map((c) => (
              <option key={c.id} value={c.id}>
                {truncateChecksum(c.checksum)} — {c.message || 'Snapshot'} ({timeAgo(c.createdAt)})
              </option>
            ))}
          </select>
        </div>
        <span style={{ color: 'var(--sh-muted)', fontWeight: 700, fontSize: 16, marginTop: 18 }}>→</span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="compare-head" style={dropdownLabelStyle}>Compare (newer)</label>
          <select
            id="compare-head"
            value={compareHead}
            onChange={(e) => setCompareHead(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select version...</option>
            {commits.map((c) => (
              <option key={c.id} value={c.id}>
                {truncateChecksum(c.checksum)} — {c.message || 'Snapshot'} ({timeAgo(c.createdAt)})
              </option>
            ))}
          </select>
        </div>
      </div>
      {loadingCompare ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--sh-muted)', fontSize: 13 }}>
          Computing diff between versions...
        </div>
      ) : null}
      {compareDiff ? (
        <div style={{ marginTop: 12 }}>
          {compareDiff.additions != null ? (
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: 'var(--sh-success)' }}>+{compareDiff.additions} additions</span>
              <span style={{ color: 'var(--sh-danger)' }}>−{compareDiff.deletions} deletions</span>
            </div>
          ) : null}
          <DiffViewer diff={compareDiff} title="Version comparison" />
        </div>
      ) : null}
      {compareBase && compareHead && compareBase === compareHead ? (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, color: 'var(--sh-info-text, #1d4ed8)', background: 'var(--sh-info-bg, #eff6ff)', border: '1px solid var(--sh-info-border, #dbeafe)', marginTop: 10 }}>
          Base and compare versions are the same. Select two different versions to see changes.
        </div>
      ) : null}
    </div>
  )
}

/* ── Styles ────────────────────────────────────────────────── */

const emptyContainerStyle = {
  textAlign: 'center',
  padding: '48px 24px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: 14,
}

const emptyIconStyle = {
  width: 48, height: 48, borderRadius: '50%',
  background: 'var(--sh-success-bg, #f0fdf4)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 12,
}

const emptyTitleStyle = {
  fontSize: 15, fontWeight: 800, color: 'var(--sh-heading)', margin: '0 0 6px',
}

const emptyTextStyle = {
  fontSize: 13, color: 'var(--sh-muted)', margin: 0,
}

const summaryBarStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 14px', borderRadius: 10,
  background: 'var(--sh-warning-bg, #fffbeb)',
  border: '1px solid var(--sh-warning-border, #fde68a)',
}

const commitBoxStyle = {
  padding: 16, borderRadius: 14,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--sh-muted)', marginBottom: 8,
  textTransform: 'uppercase', letterSpacing: '0.3px',
}

const inputStyle = {
  flex: 1, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)', color: 'var(--sh-heading)',
  fontSize: 13, fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const commitButtonStyle = {
  padding: '10px 20px', borderRadius: 10,
  border: 'none', background: '#6366f1', color: '#fff',
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const compareBoxStyle = {
  padding: 16, borderRadius: 14,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
}

const dropdownLabelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--sh-muted)', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.3px',
}

const selectStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)', color: 'var(--sh-heading)',
  fontSize: 12, fontFamily: 'inherit',
  boxSizing: 'border-box',
}

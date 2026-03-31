import { useState } from 'react'
import { API } from '../../../config'
import { FONT } from '../viewer/sheetViewerConstants'

/**
 * Compact diff viewer used in the contribution sidebar cards.
 * Security: All diff content rendered as JSX text nodes — no dangerouslySetInnerHTML.
 */

/* ── Line number computation ─────────────────────────────────── */
function computeLineNumbers(hunk) {
  let oldNum = hunk.oldStart
  let newNum = hunk.newStart
  return hunk.lines.map((line) => {
    const result = { oldNum: null, newNum: null }
    if (line.type === 'equal') {
      result.oldNum = oldNum++
      result.newNum = newNum++
    } else if (line.type === 'remove') {
      result.oldNum = oldNum++
    } else if (line.type === 'add') {
      result.newNum = newNum++
    }
    return result
  })
}

/* ── Word-level segment renderer ─────────────────────────────── */
function SegmentSpans({ segments }) {
  if (!segments) return null
  return segments.map((seg, si) => (
    <span
      key={si}
      style={
        seg.type === 'add'
          ? { background: 'var(--sh-success-border)', borderRadius: 3, padding: '0 2px', fontWeight: 600 }
          : seg.type === 'remove'
            ? { background: 'var(--sh-danger-border)', borderRadius: 3, padding: '0 2px', textDecoration: 'line-through', opacity: 0.85 }
            : undefined
      }
    >
      {seg.text}
    </span>
  ))
}

/* ── Inline line number cell style ───────────────────────────── */
const lineNumStyle = {
  width: 32, minWidth: 32, padding: '1px 4px', textAlign: 'right',
  color: 'var(--sh-slate-400)', fontSize: 10, userSelect: 'none', opacity: 0.7,
}

export default function ContributionInlineDiff({ contributionId }) {
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [diffMode, setDiffMode] = useState('unified')

  const loadDiff = async () => {
    if (diff) {
      setVisible((v) => !v)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}/diff`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not load diff.')
      setDiff(data.diff)
      setVisible(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={loadDiff}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6, border: '1px solid var(--sh-info-border)',
          background: 'var(--sh-info-bg)', color: 'var(--sh-brand)', fontSize: 11, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', fontFamily: FONT,
        }}
      >
        {loading ? 'Loading...' : visible ? 'Hide changes' : 'View changes'}
      </button>
      {error ? <div style={{ fontSize: 11, color: 'var(--sh-danger)', marginTop: 4 }}>{error}</div> : null}
      {visible && diff ? (
        <div style={{ marginTop: 8, border: '1px solid var(--sh-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--sh-surface)' }}>
          {/* Header with stats + mode toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--sh-soft)', borderBottom: '1px solid var(--sh-border)' }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: 'var(--sh-success)' }}>+{diff.additions}</span>
              <span style={{ color: 'var(--sh-danger)' }}>-{diff.deletions}</span>
            </div>
            <div style={{ display: 'inline-flex', border: '1px solid var(--sh-border)', borderRadius: 6, overflow: 'hidden' }}>
              <button type="button" onClick={() => setDiffMode('unified')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', background: diffMode === 'unified' ? 'var(--sh-brand)' : 'var(--sh-surface)', color: diffMode === 'unified' ? 'var(--sh-btn-primary-text)' : 'var(--sh-subtext)', cursor: 'pointer' }}>
                Unified
              </button>
              <button type="button" onClick={() => setDiffMode('split')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', borderLeft: '1px solid var(--sh-border)', background: diffMode === 'split' ? 'var(--sh-brand)' : 'var(--sh-surface)', color: diffMode === 'split' ? 'var(--sh-btn-primary-text)' : 'var(--sh-subtext)', cursor: 'pointer' }}>
                Split
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.5 }}>
            {diffMode === 'unified' ? (
              /* ── Unified view with line numbers ─────────────── */
              (diff.hunks || []).map((hunk, hi) => {
                const lineNums = computeLineNumbers(hunk)
                return (
                  <div key={hi}>
                    <div style={{ background: 'var(--sh-info-bg)', color: 'var(--sh-brand)', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    {hunk.lines.map((line, li) => (
                      <div
                        key={li}
                        style={{
                          display: 'flex', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          background: line.type === 'add' ? 'var(--sh-success-bg)' : line.type === 'remove' ? 'var(--sh-danger-bg)' : 'transparent',
                          color: line.type === 'add' ? 'var(--sh-success-text)' : line.type === 'remove' ? 'var(--sh-danger-text)' : 'var(--sh-subtext)',
                        }}
                      >
                        <span style={{ ...lineNumStyle, borderRight: '1px solid var(--sh-border)' }} aria-hidden="true">
                          {lineNums[li].oldNum ?? ''}
                        </span>
                        <span style={lineNumStyle} aria-hidden="true">
                          {lineNums[li].newNum ?? ''}
                        </span>
                        <span style={{ width: 16, minWidth: 16, paddingLeft: 4, fontWeight: 700, userSelect: 'none' }}>
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                        </span>
                        <span style={{ padding: '1px 6px', flex: 1 }}>
                          {line.segments ? <SegmentSpans segments={line.segments} /> : (line.content || '\u00A0')}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })
            ) : (
              /* ── Split view with line numbers ──────────────── */
              (diff.hunks || []).map((hunk, hi) => {
                const lineNums = computeLineNumbers(hunk)
                const rows = []
                const lines = hunk.lines
                let i = 0
                while (i < lines.length) {
                  if (lines[i].type === 'equal') {
                    rows.push({ left: lines[i], right: lines[i], leftNum: lineNums[i].oldNum, rightNum: lineNums[i].newNum })
                    i++
                  } else {
                    const removes = [], adds = [], rNums = [], aNums = []
                    while (i < lines.length && lines[i].type === 'remove') { removes.push(lines[i]); rNums.push(lineNums[i].oldNum); i++ }
                    while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); aNums.push(lineNums[i].newNum); i++ }
                    const max = Math.max(removes.length, adds.length)
                    for (let j = 0; j < max; j++) rows.push({ left: removes[j] || null, right: adds[j] || null, leftNum: rNums[j] ?? null, rightNum: aNums[j] ?? null })
                  }
                }
                return (
                  <div key={hi}>
                    <div style={{ background: 'var(--sh-info-bg)', color: 'var(--sh-brand)', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    {rows.map((row, ri) => (
                      <div key={ri} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 32px 1fr', borderBottom: '1px solid var(--sh-soft)' }}>
                        <span style={lineNumStyle} aria-hidden="true">{row.leftNum ?? ''}</span>
                        <div style={{ padding: '1px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: row.left?.type === 'remove' ? 'var(--sh-danger-bg)' : 'transparent', color: row.left?.type === 'remove' ? 'var(--sh-danger-text)' : 'var(--sh-subtext)', minHeight: '1.5em', borderRight: '1px solid var(--sh-border)' }}>
                          {row.left ? (row.left.segments ? <SegmentSpans segments={row.left.segments} /> : (row.left.content || '\u00A0')) : ''}
                        </div>
                        <span style={lineNumStyle} aria-hidden="true">{row.rightNum ?? ''}</span>
                        <div style={{ padding: '1px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: row.right?.type === 'add' ? 'var(--sh-success-bg)' : 'transparent', color: row.right?.type === 'add' ? 'var(--sh-success-text)' : 'var(--sh-subtext)', minHeight: '1.5em' }}>
                          {row.right ? (row.right.segments ? <SegmentSpans segments={row.right.segments} /> : (row.right.content || '\u00A0')) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
            {diff.hunks?.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--sh-muted)', fontSize: 11 }}>No differences found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

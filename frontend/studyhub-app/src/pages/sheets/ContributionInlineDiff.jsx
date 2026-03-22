import { useState } from 'react'
import { API } from '../../config'
import { FONT } from './sheetViewerConstants'

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
          padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e7ff',
          background: '#f5f3ff', color: '#6366f1', fontSize: 11, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', fontFamily: FONT,
        }}
      >
        {loading ? 'Loading...' : visible ? 'Hide changes' : 'View changes'}
      </button>
      {error ? <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div> : null}
      {visible && diff ? (
        <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#16a34a' }}>+{diff.additions}</span>
              <span style={{ color: '#dc2626' }}>-{diff.deletions}</span>
            </div>
            <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <button type="button" onClick={() => setDiffMode('unified')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', background: diffMode === 'unified' ? '#6366f1' : '#fff', color: diffMode === 'unified' ? '#fff' : '#64748b', cursor: 'pointer' }}>
                Unified
              </button>
              <button type="button" onClick={() => setDiffMode('split')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', borderLeft: '1px solid #e2e8f0', background: diffMode === 'split' ? '#6366f1' : '#fff', color: diffMode === 'split' ? '#fff' : '#64748b', cursor: 'pointer' }}>
                Split
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.5 }}>
            {diffMode === 'unified' ? (
              (diff.hunks || []).map((hunk, hi) => (
                <div key={hi}>
                  <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line, li) => (
                    <div key={li} style={{ padding: '1px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: line.type === 'add' ? '#f0fdf4' : line.type === 'remove' ? '#fef2f2' : 'transparent', color: line.type === 'add' ? '#166534' : line.type === 'remove' ? '#991b1b' : '#64748b' }}>
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} {line.segments ? line.segments.map((seg, si) => (
                        <span key={si} style={seg.type === 'add' ? { background: '#bbf7d0', borderRadius: 2 } : seg.type === 'remove' ? { background: '#fecaca', borderRadius: 2, textDecoration: 'line-through' } : {}}>{seg.text}</span>
                      )) : line.content}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              (diff.hunks || []).map((hunk, hi) => {
                const rows = []
                const lines = hunk.lines
                let i = 0
                while (i < lines.length) {
                  if (lines[i].type === 'equal') {
                    rows.push({ left: lines[i], right: lines[i] })
                    i++
                  } else {
                    const removes = []
                    const adds = []
                    while (i < lines.length && lines[i].type === 'remove') { removes.push(lines[i]); i++ }
                    while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++ }
                    const max = Math.max(removes.length, adds.length)
                    for (let j = 0; j < max; j++) rows.push({ left: removes[j] || null, right: adds[j] || null })
                  }
                }
                return (
                  <div key={hi}>
                    <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    {rows.map((row, ri) => (
                      <div key={ri} className="sheet-diff-split">
                        <div style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRight: '1px solid #e2e8f0', background: row.left?.type === 'remove' ? '#fef2f2' : 'transparent', color: row.left?.type === 'remove' ? '#991b1b' : '#64748b', minHeight: '1.5em' }}>
                          {row.left ? (row.left.segments ? row.left.segments.map((seg, si) => <span key={si} style={seg.type === 'remove' ? { background: '#fecaca', borderRadius: 2 } : {}}>{seg.text}</span>) : row.left.content) : ''}
                        </div>
                        <div style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: row.right?.type === 'add' ? '#f0fdf4' : 'transparent', color: row.right?.type === 'add' ? '#166534' : '#64748b', minHeight: '1.5em' }}>
                          {row.right ? (row.right.segments ? row.right.segments.map((seg, si) => <span key={si} style={seg.type === 'add' ? { background: '#bbf7d0', borderRadius: 2 } : {}}>{seg.text}</span>) : row.right.content) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
            {diff.hunks?.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No differences found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

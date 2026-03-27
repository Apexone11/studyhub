/**
 * Sheet Lab — sub-panel components (diff viewers, word segments).
 */
import { useState } from 'react'

/* ── Word-level segment renderer ─────────────────────────────── */

export function WordSegments({ segments }) {
  if (!segments || segments.length === 0) return null
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') return <span key={i}>{seg.text}</span>
        return (
          <span
            key={i}
            className={`sheet-lab__word-${seg.type}`}
          >
            {seg.text}
          </span>
        )
      })}
    </>
  )
}

/* ── Unified Diff Viewer ──────────────────────────────────────── */

export function UnifiedDiffView({ diff }) {
  if (!diff) return null
  return (
    <div className="sheet-lab__diff-hunks">
      {(diff.hunks || []).map((hunk, hi) => (
        <div key={hi}>
          <div className="sheet-lab__diff-hunk-header">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {hunk.lines.map((line, li) => (
            <div
              key={li}
              className={`sheet-lab__diff-line sheet-lab__diff-line--${line.type}`}
            >
              <span className="sheet-lab__diff-gutter">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              <span className="sheet-lab__diff-content">
                {line.segments ? <WordSegments segments={line.segments} /> : line.content}
              </span>
            </div>
          ))}
        </div>
      ))}
      {diff.hunks?.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No differences found.
        </div>
      ) : null}
    </div>
  )
}

/* ── Side-by-Side Diff Viewer ─────────────────────────────────── */

export function SplitDiffView({ diff }) {
  if (!diff) return null

  // Build paired rows from hunks for side-by-side display
  const rows = []
  for (const hunk of (diff.hunks || [])) {
    rows.push({ type: 'header', text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` })

    const lines = hunk.lines
    let i = 0
    while (i < lines.length) {
      if (lines[i].type === 'equal') {
        rows.push({ type: 'equal', left: lines[i], right: lines[i] })
        i++
      } else {
        // Collect consecutive removes and adds
        const removes = []
        const adds = []
        while (i < lines.length && lines[i].type === 'remove') {
          removes.push(lines[i])
          i++
        }
        while (i < lines.length && lines[i].type === 'add') {
          adds.push(lines[i])
          i++
        }
        const max = Math.max(removes.length, adds.length)
        for (let j = 0; j < max; j++) {
          rows.push({
            type: 'change',
            left: removes[j] || null,
            right: adds[j] || null,
          })
        }
      }
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No differences found.
      </div>
    )
  }

  return (
    <div className="sheet-lab__split-diff">
      <div className="sheet-lab__split-header">
        <div className="sheet-lab__split-col-header">Old</div>
        <div className="sheet-lab__split-col-header">New</div>
      </div>
      {rows.map((row, ri) => {
        if (row.type === 'header') {
          return (
            <div key={ri} className="sheet-lab__split-hunk-header">
              {row.text}
            </div>
          )
        }

        return (
          <div key={ri} className="sheet-lab__split-row">
            <div className={`sheet-lab__split-cell ${row.left?.type === 'remove' ? 'sheet-lab__split-cell--remove' : row.left?.type === 'equal' ? '' : 'sheet-lab__split-cell--empty'}`}>
              {row.left ? (
                row.left.segments ? <WordSegments segments={row.left.segments} /> : row.left.content
              ) : ''}
            </div>
            <div className={`sheet-lab__split-cell ${row.right?.type === 'add' ? 'sheet-lab__split-cell--add' : row.right?.type === 'equal' ? '' : 'sheet-lab__split-cell--empty'}`}>
              {row.right ? (
                row.right.segments ? <WordSegments segments={row.right.segments} /> : row.right.content
              ) : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── DiffViewer with mode toggle ──────────────────────────────── */

export function DiffViewer({ diff, title }) {
  const [mode, setMode] = useState('unified')

  return (
    <div className="sheet-lab__diff">
      <div className="sheet-lab__diff-header">
        <h3 className="sheet-lab__diff-title">{title || 'Diff'}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="sheet-lab__diff-stats">
            <span className="sheet-lab__diff-additions">+{diff.additions}</span>
            <span className="sheet-lab__diff-deletions">-{diff.deletions}</span>
          </div>
          <div className="sheet-lab__diff-mode-toggle">
            <button
              type="button"
              className={`sheet-lab__diff-mode-btn${mode === 'unified' ? ' active' : ''}`}
              onClick={() => setMode('unified')}
            >
              Unified
            </button>
            <button
              type="button"
              className={`sheet-lab__diff-mode-btn${mode === 'split' ? ' active' : ''}`}
              onClick={() => setMode('split')}
            >
              Split
            </button>
          </div>
        </div>
      </div>
      {mode === 'unified' ? <UnifiedDiffView diff={diff} /> : <SplitDiffView diff={diff} />}
    </div>
  )
}

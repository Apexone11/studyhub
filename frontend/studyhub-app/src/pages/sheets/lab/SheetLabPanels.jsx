/**
 * Sheet Lab — sub-panel components (diff viewers, word segments).
 *
 * Security: All diff content is rendered via React JSX text nodes.
 * No dangerouslySetInnerHTML. User content in `line.content` and
 * `seg.text` is always escaped by React's default behavior.
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

/* ── Line number helper ──────────────────────────────────────── */

/**
 * Compute line numbers for each line in a hunk.
 * Returns { oldNum, newNum } for each line.
 */
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

/* ── Hunk separator ──────────────────────────────────────────── */

function HunkSeparator({ hunk }) {
  return (
    <div className="sheet-lab__diff-hunk-header">
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </div>
  )
}

/* ── Unified Diff Viewer ──────────────────────────────────────── */

export function UnifiedDiffView({ diff }) {
  if (!diff) return null
  return (
    <div className="sheet-lab__diff-hunks">
      {(diff.hunks || []).map((hunk, hi) => {
        const lineNums = computeLineNumbers(hunk)
        return (
          <div key={hi}>
            <HunkSeparator hunk={hunk} />
            {hunk.lines.map((line, li) => (
              <div
                key={li}
                className={`sheet-lab__diff-line sheet-lab__diff-line--${line.type}`}
              >
                <span className="sheet-lab__diff-linenum sheet-lab__diff-linenum--old" aria-hidden="true">
                  {lineNums[li].oldNum ?? ''}
                </span>
                <span className="sheet-lab__diff-linenum sheet-lab__diff-linenum--new" aria-hidden="true">
                  {lineNums[li].newNum ?? ''}
                </span>
                <span className="sheet-lab__diff-gutter">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="sheet-lab__diff-content">
                  {line.segments ? <WordSegments segments={line.segments} /> : (line.content || '\u00A0')}
                </span>
              </div>
            ))}
          </div>
        )
      })}
      {diff.hunks?.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--sh-muted, #94a3b8)', fontSize: 13 }}>
          No differences found.
        </div>
      ) : null}
    </div>
  )
}

/* ── Side-by-Side Diff Viewer ─────────────────────────────────── */

export function SplitDiffView({ diff }) {
  if (!diff) return null

  const rows = []
  for (const hunk of (diff.hunks || [])) {
    rows.push({ type: 'header', text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` })

    const lineNums = computeLineNumbers(hunk)
    const lines = hunk.lines
    let i = 0
    while (i < lines.length) {
      if (lines[i].type === 'equal') {
        rows.push({ type: 'equal', left: lines[i], right: lines[i], leftNum: lineNums[i].oldNum, rightNum: lineNums[i].newNum })
        i++
      } else {
        const removes = []
        const adds = []
        const removeNums = []
        const addNums = []
        while (i < lines.length && lines[i].type === 'remove') {
          removes.push(lines[i])
          removeNums.push(lineNums[i].oldNum)
          i++
        }
        while (i < lines.length && lines[i].type === 'add') {
          adds.push(lines[i])
          addNums.push(lineNums[i].newNum)
          i++
        }
        const max = Math.max(removes.length, adds.length)
        for (let j = 0; j < max; j++) {
          rows.push({
            type: 'change',
            left: removes[j] || null,
            right: adds[j] || null,
            leftNum: removeNums[j] ?? null,
            rightNum: addNums[j] ?? null,
          })
        }
      }
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--sh-muted, #94a3b8)', fontSize: 13 }}>
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
            <span className="sheet-lab__split-linenum" aria-hidden="true">
              {row.leftNum ?? ''}
            </span>
            <div className={`sheet-lab__split-cell ${row.left?.type === 'remove' ? 'sheet-lab__split-cell--remove' : row.left?.type === 'equal' ? '' : 'sheet-lab__split-cell--empty'}`}>
              {row.left ? (
                row.left.segments ? <WordSegments segments={row.left.segments} /> : (row.left.content || '\u00A0')
              ) : ''}
            </div>
            <span className="sheet-lab__split-linenum" aria-hidden="true">
              {row.rightNum ?? ''}
            </span>
            <div className={`sheet-lab__split-cell ${row.right?.type === 'add' ? 'sheet-lab__split-cell--add' : row.right?.type === 'equal' ? '' : 'sheet-lab__split-cell--empty'}`}>
              {row.right ? (
                row.right.segments ? <WordSegments segments={row.right.segments} /> : (row.right.content || '\u00A0')
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

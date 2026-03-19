/**
 * Simple line-based diff utility using Longest Common Subsequence (LCS).
 * Returns additions, deletions, and hunks for display.
 */

/**
 * Compute the LCS table for two arrays of lines.
 */
function lcsTable(linesA, linesB) {
  const m = linesA.length
  const n = linesB.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}

/**
 * Backtrack the LCS table to produce a sequence of edit operations.
 * Each operation is { type: 'equal' | 'add' | 'remove', line: string, oldIndex, newIndex }
 */
function backtrack(dp, linesA, linesB) {
  const ops = []
  let i = linesA.length
  let j = linesB.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: 'equal', line: linesA[i - 1], oldIndex: i, newIndex: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', line: linesB[j - 1], oldIndex: null, newIndex: j })
      j--
    } else {
      ops.push({ type: 'remove', line: linesA[i - 1], oldIndex: i, newIndex: null })
      i--
    }
  }

  return ops.reverse()
}

/**
 * Group consecutive edit operations into hunks (context-free).
 * A new hunk starts when there is a gap of more than 3 equal lines.
 */
function groupIntoHunks(ops) {
  const CONTEXT = 3
  const hunks = []

  // Find ranges of changes (non-equal ops)
  const changeIndices = []
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'equal') {
      changeIndices.push(i)
    }
  }

  if (changeIndices.length === 0) return hunks

  // Group change indices that are close together (within CONTEXT lines)
  const groups = []
  let groupStart = changeIndices[0]
  let groupEnd = changeIndices[0]

  for (let k = 1; k < changeIndices.length; k++) {
    if (changeIndices[k] - groupEnd <= CONTEXT * 2 + 1) {
      groupEnd = changeIndices[k]
    } else {
      groups.push([groupStart, groupEnd])
      groupStart = changeIndices[k]
      groupEnd = changeIndices[k]
    }
  }
  groups.push([groupStart, groupEnd])

  // Build hunks from groups with surrounding context
  for (const [gStart, gEnd] of groups) {
    const hunkStart = Math.max(0, gStart - CONTEXT)
    const hunkEnd = Math.min(ops.length - 1, gEnd + CONTEXT)

    let oldStart = null
    let newStart = null
    let oldLineCount = 0
    let newLineCount = 0
    const lines = []

    for (let i = hunkStart; i <= hunkEnd; i++) {
      const op = ops[i]

      if (op.type === 'equal') {
        if (oldStart === null) oldStart = op.oldIndex
        if (newStart === null) newStart = op.newIndex
        oldLineCount++
        newLineCount++
        lines.push({ type: 'equal', content: op.line })
      } else if (op.type === 'remove') {
        if (oldStart === null) oldStart = op.oldIndex
        oldLineCount++
        lines.push({ type: 'remove', content: op.line })
      } else if (op.type === 'add') {
        if (newStart === null) newStart = op.newIndex
        newLineCount++
        lines.push({ type: 'add', content: op.line })
      }
    }

    hunks.push({
      oldStart: oldStart || 1,
      oldLines: oldLineCount,
      newStart: newStart || 1,
      newLines: newLineCount,
      lines,
    })
  }

  return hunks
}

/**
 * Compute a line-based diff between two text strings.
 * @param {string} textA - The original text
 * @param {string} textB - The new text
 * @returns {{ additions: number, deletions: number, hunks: Array }}
 */
const MAX_DIFF_LINES = 5000

function computeLineDiff(textA, textB) {
  const linesA = (textA || '').split('\n')
  const linesB = (textB || '').split('\n')

  if (linesA.length > MAX_DIFF_LINES || linesB.length > MAX_DIFF_LINES) {
    return {
      additions: 0,
      deletions: 0,
      hunks: [],
      truncated: true,
      message: `Diff skipped: content exceeds ${MAX_DIFF_LINES} lines.`,
    }
  }

  const dp = lcsTable(linesA, linesB)
  const ops = backtrack(dp, linesA, linesB)

  let additions = 0
  let deletions = 0

  for (const op of ops) {
    if (op.type === 'add') additions++
    if (op.type === 'remove') deletions++
  }

  const hunks = groupIntoHunks(ops)

  return { additions, deletions, hunks }
}

module.exports = { computeLineDiff }

/**
 * Line-based and word-level diff utility using Longest Common Subsequence (LCS).
 * Returns additions, deletions, hunks, and word-level highlight segments.
 */

/**
 * Compute the LCS table for two arrays of tokens.
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

/**
 * Compute word-level diff segments between two strings.
 * Returns an array of { type: 'equal'|'add'|'remove', text: string } segments.
 * Used to highlight exactly which words changed within a modified line.
 */
function computeWordSegments(lineA, lineB) {
  const wordsA = (lineA || '').split(/(\s+)/)
  const wordsB = (lineB || '').split(/(\s+)/)

  if (wordsA.length > 200 || wordsB.length > 200) {
    return {
      oldSegments: [{ type: 'remove', text: lineA }],
      newSegments: [{ type: 'add', text: lineB }],
    }
  }

  const dp = lcsTable(wordsA, wordsB)
  const ops = backtrack(dp, wordsA, wordsB)

  const oldSegments = []
  const newSegments = []

  for (const op of ops) {
    if (op.type === 'equal') {
      oldSegments.push({ type: 'equal', text: op.line })
      newSegments.push({ type: 'equal', text: op.line })
    } else if (op.type === 'remove') {
      oldSegments.push({ type: 'remove', text: op.line })
    } else if (op.type === 'add') {
      newSegments.push({ type: 'add', text: op.line })
    }
  }

  return { oldSegments, newSegments }
}

/**
 * Enhance hunks with word-level diff segments.
 * For adjacent remove/add pairs, compute word-level diffs and attach segments.
 */
function addWordSegments(hunks) {
  for (const hunk of hunks) {
    const lines = hunk.lines
    let i = 0

    while (i < lines.length) {
      // Find consecutive remove lines followed by consecutive add lines
      if (lines[i].type === 'remove') {
        const removeStart = i
        while (i < lines.length && lines[i].type === 'remove') i++
        const addStart = i
        while (i < lines.length && lines[i].type === 'add') i++
        const addEnd = i

        const removes = lines.slice(removeStart, addStart)
        const adds = lines.slice(addStart, addEnd)

        // Pair up remove/add lines for word-level diff
        const pairCount = Math.min(removes.length, adds.length)
        for (let p = 0; p < pairCount; p++) {
          const { oldSegments, newSegments } = computeWordSegments(
            removes[p].content,
            adds[p].content,
          )
          removes[p].segments = oldSegments
          adds[p].segments = newSegments
        }
      } else {
        i++
      }
    }
  }

  return hunks
}

/**
 * Generate an auto-summary describing the changes between two texts.
 * Returns a short human-readable string like "Added 5 lines, removed 2 lines in 3 sections".
 */
function generateChangeSummary(textA, textB) {
  const a = textA || ''
  const b = textB || ''

  if (a === b) return 'No changes'

  const linesB = b.split('\n')
  const wordsA = a.split(/\s+/).filter(Boolean).length
  const wordsB = b.split(/\s+/).filter(Boolean).length
  const wordDelta = wordsB - wordsA

  if (a.trim().length === 0 && b.trim().length > 0) {
    return `Initial content (${linesB.length} lines, ${wordsB} words)`
  }

  const diff = computeLineDiff(a, b)
  const parts = []

  if (diff.additions > 0) parts.push(`+${diff.additions} line${diff.additions === 1 ? '' : 's'}`)
  if (diff.deletions > 0) parts.push(`-${diff.deletions} line${diff.deletions === 1 ? '' : 's'}`)

  if (wordDelta > 0) parts.push(`+${wordDelta} words`)
  else if (wordDelta < 0) parts.push(`${wordDelta} words`)

  const sectionCount = diff.hunks.length
  if (sectionCount > 1) parts.push(`across ${sectionCount} sections`)

  return parts.join(', ') || 'Minor formatting changes'
}

module.exports = { computeLineDiff, addWordSegments, generateChangeSummary }

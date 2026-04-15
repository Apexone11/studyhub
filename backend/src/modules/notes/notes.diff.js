const { diffWordsWithSpace } = require('diff')

function buildWordDiff(oldText, newText) {
  const parts = diffWordsWithSpace(oldText ?? '', newText ?? '')
  let added = 0
  let removed = 0
  const chunks = parts.map((p) => {
    const type = p.added ? 'add' : p.removed ? 'remove' : 'equal'
    if (type === 'add') added += p.value.split(/\s+/).filter(Boolean).length
    if (type === 'remove') removed += p.value.split(/\s+/).filter(Boolean).length
    return { type, text: p.value }
  })
  return { chunks, summary: { added, removed } }
}

module.exports = { buildWordDiff }

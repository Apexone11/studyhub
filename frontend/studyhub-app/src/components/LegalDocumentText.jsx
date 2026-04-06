const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    color: 'var(--sh-text)',
    fontSize: 13,
    lineHeight: 1.75,
  },
  heading: {
    margin: '8px 0 0',
    color: 'var(--sh-heading)',
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.4,
  },
  paragraph: {
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
}

function cleanListItem(line) {
  return line.replace(/^[-*•]\s*/, '').trim()
}

function isHeadingBlock(lines) {
  return (
    lines.length === 1
    && (/^[A-Z0-9][A-Z0-9 .,&()'"/:;-]{4,}$/.test(lines[0]) || /^\d+\.\s.+$/.test(lines[0]))
  )
}

function isListBlock(lines) {
  return (
    lines.length > 1
    && lines.every((line) => {
      const trimmed = line.trim()
      return (
        Boolean(trimmed)
        && trimmed.length <= 180
        && !/^In Short:/i.test(trimmed)
        && !/[.!?]$/.test(trimmed)
      )
    })
  )
}

export default function LegalDocumentText({ bodyText }) {
  const blocks = String(bodyText || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return (
    <div style={styles.content}>
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        if (lines.length === 0) return null

        if (isHeadingBlock(lines)) {
          return (
            <h3 key={`${index}-${lines[0]}`} style={styles.heading}>
              {lines[0]}
            </h3>
          )
        }

        if (isListBlock(lines)) {
          return (
            <ul key={`${index}-${lines[0]}`} style={styles.list}>
              {lines.map((line) => (
                <li key={`${index}-${line}`}>{cleanListItem(line)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={`${index}-${lines[0]}`} style={styles.paragraph}>
            {block}
          </p>
        )
      })}
    </div>
  )
}
function getStyles(variant) {
  const isModal = variant === 'modal'

  return {
    article: {
      display: 'flex',
      flexDirection: 'column',
      gap: isModal ? 18 : 20,
      color: 'var(--sh-text)',
      fontSize: isModal ? 13.5 : 14,
      lineHeight: isModal ? 1.78 : 1.82,
    },
    introCard: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: isModal ? '16px 18px' : '18px 20px',
      borderRadius: 18,
      border: '1px solid var(--sh-border)',
      background: 'linear-gradient(180deg, var(--sh-surface) 0%, var(--sh-soft) 100%)',
      boxShadow: 'var(--shadow-sm)',
    },
    eyebrow: {
      margin: 0,
      color: 'var(--sh-brand)',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    title: {
      margin: 0,
      color: 'var(--sh-heading)',
      fontSize: isModal ? 19 : 24,
      fontWeight: 800,
      lineHeight: 1.2,
    },
    updated: {
      margin: 0,
      color: 'var(--sh-muted)',
      fontSize: isModal ? 12 : 12.5,
      fontWeight: 600,
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    heading: {
      margin: 0,
      color: 'var(--sh-heading)',
      fontSize: isModal ? 15.5 : 18,
      fontWeight: 800,
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
    },
    callout: {
      margin: 0,
      padding: isModal ? '12px 14px' : '13px 16px',
      borderRadius: 14,
      background: 'var(--sh-info-bg)',
      border: '1px solid var(--sh-info-border)',
      color: 'var(--sh-info-text)',
      fontWeight: 600,
    },
    paragraph: {
      margin: 0,
      color: 'var(--sh-text)',
    },
    lead: {
      margin: 0,
      color: 'var(--sh-heading)',
      fontWeight: 700,
    },
    list: {
      margin: 0,
      paddingLeft: isModal ? 20 : 22,
      display: 'flex',
      flexDirection: 'column',
      gap: isModal ? 7 : 8,
      color: 'var(--sh-text)',
    },
    tocList: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
      display: 'grid',
      gap: 8,
    },
    tocItem: {
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      padding: isModal ? '10px 12px' : '11px 14px',
      borderRadius: 12,
      border: '1px solid var(--sh-border)',
      background: 'var(--sh-surface)',
    },
    tocNumber: {
      minWidth: 24,
      color: 'var(--sh-brand)',
      fontWeight: 800,
      fontSize: isModal ? 12 : 12.5,
    },
    tocText: {
      color: 'var(--sh-heading)',
      fontWeight: 600,
    },
  }
}

function cleanListItem(line) {
  return line.replace(/^[-*•]\s*/, '').trim()
}

function normalizeLegalText(value) {
  let text = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  text = text.replace(/([a-z0-9)\]])\.([A-Z])/g, '$1.\n\n$2')
  text = text.replace(/([a-z0-9,)])([A-Z]{2,}(?:\s+[A-Z0-9][A-Z0-9'"/&(),:;-]{2,}){1,})(?=[A-Z][a-z])/g, '$1\n\n$2')
  text = text.replace(/([A-Z][A-Z &'"/(),:;-]{6,})(Last updated\s+[A-Z][a-z]+\s+\d{2},\s+\d{4})/g, '$1\n$2')
  text = text.replace(/(Last updated\s+[A-Z][a-z]+\s+\d{2},\s+\d{4})([A-Z])/g, '$1\n\n$2')
  text = text.replace(/(TABLE OF CONTENTS)(\d+\.\s+)/g, '$1\n$2')
  text = text.replace(/([^\n])(\d+\.\s+[A-Z])/g, '$1\n$2')
  text = text.replace(/(\?)([A-Z][a-z])/g, '$1\n\n$2')
  text = text.replace(/(In Short:)([A-Z])/g, '$1 $2')
  text = text.replace(/(following:)([A-Za-z])/gi, '$1\n$2')
  text = text.replace(
    /(The personal information we collect may include the following:)\s*names\s*email addresses\s*usernames\s*passwords\s*debit\/credit card numbers/gi,
    '$1\n- names\n- email addresses\n- usernames\n- passwords\n- debit/credit card numbers',
  )
  text = text.replace(
    /(you can:)\s*Log in to your account settings and update your user account\.\s*Contact us using the contact information provided\./gi,
    '$1\n- Log in to your account settings and update your user account.\n- Contact us using the contact information provided.',
  )
  text = text.replace(/(These rights include:)\s*Right to/gi, '$1\n- Right to')
  text = text.replace(/(Category [A-Z] - [^.]+)(Category [A-Z] - )/g, '$1\n$2')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text
}

function isTitleLine(line) {
  return /^[A-Z][A-Z &'"/(),:;-]{8,}$/.test(line) && !/^TABLE OF CONTENTS$/i.test(line)
}

function isHeadingLine(line) {
  return (
    /^\d+\.\s+[A-Z][A-Z0-9 &'"/(),:;?-]{4,}$/.test(line)
    || /^[A-Z][A-Z0-9 &'"/(),:;?-]{5,}$/.test(line)
    || /^[A-Z][a-z]+(?: [A-Z][a-z'"/()-]+){0,7}$/.test(line)
  )
}

function isListLine(line) {
  const trimmed = line.trim()
  return /^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)
}

function getListType(lines) {
  return lines.every((line) => /^\d+\.\s+/.test(line.trim())) ? 'ordered' : 'unordered'
}

function parseNumberedListItem(line) {
  const match = line.trim().match(/^(\d+)\.\s+(.*)$/)
  if (!match) return { number: '', text: cleanListItem(line) }
  return { number: match[1], text: match[2].trim() }
}

function parseBlocks(text) {
  const blocks = normalizeLegalText(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  let title = ''
  let updated = ''

  if (blocks[0] && isTitleLine(blocks[0])) {
    title = blocks.shift()
  }

  if (blocks[0] && /^Last updated\s+/i.test(blocks[0])) {
    updated = blocks.shift()
  }

  return { title, updated, blocks }
}

export default function LegalDocumentText({ bodyText, variant = 'default' }) {
  const styles = getStyles(variant)
  const { title, updated, blocks } = parseBlocks(bodyText)

  return (
    <article style={styles.article}>
      {(title || updated) && (
        <div style={styles.introCard}>
          <p style={styles.eyebrow}>Current Legal Copy</p>
          {title ? <h3 style={styles.title}>{title}</h3> : null}
          {updated ? <p style={styles.updated}>{updated}</p> : null}
        </div>
      )}

      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        if (lines.length === 0) return null

        if (/^In Short:/i.test(block)) {
          return (
            <p key={`${index}-${lines[0]}`} style={styles.callout}>
              {block}
            </p>
          )
        }

        if (lines[0] === 'TABLE OF CONTENTS' && lines.length > 1) {
          return (
            <section key={`${index}-${lines[0]}`} style={styles.section}>
              <h4 style={styles.heading}>{lines[0]}</h4>
              <ol style={styles.tocList}>
                {lines.slice(1).map((line) => {
                  const item = parseNumberedListItem(line)
                  return (
                    <li key={`${index}-${line}`} style={styles.tocItem}>
                      <span style={styles.tocNumber}>{item.number}</span>
                      <span style={styles.tocText}>{item.text}</span>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        }

        if (lines.length === 1 && isHeadingLine(lines[0])) {
          return (
            <h4 key={`${index}-${lines[0]}`} style={styles.heading}>
              {lines[0]}
            </h4>
          )
        }

        if (lines.length > 1 && lines[0].endsWith(':') && lines.slice(1).every((line) => line.length <= 180)) {
          const listType = getListType(lines.slice(1))
          const ListTag = listType === 'ordered' ? 'ol' : 'ul'
          return (
            <section key={`${index}-${lines[0]}`} style={styles.section}>
              <p style={styles.lead}>{lines[0]}</p>
              <ListTag style={styles.list}>
                {lines.slice(1).map((line) => (
                  <li key={`${index}-${line}`}>{cleanListItem(line)}</li>
                ))}
              </ListTag>
            </section>
          )
        }

        if (lines.every(isListLine)) {
          const listType = getListType(lines)
          const ListTag = listType === 'ordered' ? 'ol' : 'ul'
          return (
            <ListTag key={`${index}-${lines[0]}`} style={styles.list}>
              {lines.map((line) => (
                <li key={`${index}-${line}`}>{cleanListItem(line)}</li>
              ))}
            </ListTag>
          )
        }

        return (
          <p key={`${index}-${lines[0]}`} style={styles.paragraph}>
            {lines.join(' ')}
          </p>
        )
      })}
    </article>
  )
}
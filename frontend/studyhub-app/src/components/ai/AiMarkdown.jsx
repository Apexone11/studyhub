/**
 * AiMarkdown.jsx -- Simple markdown renderer for Hub AI messages.
 * Handles headings, bold, italic, code blocks, inline code, lists, blockquotes, and links.
 * No external dependency -- just a lightweight parser for chat messages.
 */
import { useState } from 'react'

/** Code block with copy-to-clipboard button. */
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* clipboard not available */ })
  }

  return (
    <div style={{
      background: 'var(--sh-slate-900)', borderRadius: 10,
      margin: '8px 0', overflow: 'auto', position: 'relative',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px 0',
      }}>
        <span style={{
          fontSize: 10, color: 'var(--sh-slate-500)', letterSpacing: '.06em',
          textTransform: 'uppercase',
        }}>{lang || ''}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none', border: '1px solid var(--sh-slate-700)',
            borderRadius: 6, padding: '2px 8px', fontSize: 10,
            color: copied ? 'var(--sh-success-text, #22c55e)' : 'var(--sh-slate-400)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s',
          }}
        >{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre style={{
        margin: 0, fontFamily: "'Fira Code', monospace", fontSize: 12,
        color: 'var(--sh-slate-200)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', padding: '8px 14px 12px',
      }}>{code}</pre>
    </div>
  )
}

/** Render inline markdown (bold, italic, inline code, links).
 *  @param {string} text
 *  @param {boolean} [invertColors] - true inside user message bubbles (white text on brand bg)
 */
function renderInline(text, invertColors = false) {
  const parts = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code key={key++} style={{
          background: invertColors ? 'rgba(255,255,255,0.18)' : 'var(--sh-soft)',
          padding: '1px 5px', borderRadius: 4,
          fontSize: '0.9em', fontFamily: 'monospace',
          color: invertColors ? '#fff' : 'var(--sh-brand)',
        }}>{codeMatch[1]}</code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic
    const italicMatch = remaining.match(/^\*(.+?)\*/)
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Link (only allow safe protocols to prevent javascript: XSS)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const href = linkMatch[2]
      const isSafeHref = /^(https?:|mailto:|#|\/)/i.test(href.trim())
      if (isSafeHref) {
        parts.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--sh-brand)', textDecoration: 'underline' }}>
            {linkMatch[1]}
          </a>
        )
      } else {
        // Render unsafe links as plain text
        parts.push(<span key={key++}>{linkMatch[1]}</span>)
      }
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text -- consume until next special character
    const nextSpecial = remaining.slice(1).search(/[`*[]/)
    const end = nextSpecial === -1 ? remaining.length : nextSpecial + 1
    parts.push(<span key={key++}>{remaining.slice(0, end)}</span>)
    remaining = remaining.slice(end)
  }

  return parts
}

export default function AiMarkdown({ content, invertColors = false }) {
  if (!content) return null

  const lines = content.split('\n')
  const nodes = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes = { 1: 18, 2: 16, 3: 14, 4: 13 }
      nodes.push(
        <div key={i} style={{
          fontSize: sizes[level], fontWeight: 700, color: 'var(--sh-heading)',
          margin: level === 1 ? '12px 0 8px' : '10px 0 4px',
        }}>
          {renderInline(headingMatch[2], invertColors)}
        </div>
      )
      i++
      continue
    }

    // Code block
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim()
      let code = ''
      i++
      while (i < lines.length && !lines[i].match(/^```/)) {
        code += lines[i] + '\n'
        i++
      }
      nodes.push(
        <CodeBlock key={i} lang={lang} code={code.trimEnd()} />
      )
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <div key={i} style={{
          borderLeft: '3px solid var(--sh-brand)', background: 'var(--sh-info-bg)',
          padding: '8px 12px', borderRadius: '0 8px 8px 0', margin: '6px 0',
        }}>
          <div style={{ fontSize: 13, color: 'var(--sh-info-text)', fontStyle: 'italic' }}>
            {renderInline(line.slice(2), invertColors)}
          </div>
        </div>
      )
      i++
      continue
    }

    // Unordered list
    if (line.match(/^[-*+]\s/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^[-*+]\s/)) {
        items.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <ul key={`ul${i}`} style={{ margin: '4px 0 8px 20px', padding: 0 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.7, marginBottom: 2 }}>
              {renderInline(item, invertColors)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={`ol${i}`} style={{ margin: '4px 0 8px 20px', padding: 0 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.7, marginBottom: 2 }}>
              {renderInline(item, invertColors)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 6 }} />)
      i++
      continue
    }

    // Paragraph
    nodes.push(
      <p key={i} style={{ fontSize: 13, color: 'var(--sh-text)', lineHeight: 1.7, margin: '0 0 6px' }}>
        {renderInline(line, invertColors)}
      </p>
    )
    i++
  }

  return <div>{nodes}</div>
}

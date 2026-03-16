import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconFork,
  IconLink,
  IconPen,
  IconStar,
  IconStarFilled,
  LogoMark,
} from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'
import { getStoredUser, hasStoredSession } from '../lib/session'
import { useLivePolling } from '../lib/useLivePolling'

import { API } from '../config'
const authHeaders = () => ({
  'Content-Type': 'application/json',
})

// ─────────────────────────────────────────────────────────────────
// MARKDOWN PARSER
// Handles: h1-h6, bold, italic, bold+italic, inline code,
// fenced code blocks, unordered + ordered lists (nested),
// blockquotes, horizontal rules, tables, line breaks
// Returns: { html: string, headings: [{id, text, level}] }
// ─────────────────────────────────────────────────────────────────
function parseMarkdown(raw) {
  if (!raw) return { html: '', headings: [] }
  const headings = []
  let idCount = {}

  function slugify(text) {
    const base = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
    idCount[base] = (idCount[base] || 0) + 1
    return idCount[base] > 1 ? `${base}-${idCount[base]}` : base
  }

  function escHtml(s) {
    return s
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function inlineFormat(s) {
    return escHtml(s)
      // bold + italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      // bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // inline code
      .replace(/`(.+?)`/g, '<code class="md-inline-code">$1</code>')
      // links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>')
      // strikethrough
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
  }

  const lines  = raw.split('\n')
  let   html   = ''
  let   i      = 0

  function parseList(startI, ordered, baseIndent) {
    let out = ordered ? '<ol class="md-ol">' : '<ul class="md-ul">'
    let j   = startI
    const bullet = ordered ? /^(\s*)\d+\.\s/ : /^(\s*)[-*+]\s/

    while (j < lines.length) {
      const line   = lines[j]
      const match  = line.match(bullet)
      if (!match) break

      const indent = match[1].length
      if (indent < baseIndent) break
      if (indent > baseIndent) { j--; break }

      const text   = line.replace(bullet, '').trim()
      // peek ahead for nested list
      const next   = lines[j + 1] || ''
      const nestOrd = next.match(/^(\s+)\d+\.\s/)
      const nestUno = next.match(/^(\s+)[-*+]\s/)

      out += '<li class="md-li">'
      out += inlineFormat(text)

      if (nestOrd || nestUno) {
        const nextIndent = (nestOrd || nestUno)[1].length
        if (nextIndent > indent) {
          j++
          const { html: subHtml, newI } = parseList(j, !!nestOrd, nextIndent)
          out += subHtml
          j = newI - 1
        }
      }
      out += '</li>'
      j++
    }
    return { html: out + (ordered ? '</ol>' : '</ul>'), newI: j }
  }

  while (i < lines.length) {
    const line = lines[i]

    // ── fenced code block ────────────────────────────────────
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim()
      let code   = ''
      i++
      while (i < lines.length && !lines[i].match(/^```/)) {
        code += escHtml(lines[i]) + '\n'
        i++
      }
      html += `<div class="md-code-wrap"><div class="md-code-header"><span class="md-code-lang">${lang || 'code'}</span><button class="md-copy-btn" type="button">Copy</button></div><pre class="md-pre"><code class="md-code">${code}</code></pre></div>`
      i++; continue
    }

    // ── headings ─────────────────────────────────────────────
    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const text  = hMatch[2].trim()
      const id    = slugify(text)
      headings.push({ id, text, level })
      html += `<h${level} id="${id}" class="md-h${level}">${inlineFormat(text)}<a href="#${id}" class="md-anchor">#</a></h${level}>`
      i++; continue
    }

    // ── horizontal rule ──────────────────────────────────────
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      html += '<hr class="md-hr" />'
      i++; continue
    }

    // ── blockquote ───────────────────────────────────────────
    if (line.startsWith('> ')) {
      let qhtml = ''
      while (i < lines.length && lines[i].startsWith('> ')) {
        qhtml += '<p class="md-bq-line">' + inlineFormat(lines[i].slice(2)) + '</p>'
        i++
      }
      html += `<blockquote class="md-blockquote">${qhtml}</blockquote>`
      continue
    }

    // ── table ─────────────────────────────────────────────────
    if (line.includes('|') && lines[i+1]?.match(/^\|?[-|\s:]+\|/)) {
      const header = line.split('|').map(c=>c.trim()).filter(Boolean)
      i += 2
      let tbody = ''
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(c=>c.trim()).filter(Boolean)
        tbody += '<tr>' + cells.map(c=>`<td class="md-td">${inlineFormat(c)}</td>`).join('') + '</tr>'
        i++
      }
      html += `<div class="md-table-wrap"><table class="md-table"><thead><tr>${header.map(h=>`<th class="md-th">${inlineFormat(h)}</th>`).join('')}</tr></thead><tbody>${tbody}</tbody></table></div>`
      continue
    }

    // ── unordered list ────────────────────────────────────────
    if (line.match(/^(\s*)[-*+]\s/)) {
      const indent = (line.match(/^(\s*)/)[1] || '').length
      const { html: lhtml, newI } = parseList(i, false, indent)
      html += lhtml
      i = newI
      continue
    }

    // ── ordered list ──────────────────────────────────────────
    if (line.match(/^(\s*)\d+\.\s/)) {
      const indent = (line.match(/^(\s*)/)[1] || '').length
      const { html: lhtml, newI } = parseList(i, true, indent)
      html += lhtml
      i = newI
      continue
    }

    // ── blank line ────────────────────────────────────────────
    if (line.trim() === '') { html += '<div class="md-spacer"></div>'; i++; continue }

    // ── paragraph ─────────────────────────────────────────────
    let para = ''
    while (i < lines.length && lines[i].trim() !== '' &&
           !lines[i].match(/^#{1,6}\s/) &&
           !lines[i].match(/^```/) &&
           !lines[i].startsWith('> ') &&
           !lines[i].match(/^(\s*)[-*+]\s/) &&
           !lines[i].match(/^(\s*)\d+\.\s/) &&
           !lines[i].match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      para += (para ? ' ' : '') + lines[i].trim()
      i++
    }
    if (para) html += `<p class="md-p">${inlineFormat(para)}</p>`
  }

  return { html, headings }
}

// ─────────────────────────────────────────────────────────────────
// MARKDOWN STYLES — injected once into <head>
// ─────────────────────────────────────────────────────────────────
const MD_STYLES = `
  .md-content { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #1e293b; line-height: 1.8; }
  .md-h1 { font-size: 2rem; font-weight: 800; color: #0f172a; margin: 2rem 0 1rem; padding-bottom: .5rem; border-bottom: 2px solid #e2e8f0; position: relative; }
  .md-h2 { font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: 1.8rem 0 .8rem; padding-bottom: .4rem; border-bottom: 1px solid #f1f5f9; position: relative; }
  .md-h3 { font-size: 1.2rem; font-weight: 700; color: #1e293b; margin: 1.4rem 0 .6rem; position: relative; }
  .md-h4, .md-h5, .md-h6 { font-size: 1rem; font-weight: 700; color: #334155; margin: 1.2rem 0 .5rem; position: relative; }
  .md-h1:first-child, .md-h2:first-child { margin-top: 0; }
  .md-anchor { opacity: 0; margin-left: 8px; font-size: .75em; color: #94a3b8; text-decoration: none; transition: opacity .15s; }
  .md-h1:hover .md-anchor, .md-h2:hover .md-anchor, .md-h3:hover .md-anchor,
  .md-h4:hover .md-anchor, .md-h5:hover .md-anchor { opacity: 1; }
  .md-p { margin: .75rem 0; color: #334155; }
  .md-spacer { height: .5rem; }
  .md-ul, .md-ol { margin: .75rem 0 .75rem 1.5rem; padding: 0; }
  .md-li { margin: .35rem 0; color: #334155; }
  .md-ul .md-ul, .md-ul .md-ol, .md-ol .md-ul, .md-ol .md-ol { margin-top: .25rem; }
  .md-inline-code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; padding: 1px 6px; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: .85em; color: #be185d; }
  .md-code-wrap { margin: 1.25rem 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #0f172a; }
  .md-code-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #1e293b; border-bottom: 1px solid #334155; }
  .md-code-lang { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: .08em; text-transform: uppercase; font-family: monospace; }
  .md-copy-btn { background: #334155; border: none; border-radius: 6px; color: #94a3b8; font-size: 11px; font-weight: 600; padding: 3px 10px; cursor: pointer; transition: all .15s; font-family: inherit; }
  .md-copy-btn:hover { background: #3b82f6; color: #fff; }
  .md-pre { margin: 0; padding: 18px 20px; overflow-x: auto; }
  .md-code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: .875rem; color: #e2e8f0; line-height: 1.7; }
  .md-blockquote { margin: 1rem 0; padding: .75rem 1.25rem; border-left: 4px solid #3b82f6; background: #eff6ff; border-radius: 0 10px 10px 0; }
  .md-bq-line { margin: .25rem 0; color: #1e40af; font-style: italic; }
  .md-hr { border: none; border-top: 2px solid #f1f5f9; margin: 2rem 0; }
  .md-table-wrap { overflow-x: auto; margin: 1.25rem 0; border-radius: 10px; border: 1px solid #e2e8f0; }
  .md-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  .md-th { background: #f8fafc; padding: 10px 14px; text-align: left; font-weight: 700; color: #374151; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  .md-td { padding: 9px 14px; color: #374151; border-bottom: 1px solid #f1f5f9; }
  .md-table tr:last-child .md-td { border-bottom: none; }
  .md-table tr:hover .md-td { background: #f8fafc; }
  .md-link { color: #3b82f6; text-decoration: none; border-bottom: 1px solid #bfdbfe; transition: border-color .15s; }
  .md-link:hover { border-color: #3b82f6; }
`

const MARKDOWN_SANITIZER_CONFIG = {
  RETURN_DOM_FRAGMENT: true,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script'],
  FORBID_ATTR: ['style'],
  ALLOWED_TAGS: [
    'a', 'blockquote', 'button', 'code', 'del', 'div', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol',
    'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td',
    'th', 'thead', 'tr', 'ul',
  ],
  ALLOWED_ATTR: ['class', 'href', 'id', 'rel', 'target', 'type'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/|#)/i,
}

function SafeMarkdownContent({ html, contentRef }) {
  const renderedRef = useRef(null)

  useEffect(() => {
    const target = renderedRef.current
    if (!target) return

    const fragment = DOMPurify.sanitize(html, MARKDOWN_SANITIZER_CONFIG)
    target.replaceChildren(fragment)

    return () => {
      target.replaceChildren()
    }
  }, [html])

  return (
    <div
      ref={(node) => {
        renderedRef.current = node
        if (contentRef) {
          contentRef.current = node
        }
      }}
      className="md-content"
      style={{ padding: '32px 40px 40px' }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// FORK MODAL
// ─────────────────────────────────────────────────────────────────
function ForkModal({ sheet, onClose, onFork }) {
  const [title,    setTitle]    = useState(`${sheet.title} (fork)`)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const inputRef = useRef()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleFork() {
    if (!title.trim()) { setError('Title is required.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/api/sheets/${sheet.id}/fork`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: title.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Fork failed.')
      const forked = await res.json()
      onFork(forked)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px',
        width: '100%', maxWidth: 480,
        boxShadow: '0 24px 80px rgba(15,23,42,0.3)',
        animation: 'slideUp .25s ease-out',
      }}>
        <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}`}</style>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <IconFork size={20} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Fork this sheet</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Creates a copy in your account. You can edit it freely.
            </p>
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>×</button>
        </div>

        {/* original info */}
        <div style={{
          background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
          marginBottom: 20, border: '1px solid #e2e8f0',
          fontSize: 13, color: '#475569',
        }}>
          <div style={{ fontWeight: 600, color: '#64748b', fontSize: 11, marginBottom: 4, letterSpacing: '.06em' }}>FORKING FROM</div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{sheet.title}</div>
          <div style={{ marginTop: 2 }}>
            by <strong>{sheet.author?.username}</strong>
            {sheet.course?.code && <> · <span style={{ color: '#3b82f6' }}>{sheet.course.code}</span></>}
          </div>
        </div>

        {/* title input */}
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>
          Your fork's title
        </label>
        <input
          ref={inputRef}
          value={title}
          onChange={e => { setTitle(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleFork()}
          style={{
            width: '100%', padding: '11px 14px',
            border: `2px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
            borderRadius: 10, fontSize: 14,
            fontFamily: 'inherit', outline: 'none',
            color: '#1e293b', boxSizing: 'border-box',
            transition: 'border-color .15s',
          }}
          onFocus={e => !error && (e.target.style.borderColor = '#93c5fd')}
          onBlur={e  => !error && (e.target.style.borderColor = '#e2e8f0')}
        />
        {error && (
          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 5 }}>
⚠ {error}
          </div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', border: '1px solid #e2e8f0',
            borderRadius: 10, background: '#fff', color: '#64748b',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleFork} disabled={loading} style={{
            flex: 2, padding: '11px', border: 'none',
            borderRadius: 10, background: loading ? '#86efac' : '#16a34a',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'background .15s',
          }}>
            {loading
              ? <>⟳ Forking…</>
              : <><IconFork size={14} />Fork Sheet</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TABLE OF CONTENTS
// ─────────────────────────────────────────────────────────────────
function TableOfContents({ headings, activeId }) {
  if (!headings.length) return null

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // only h1-h3 in TOC
  const toc = headings.filter(h => h.level <= 3)
  if (!toc.length) return null

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
      padding: '16px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
      maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#94a3b8',
        letterSpacing: '.08em', marginBottom: 10,
      }}>ON THIS PAGE</div>
      {toc.map(h => (
        <button key={h.id} onClick={() => scrollTo(h.id)} style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: activeId === h.id ? '#eff6ff' : 'transparent',
          border: 'none',
          borderLeft: `2px solid ${activeId === h.id ? '#3b82f6' : 'transparent'}`,
          padding: `5px 8px 5px ${6 + (h.level - 1) * 12}px`,
          cursor: 'pointer', color: activeId === h.id ? '#1d4ed8' : '#64748b',
          fontSize: h.level === 1 ? 13 : 12,
          fontWeight: activeId === h.id ? 700 : 500,
          borderRadius: '0 6px 6px 0',
          transition: 'all .15s',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          lineHeight: 1.4, marginBottom: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
          onMouseEnter={e => activeId !== h.id && (e.currentTarget.style.color = '#1e293b')}
          onMouseLeave={e => activeId !== h.id && (e.currentTarget.style.color = '#64748b')}
        >
          {h.text}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 6, mb = 10 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: '#f1f5f9', marginBottom: mb,
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function SheetViewerPage() {
  const { id }       = useParams()
  const navigate     = useNavigate()

  const [sheet,      setSheet]      = useState(null)
  const [related,    setRelated]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [starring,   setStarring]   = useState(false)
  const [hasStarred, setHasStarred] = useState(false)
  const [localStars, setLocalStars] = useState(0)
  const [showFork,   setShowFork]   = useState(false)
  const [activeId,   setActiveId]   = useState('')
  const [readPct,    setReadPct]    = useState(0)

  // Reactions state
  const [likes,        setLikes]        = useState(0)
  const [dislikes,     setDislikes]     = useState(0)
  const [userReaction, setUserReaction] = useState(null)
  const [reacting,     setReacting]     = useState(false)

  // Comments state
  const [comments,     setComments]     = useState([])
  const [commentTotal, setCommentTotal] = useState(0)
  const [commentText,  setCommentText]  = useState('')
  const [commentErr,   setCommentErr]   = useState('')
  const [postingCmt,   setPostingCmt]   = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [deleteErr,         setDeleteErr]         = useState('')
  const [contributionErr,   setContributionErr]   = useState('')
  const [contribMessage,    setContribMessage]    = useState('')
  const [submittingContrib, setSubmittingContrib] = useState(false)
  const [reviewingContrib,  setReviewingContrib]  = useState(false)
  const contentRef = useRef()
  const hasSession = hasStoredSession()

  // inject markdown styles once
  useEffect(() => {
    if (document.getElementById('md-styles')) return
    const tag = document.createElement('style')
    tag.id        = 'md-styles'
    tag.textContent = MD_STYLES
    document.head.appendChild(tag)
  }, [])

  useEffect(() => {
    const container = contentRef.current
    if (!container) return undefined

    function handleCopyClick(event) {
      const button = event.target.closest('.md-copy-btn')
      if (!button || !container.contains(button)) return

      const code = button.closest('.md-code-wrap')?.querySelector('.md-code')
      const text = code?.textContent || ''
      if (!text) return

      const originalLabel = button.textContent || 'Copy'
      const applyTemporaryLabel = (label) => {
        button.textContent = label
        window.setTimeout(() => {
          button.textContent = originalLabel
        }, 1500)
      }

      navigator.clipboard.writeText(text)
        .then(() => applyTemporaryLabel('Copied!'))
        .catch(() => applyTemporaryLabel('Copy failed'))
    }

    container.addEventListener('click', handleCopyClick)
    return () => container.removeEventListener('click', handleCopyClick)
  }, [sheet?.content])

  const loadSheet = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API}/api/sheets/${id}`, { headers: authHeaders() })
      if (!response.ok) throw new Error(`${response.status}`)
      const data = await response.json()
      setSheet(data)
      setLocalStars(data.stars || 0)
      setHasStarred(data.starred || false)
      setCommentTotal(data.commentCount || 0)
      if (data.reactions) {
        setLikes(data.reactions.likes || 0)
        setDislikes(data.reactions.dislikes || 0)
        setUserReaction(data.reactions.userReaction || null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  // fetch sheet
  useEffect(() => {
    void loadSheet()
  }, [loadSheet])

  // fetch related sheets (same course)
  useEffect(() => {
    if (!sheet?.courseId) return
    fetch(`${API}/api/sheets?courseId=${sheet.courseId}&limit=4`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setRelated((d.sheets || []).filter(s => s.id !== parseInt(id)).slice(0, 3)))
      .catch(() => {})
  }, [sheet?.courseId, id])

  async function loadComments({ signal, startTransition } = {}) {
    if (!id) return

    const response = await fetch(`${API}/api/sheets/${id}/comments`, { signal })
    if (!response.ok) return

    const data = await response.json()
    startTransition(() => {
      setComments(data.comments || [])
      setCommentTotal(data.total || 0)
    })
  }

  useLivePolling(loadComments, {
    enabled: Boolean(id),
    intervalMs: 20000,
    refreshKey: id,
  })

  async function handlePostComment(e) {
    e.preventDefault()
    if (!commentText.trim()) return
    setCommentErr('')
    setPostingCmt(true)
    try {
      const res = await fetch(`${API}/api/sheets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ content: commentText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setCommentErr(data.error || 'Could not post comment.'); return }
      setComments(prev => [data, ...prev])
      setCommentTotal(t => t + 1)
      setCommentText('')
    } catch {
      setCommentErr('Could not connect to server.')
    } finally {
      setPostingCmt(false)
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await fetch(`${API}/api/sheets/${id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      setComments(prev => prev.filter(c => c.id !== commentId))
      setCommentTotal(t => t - 1)
    } catch { /* ignore */ }
  }

  // reading progress bar
  useEffect(() => {
    const onScroll = () => {
      const el  = contentRef.current
      if (!el) return
      const { top } = el.getBoundingClientRect()
      const h    = el.offsetHeight
      const winH = window.innerHeight
      const pct  = Math.min(100, Math.max(0, ((winH - top) / h) * 100))
      setReadPct(pct)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // active TOC heading (intersection observer)
  useEffect(() => {
    if (!sheet) return
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActiveId(e.target.id) })
      },
      { rootMargin: '-10% 0px -80% 0px' }
    )
    document.querySelectorAll('[id].md-h1,[id].md-h2,[id].md-h3').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [sheet])

  // star handler
  async function handleStar() {
    if (starring || !hasSession) return
    setStarring(true)
    setHasStarred(v => !v)
    setLocalStars(n => n + (hasStarred ? -1 : 1))
    try {
      const res = await fetch(`${API}/api/sheets/${id}/star`, {
        method: 'POST', headers: authHeaders(),
      })
      if (res.ok) { const d = await res.json(); setLocalStars(d.stars) }
    } catch { /* keep optimistic */ }
    finally { setStarring(false) }
  }

  // download as .md
  function handleDownload() {
    if (!sheet?.allowDownloads) return
    window.open(`${API}/api/sheets/${id}/download`, '_blank', 'noopener,noreferrer')
    setSheet(current => current ? { ...current, downloads: (current.downloads || 0) + 1 } : current)
  }

  function handleAttachmentDownload() {
    if (!sheet?.allowDownloads || !sheet?.hasAttachment) return
    window.open(`${API}/api/sheets/${id}/attachment`, '_blank', 'noopener,noreferrer')
    setSheet(current => current ? { ...current, downloads: (current.downloads || 0) + 1 } : current)
  }

  // copy share link
  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  // react (like/dislike)
  async function handleReact(type) {
    if (reacting || !hasStoredSession()) return
    setReacting(true)
    // optimistic update
    const prev = userReaction
    const newReaction = userReaction === type ? null : type
    setUserReaction(newReaction)
    setLikes(l => l + (type === 'like' ? (newReaction === 'like' ? 1 : -1) : (prev === 'like' ? -1 : 0)))
    setDislikes(d => d + (type === 'dislike' ? (newReaction === 'dislike' ? 1 : -1) : (prev === 'dislike' ? -1 : 0)))
    try {
      const res = await fetch(`${API}/api/sheets/${id}/react`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: newReaction }),
      })
      if (res.ok) {
        const data = await res.json()
        setLikes(data.likes)
        setDislikes(data.dislikes)
        setUserReaction(data.userReaction)
      }
    } catch { /* keep optimistic */ }
    finally { setReacting(false) }
  }

  async function handleDeleteSheet() {
    setDeleting(true); setDeleteErr('')
    try {
      const res = await fetch(`${API}/api/sheets/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) { const d = await res.json(); setDeleteErr(d.error || 'Failed to delete.'); return }
      navigate('/sheets')
    } catch { setDeleteErr('Could not connect to server.') }
    finally { setDeleting(false) }
  }

  // fork success
  function onForkSuccess(forked) {
    setShowFork(false)
    navigate(`/sheets/${forked.id}`)
  }

  async function handleContributeBack() {
    if (!sheet?.forkSource) return
    setSubmittingContrib(true)
    setContributionErr('')
    try {
      const res = await fetch(`${API}/api/sheets/${id}/contributions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: contribMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send contribution.')
      setContribMessage('')
      await loadSheet()
    } catch (err) {
      setContributionErr(err.message)
    } finally {
      setSubmittingContrib(false)
    }
  }

  async function handleReviewContribution(contributionId, action) {
    setReviewingContrib(true)
    setContributionErr('')
    try {
      const res = await fetch(`${API}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not review contribution.')
      await loadSheet()
    } catch (err) {
      setContributionErr(err.message)
    } finally {
      setReviewingContrib(false)
    }
  }

  const canSubmitComment = Boolean(commentText.trim()) && !postingCmt

  const { html: mdHtml, headings } = sheet
    ? parseMarkdown(sheet.content)
    : { html: '', headings: [] }

  const courseName  = sheet?.course?.code   || ''
  const schoolName  = sheet?.course?.school?.name || ''
  const authorName  = sheet?.author?.username || 'unknown'
  const fmtDate     = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
  const currentUser = getStoredUser()
  const isOwn       = sheet && currentUser ? currentUser.id === sheet.userId : false

  return (
    <div style={{
      minHeight: '100vh', background: '#edf0f5',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {/* reading progress bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, zIndex: 200,
        height: 3, background: '#3b82f6',
        width: `${readPct}%`, transition: 'width .1s linear',
        borderRadius: '0 2px 2px 0',
        boxShadow: '0 0 8px #3b82f688',
      }} />

      {/* top nav */}
      <header style={{
        background: '#0f172a', height: 'clamp(60px, 5vw, 74px)', position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', padding: '0 clamp(16px, 2.5vw, 40px)', gap: 12,
        borderBottom: '1px solid #1e293b',
      }}>
        <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={28} />
          <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
            Study<span style={{ color: '#3b82f6' }}>Hub</span>
          </span>
        </Link>
        <span style={{ color: '#334155' }}>/</span>
        <Link to="/sheets" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}
          onMouseEnter={e=>e.currentTarget.style.color='#e2e8f0'}
          onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}
        >Sheets</Link>
        <span style={{ color: '#334155' }}>/</span>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, maxWidth: 260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {sheet?.title || '…'}
        </span>
        <div style={{ flex: 1 }} />
        {/* action buttons in nav */}
        <button onClick={handleCopyLink} title="Copy link" style={NAV_BTN}>
          {copied
            ? <IconCheck size={14} style={{ color: '#10b981' }} />
            : <IconLink size={14} style={{ color: '#94a3b8' }} />}
        </button>
        <button onClick={handleDownload} title="Download .md" style={NAV_BTN} disabled={!sheet || !sheet.allowDownloads}>
          <IconDownload size={14} style={{ color: '#94a3b8' }} />
        </button>
      </header>

      {/* body */}
      <div style={{
        ...pageShell('reading', 28, 60),
        display: 'grid',
        gridTemplateColumns: pageColumns.readingThreeColumn,
        gap: 24,
        alignItems: 'start',
      }}>

        {/* ── LEFT: TOC ──────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 76 }}>
          {loading
            ? <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e8ecf0', padding:16 }}>
                <Skeleton w="60%" h={11} mb={14} />
                {Array.from({length:6}).map((_,i)=><Skeleton key={i} w={`${70+i*5}%`} h={12} mb={8} />)}
              </div>
            : <TableOfContents headings={headings} activeId={activeId} />
          }
        </div>

        {/* ── CENTER: CONTENT ────────────────────────────────── */}
        <main>
          {/* error */}
          {error && (
            <div style={{
              background:'#fef2f2', border:'1px solid #fecaca', borderRadius:14,
              padding:'24px', textAlign:'center',
            }}>
              <span style={{ fontSize:32, color:'#dc2626', display:'block', marginBottom:12 }}>⚠</span>
              <div style={{ fontWeight:800, fontSize:16, color:'#991b1b', marginBottom:6 }}>Sheet not found</div>
              <div style={{ fontSize:13, color:'#b91c1c', marginBottom:16 }}>
                {error === '404' ? "This sheet doesn't exist or was deleted." : `Error ${error} — backend may be offline.`}
              </div>
              <Link to="/sheets" style={{
                padding:'9px 22px', background:'#3b82f6', color:'#fff',
                borderRadius:9, textDecoration:'none', fontWeight:700, fontSize:13,
              }}>← Back to Sheets</Link>
            </div>
          )}

          {/* loading */}
          {loading && (
            <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e8ecf0', padding:'32px', boxShadow:'0 2px 10px rgba(15,23,42,0.05)' }}>
              <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
              <div style={{ animation:'shimmer 1.4s ease-in-out infinite' }}>
                <Skeleton w="75%" h={32} mb={16} />
                <div style={{ display:'flex', gap:10, marginBottom:20 }}>
                  <Skeleton w={80} h={20} r={99} mb={0} />
                  <Skeleton w={100} h={20} r={99} mb={0} />
                  <Skeleton w={70} h={20} r={99} mb={0} />
                </div>
                <Skeleton h={1} mb={24} />
                {Array.from({length:12}).map((_,i)=><Skeleton key={i} w={`${70+Math.random()*30}%`} h={14} mb={10} />)}
              </div>
            </div>
          )}

          {/* sheet */}
          {!loading && !error && sheet && (
            <div style={{
              background: '#fff', borderRadius: 16,
              border: '1px solid #e8ecf0',
              boxShadow: '0 2px 16px rgba(15,23,42,0.06)',
              overflow: 'hidden',
              animation: 'fadeIn .35s ease-out',
            }}>
              <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>

              {/* sheet header */}
              <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid #f1f5f9' }}>
                {/* meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {courseName && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                      background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                    }}>{courseName}</span>
                  )}
                  {schoolName && (
                    <span style={{
                      fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
                      background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                    }}>{schoolName}</span>
                  )}
                  {sheet.forkOf && (
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                      background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                    }}>
                      <IconFork size={11} style={{ marginRight: 4 }} />
                      forked
                    </span>
                  )}
                </div>

                <h1 style={{
                  fontSize: 26, fontWeight: 800, color: '#0f172a',
                  margin: '0 0 8px', lineHeight: 1.3,
                }}>
                  {sheet.title}
                </h1>

                {sheet.description && (
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 14px', lineHeight: 1.6 }}>
                    {sheet.description}
                  </p>
                )}

                {/* author + stats row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  flexWrap: 'wrap', paddingBottom: 18,
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <Link to={`/users/${authorName}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: '#0f172a', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {authorName.slice(0,2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#3b82f6'}
                      onMouseLeave={e => e.currentTarget.style.color = '#334155'}
                    >{authorName}</span>
                  </Link>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    {fmtDate(sheet.createdAt)}
                  </span>
                  {/* stats */}
                  <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color: hasStarred?'#f59e0b':'#94a3b8', fontWeight:500 }}>
                    {hasStarred ? <IconStarFilled size={13} /> : <IconStar size={13} />}{localStars}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'#94a3b8', fontWeight:500 }}>
                    <IconFork size={13} />{sheet.forks||0}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'#94a3b8', fontWeight:500 }}>
                    <IconDownload size={13} />{sheet.downloads||0}
                  </div>
                </div>

                {/* action buttons */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 16, flexWrap: 'wrap' }}>
                  <button onClick={handleStar} disabled={starring || !hasSession}
                    title={hasSession ? undefined : 'Log in to star'}
                    style={{
                      padding: '8px 16px', borderRadius: 9, border: '1px solid',
                      borderColor:  hasStarred ? '#fde68a' : '#e2e8f0',
                      background:   hasStarred ? '#fef9ec' : '#fff',
                      color:        hasStarred ? '#92400e' : '#475569',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: hasSession ? 1 : 0.5,
                    }}>
                    {hasStarred ? <IconStarFilled size={14} style={{ color: '#f59e0b' }} /> : <IconStar size={14} />}
                    {hasStarred ? 'Starred' : 'Star'} · {localStars}
                  </button>

                  <button
                    onClick={() => hasSession ? setShowFork(true) : navigate('/login')}
                    style={{
                      padding: '8px 16px', borderRadius: 9,
                      border: '1px solid #bbf7d0', background: '#f0fdf4',
                      color: '#166534', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.background='#dcfce7';e.currentTarget.style.borderColor='#86efac'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='#f0fdf4';e.currentTarget.style.borderColor='#bbf7d0'}}
                  >
                    <IconFork size={14} />Fork · {sheet.forks || 0}
                  </button>

                  <button onClick={handleDownload} disabled={!sheet.allowDownloads} style={{
                    padding: '8px 16px', borderRadius: 9,
                    border: '1px solid #e2e8f0', background: '#fff',
                    color: '#475569', fontSize: 13, fontWeight: 700,
                    cursor: sheet.allowDownloads ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'background .15s',
                    opacity: sheet.allowDownloads ? 1 : 0.55,
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background='#fff'}
                  >
                    <IconDownload size={14} />{sheet.allowDownloads ? 'Download .md' : 'Downloads off'}
                  </button>

                  <button onClick={handleCopyLink} style={{
                    padding: '8px 16px', borderRadius: 9,
                    border: `1px solid ${copied ? '#bbf7d0' : '#e2e8f0'}`,
                    background: copied ? '#f0fdf4' : '#fff',
                    color: copied ? '#166534' : '#475569',
                    fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all .15s',
                  }}>
                    {copied ? <IconCheck size={14} /> : <IconLink size={14} />}
                    {copied ? 'Link copied!' : 'Share'}
                  </button>

                  {isOwn && (
                    <Link to={`/sheets/${sheet.id}/edit`} style={{
                      padding: '8px 16px', borderRadius: 9,
                      border: '1px solid #e2e8f0', background: '#fff',
                      color: '#475569', fontSize: 13, fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <IconPen size={14} />Edit
                    </Link>
                  )}

                  {(isOwn || currentUser?.role === 'admin') && !showDeleteConfirm && (
                    <button onClick={() => setShowDeleteConfirm(true)} style={{
                      padding: '8px 16px', borderRadius: 9,
                      border: '1px solid #fecaca', background: '#fef2f2',
                      color: '#dc2626', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all .15s',
                    }}>
                      <i className="fas fa-trash" style={{ fontSize: 12 }}></i>Delete
                    </button>
                  )}
                </div>

                {sheet.hasAttachment && (
                  <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      Attachment: <strong>{sheet.attachmentName || 'Attached file'}</strong>
                    </div>
                    {sheet.allowDownloads ? (
                      <button onClick={handleAttachmentDownload} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <IconDownload size={13} />Download attachment
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>The author disabled attachment downloads.</span>
                    )}
                  </div>
                )}

                {!sheet.allowDownloads && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
                    Version 1 note: the author chose not to show a download button for this sheet.
                  </div>
                )}

                {showDeleteConfirm && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>Delete this sheet permanently? This cannot be undone.</span>
                    <button onClick={handleDeleteSheet} disabled={deleting} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {deleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button onClick={() => { setShowDeleteConfirm(false); setDeleteErr('') }} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    {deleteErr && <span style={{ fontSize: 12, color: '#dc2626' }}>{deleteErr}</span>}
                  </div>
                )}
              </div>

              {/* reactions bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 32px', borderBottom: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => handleReact('like')}
                  disabled={reacting || !hasSession}
                  title={hasSession ? 'Like' : 'Log in to react'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 8, border: '1px solid',
                    borderColor: userReaction === 'like' ? '#bfdbfe' : '#e2e8f0',
                    background: userReaction === 'like' ? '#eff6ff' : '#fff',
                    color: userReaction === 'like' ? '#1d4ed8' : '#64748b',
                    fontSize: 13, fontWeight: 700, cursor: hasSession ? 'pointer' : 'default',
                    fontFamily: 'inherit', transition: 'all .15s',
                    opacity: hasSession ? 1 : 0.5,
                  }}
                >
                  <i className="fas fa-thumbs-up" style={{ fontSize: 13 }}></i>
                  {likes}
                </button>
                <button
                  onClick={() => handleReact('dislike')}
                  disabled={reacting || !hasSession}
                  title={hasSession ? 'Dislike' : 'Log in to react'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 8, border: '1px solid',
                    borderColor: userReaction === 'dislike' ? '#fecaca' : '#e2e8f0',
                    background: userReaction === 'dislike' ? '#fef2f2' : '#fff',
                    color: userReaction === 'dislike' ? '#dc2626' : '#64748b',
                    fontSize: 13, fontWeight: 700, cursor: hasSession ? 'pointer' : 'default',
                    fontFamily: 'inherit', transition: 'all .15s',
                    opacity: hasSession ? 1 : 0.5,
                  }}
                >
                  <i className="fas fa-thumbs-down" style={{ fontSize: 13 }}></i>
                  {dislikes}
                </button>
              </div>

              {/* markdown content */}
              <SafeMarkdownContent html={mdHtml} contentRef={contentRef} />

              {sheet.forkSource && isOwn && currentUser?.id !== sheet.forkSource.userId && (
                <div style={{ margin: '0 32px 28px', padding: '18px', borderRadius: 12, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#166534', marginBottom: 6 }}>Contribute this fork back</div>
                  <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.6, marginBottom: 10 }}>
                    Send your improvements back to the original author for review, GitHub-style.
                  </div>
                  <textarea
                    value={contribMessage}
                    onChange={e => setContribMessage(e.target.value.slice(0, 500))}
                    placeholder="What did you improve?"
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
                  />
                  <button onClick={handleContributeBack} disabled={submittingContrib} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: submittingContrib ? '#86efac' : '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: submittingContrib ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <IconFork size={13} />{submittingContrib ? 'Sending…' : 'Send Contribution'}
                  </button>
                  {contributionErr && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{contributionErr}</div>
                  )}
                </div>
              )}

              {(isOwn || currentUser?.role === 'admin') && sheet.incomingContributions?.length > 0 && (
                <div style={{ margin: '0 32px 28px', padding: '18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Contribution Requests</div>
                  {contributionErr && (
                    <div style={{ marginBottom: 10, fontSize: 12, color: '#dc2626' }}>{contributionErr}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sheet.incomingContributions.map((contribution) => (
                      <div key={contribution.id} style={{ padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1px solid #dbe1e8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                          <strong style={{ fontSize: 13, color: '#0f172a' }}>{contribution.proposer?.username}</strong>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(contribution.createdAt).toLocaleDateString()}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: contribution.status === 'pending' ? '#eff6ff' : contribution.status === 'accepted' ? '#f0fdf4' : '#fef2f2', color: contribution.status === 'pending' ? '#1d4ed8' : contribution.status === 'accepted' ? '#166534' : '#dc2626' }}>{contribution.status.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginBottom: contribution.message ? 8 : 0 }}>
                          Fork: <strong>{contribution.forkSheet?.title}</strong>
                        </div>
                        {contribution.message && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 10 }}>{contribution.message}</div>}
                        {contribution.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleReviewContribution(contribution.id, 'accept')} disabled={reviewingContrib} style={{ padding: '7px 12px', border: '1px solid #bbf7d0', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Accept</button>
                            <button onClick={() => handleReviewContribution(contribution.id, 'reject')} disabled={reviewingContrib} style={{ padding: '7px 12px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isOwn && sheet.outgoingContributions?.length > 0 && (
                <div style={{ margin: '0 32px 28px', padding: '16px 18px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Your Contribution Status</div>
                  {sheet.outgoingContributions.map((contribution) => (
                    <div key={contribution.id} style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                      <strong>{contribution.status.toUpperCase()}</strong> · {new Date(contribution.createdAt).toLocaleDateString()}
                      {contribution.reviewer?.username ? ` · Reviewed by ${contribution.reviewer.username}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── COMMENTS ─────────────────────────────────────── */}
          {!loading && !error && sheet && (
            <div style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '28px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 'bold', color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-comments" style={{ color: '#3b82f6' }}></i> Comments ({commentTotal})
              </h3>

              {/* Compose box — show only when logged in */}
              {currentUser && (
                <form onSubmit={handlePostComment} style={{ marginBottom: 24 }}>
                  <textarea
                    value={commentText}
                    onChange={e => { setCommentText(e.target.value); setCommentErr('') }}
                    placeholder="Leave a comment…"
                    maxLength={500}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: 'Arial, sans-serif', resize: 'vertical', outline: 'none' }}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                  {commentErr && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{commentErr}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{commentText.length}/500</span>
                    <button
                      type="submit"
                      disabled={!canSubmitComment}
                      style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', opacity: canSubmitComment ? 1 : 0.6 }}
                    >
                      {postingCmt ? 'Posting…' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              )}

              {!currentUser && (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 14, color: '#6b7280' }}>
                  <a href="/login" style={{ color: '#2563eb', fontWeight: 'bold' }}>Sign in</a> to leave a comment.
                </div>
              )}

              {/* Comment list */}
              {comments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, padding: '20px 0' }}>
                  No comments yet. Be the first!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, flexShrink: 0 }}>
                        {c.author?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div>
                            <strong style={{ fontSize: 13, color: '#1e3a5f' }}>{c.author?.username}</strong>
                            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
                              {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          {currentUser && (currentUser.id === c.userId || currentUser.role === 'admin') && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: 0 }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6, wordBreak: 'break-word' }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── RIGHT SIDEBAR ──────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: 76, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* AI tutor */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            borderRadius: 14, padding: '18px 16px',
            border: '1px solid #1e3a5f',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#60a5fa', fontSize: 18 }}>✦</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>AI Tutor</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px',
                background: '#1d4ed8', color: '#93c5fd', borderRadius: 99,
              }}>V2</span>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.65, margin: '0 0 12px' }}>
              Ask Claude anything about this sheet. Context-aware answers, practice questions, and step-by-step breakdowns.
            </p>
            <div style={{
              background: '#1e293b', borderRadius: 8, padding: '10px 12px',
              fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 10,
            }}>
              "Explain recursion like I'm a beginner…"
            </div>
            <button disabled style={{
              width: '100%', padding: '9px',
              background: '#1e3a5f', border: '1px solid #2d4a7a',
              borderRadius: 9, color: '#64748b',
              fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
Planned for Version 2
            </button>
          </div>

          {/* sheet info card */}
          {sheet && (
            <div style={{
              background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
              padding: '16px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', marginBottom: 12 }}>
                SHEET INFO
              </div>
              {[
                { label: 'Author',    val: authorName },
                { label: 'Course',    val: courseName || '—' },
                { label: 'School',    val: sheet.course?.school?.short || '—' },
                { label: 'Uploaded',  val: fmtDate(sheet.createdAt) },
                { label: 'Stars',     val: localStars },
                { label: 'Forks',     val: sheet.forks || 0 },
                { label: 'Downloads', val: sheet.downloads || 0 },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 0', borderBottom: '1px solid #f8fafc',
                  fontSize: 13,
                }}>
                  <span style={{ color: '#94a3b8', flex: 1 }}>{r.label}</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{r.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* related sheets */}
          {related.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
              padding: '16px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', marginBottom: 12 }}>
                MORE FROM {courseName}
              </div>
              {related.map(s => (
                <Link key={s.id} to={`/sheets/${s.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    padding: '9px 8px', borderRadius: 9, marginBottom: 4,
                    transition: 'background .15s',
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', lineHeight: 1.4, marginBottom: 3 }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconStarFilled size={11} style={{ color: '#f59e0b' }} />{s.stars||0}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconFork size={11} />{s.forks||0}</span>
                    </div>
                  </div>
                </Link>
              ))}
              <Link to={`/sheets?courseId=${sheet?.courseId}`} style={{
                display: 'block', marginTop: 8, textAlign: 'center',
                fontSize: 12, color: '#3b82f6', fontWeight: 600, textDecoration: 'none',
              }}>
                View all {courseName} sheets →
              </Link>
            </div>
          )}

          {/* back link */}
          <Link to="/sheets" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px', background: '#fff', borderRadius: 12,
            border: '1px solid #e2e8f0', color: '#64748b',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            transition: 'all .15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.color='#334155'}}
            onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#64748b'}}
          >
            <IconArrowLeft size={14} />
            Back to all sheets
          </Link>
        </aside>
      </div>

      {/* fork modal */}
      {showFork && sheet && (
        <ForkModal
          sheet={sheet}
          onClose={() => setShowFork(false)}
          onFork={onForkSuccess}
        />
      )}
    </div>
  )
}

const NAV_BTN = {
  background: 'transparent', border: 'none',
  padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
  transition: 'background .15s', display: 'flex', alignItems: 'center',
}

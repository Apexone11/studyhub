/**
 * CiteIntoNoteButton — one-click "Cite this paper into a new note".
 *
 * Click flow:
 *   1. Toast "Copying citation to your notes..."
 *   2. POST /api/notes with title, body (citation block + a "Your notes:"
 *      placeholder), tags ['scholar','cite'], private=true, plus
 *      sourceType+paperId for the back-link.
 *   3. Navigate to /notes/:id on success.
 *   4. On 422/400 because `sourceType` isn't yet in schema, retry
 *      WITHOUT sourceType/paperId so the user still ends up in a note.
 *
 * Not gated by useAiPermission — this is a direct create, no AI involved.
 *
 * Props:
 *   - paper: required. The Scholar paper object. Needs at least `id` and
 *     `title`; authors/venue/year/doi are used for richer formatting.
 *   - format: 'APA' (default), 'MLA', 'Chicago'. Local formatter only —
 *     for the full 8-style menu, use CiteModal.
 *   - children: custom button label. Defaults to "Cite into note".
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'

function authorListForCitation(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return 'Unknown author'
  const names = authors.map((a) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean)
  if (names.length === 0) return 'Unknown author'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  if (names.length <= 5) return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`
  return `${names.slice(0, 5).join(', ')}, et al.`
}

function yearOf(paper) {
  if (!paper) return ''
  if (typeof paper.year === 'number') return String(paper.year)
  if (paper.publishedAt) {
    try {
      const y = new Date(paper.publishedAt).getUTCFullYear()
      return Number.isFinite(y) ? String(y) : ''
    } catch {
      return ''
    }
  }
  return ''
}

function doiLink(paper) {
  if (!paper) return ''
  if (paper.doi) {
    const doi = String(paper.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    return `https://doi.org/${doi}`
  }
  if (paper.url) return String(paper.url)
  return ''
}

function formatCitationLocal(paper, format = 'APA') {
  if (!paper) return ''
  const authors = authorListForCitation(paper.authors)
  const year = yearOf(paper)
  const title = paper.title || 'Untitled'
  const venue = paper.venue || paper.journal || ''
  const link = doiLink(paper)
  const style = String(format || 'APA').toUpperCase()

  if (style === 'MLA') {
    const parts = [`${authors}.`, `"${title}."`]
    if (venue) parts.push(`${venue},`)
    if (year) parts.push(`${year}.`)
    if (link) parts.push(link)
    return parts.join(' ')
  }
  if (style === 'CHICAGO') {
    const parts = [`${authors}.`]
    if (year) parts.push(`${year}.`)
    parts.push(`"${title}."`)
    if (venue) parts.push(`${venue}.`)
    if (link) parts.push(link)
    return parts.join(' ')
  }
  // APA default
  const parts = [authors]
  if (year) parts.push(`(${year}).`)
  parts.push(`${title}.`)
  if (venue) parts.push(`${venue}.`)
  if (link) parts.push(link)
  return parts.join(' ')
}

const BTN_STYLE_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 16px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: '12px',
  color: 'var(--sh-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-sm)',
  fontWeight: 500,
  minHeight: '44px',
  minWidth: '44px',
  cursor: 'pointer',
  textDecoration: 'none',
}

export default function CiteIntoNoteButton({ paper, format = 'APA', children, className, style }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  if (!paper || !paper.id) return null

  async function tryCreate(body) {
    const res = await fetch(`${API}/api/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res
  }

  async function onClick() {
    if (busy) return
    setBusy(true)
    showToast('Copying citation to your notes…', 'info')

    const citation = formatCitationLocal(paper, format)
    const noteTitle =
      paper.title && paper.title.length > 120
        ? `${paper.title.slice(0, 117)}…`
        : paper.title || 'Cited paper'
    const noteBody = `[Citation]\n\n${citation}\n\n[Your notes:]\n\n`

    const full = {
      title: noteTitle,
      body: noteBody,
      tags: ['scholar', 'cite'],
      private: true,
      sourceType: 'scholar',
      paperId: paper.id,
    }

    try {
      let res = await tryCreate(full)

      // If the backend doesn't yet accept sourceType/paperId, fall back
      // to the minimal payload. 400 + 422 + 404 are the realistic shapes
      // here (Zod schema rejection, unknown column, route version mismatch).
      if (res.status === 400 || res.status === 404 || res.status === 422) {
        const { sourceType: _s, paperId: _p, ...minimal } = full
        void _s
        void _p
        res = await tryCreate(minimal)
      }

      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || `Note create failed (${res.status})`)
      }

      const note = await res.json()
      const id = note?.id || note?.note?.id
      if (id) {
        navigate(`/notes/${id}`)
      } else {
        showToast('Note created.', 'success')
      }
    } catch (err) {
      showToast(err?.message || 'Could not create note.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const mergedStyle = { ...BTN_STYLE_BASE, ...(style || {}) }
  if (busy) {
    mergedStyle.opacity = 0.7
    mergedStyle.cursor = 'progress'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className}
      style={mergedStyle}
      aria-label={busy ? 'Creating note…' : 'Cite this paper into a new note'}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
      <span>{children || (busy ? 'Adding…' : 'Cite into note')}</span>
    </button>
  )
}

/**
 * scholar.cite.controller.js — Citation export endpoint.
 *
 * BibTeX exporter MUST escape LaTeX-active chars and strip backslashes
 * followed by a letter (kills `\input{...}`, `\write18{...}`). See
 * master plan §18.6 + L3-HIGH-6.
 *
 * Non-BibTeX text styles HTML-escape values to defend against display
 * surfaces that render them un-sanitized.
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const service = require('./scholar.service')
const {
  CANONICAL_ID_RE,
  CITE_STYLES,
  CITE_STYLE_META,
  BIBTEX_ACTIVE_CHAR_MAP,
  sanitizeFilename,
} = require('./scholar.constants')

// ── Escapers ────────────────────────────────────────────────────────────

function _escapeBibtex(value) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // 1) Escape every active char individually. We do `\` first so the
  //    replacement we insert (`\textbackslash{}`) isn't re-mangled.
  s = s.replace(/\\/g, BIBTEX_ACTIVE_CHAR_MAP['\\'])
  s = s.replace(/[{}#%&$_^~]/g, (ch) => BIBTEX_ACTIVE_CHAR_MAP[ch] || ch)
  // 2) Defense in depth — strip ANY remaining `\` followed by a letter.
  //    After step 1 there should be no raw `\` left in the buffer, but
  //    a future code path that injects pre-escaped LaTeX would otherwise
  //    leak through.
  s = s.replace(/\\([A-Za-z])/g, '$1')
  return s
}

function _escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Helpers ─────────────────────────────────────────────────────────────

function _bibKey(paper) {
  const firstAuthorSurname = paper.authors?.[0]?.name?.split(/\s+/).pop() || 'unknown'
  const year = paper.publishedAt ? String(paper.publishedAt).slice(0, 4) : 'nd'
  const slug =
    String(firstAuthorSurname)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'paper'
  return `${slug}${year}`
}

function _authorList(paper, max = 8) {
  if (!Array.isArray(paper.authors)) return []
  return paper.authors
    .slice(0, max)
    .map((a) => a?.name || '')
    .filter(Boolean)
}

function _yearOf(paper) {
  return paper.publishedAt ? String(paper.publishedAt).slice(0, 4) : 'n.d.'
}

// ── Style implementations ───────────────────────────────────────────────

function _bibtex(paper) {
  const key = _escapeBibtex(_bibKey(paper))
  const fields = []
  fields.push(`  title  = {{${_escapeBibtex(paper.title || '')}}}`)
  const authors = _authorList(paper)
  if (authors.length > 0) {
    fields.push(`  author = {${authors.map((a) => _escapeBibtex(a)).join(' and ')}}`)
  }
  if (paper.venue) fields.push(`  journal = {${_escapeBibtex(paper.venue)}}`)
  fields.push(`  year   = {${_escapeBibtex(_yearOf(paper))}}`)
  if (paper.doi) fields.push(`  doi    = {${_escapeBibtex(paper.doi)}}`)
  if (paper.arxivId) fields.push(`  eprint = {${_escapeBibtex(paper.arxivId)}}`)
  return `@article{${key},\n${fields.join(',\n')}\n}\n`
}

function _ris(paper) {
  const lines = []
  lines.push('TY  - JOUR')
  for (const a of _authorList(paper)) lines.push(`AU  - ${a}`)
  if (paper.title) lines.push(`TI  - ${paper.title}`)
  if (paper.venue) lines.push(`JO  - ${paper.venue}`)
  if (paper.publishedAt) lines.push(`PY  - ${_yearOf(paper)}`)
  if (paper.doi) lines.push(`DO  - ${paper.doi}`)
  if (paper.abstract) lines.push(`AB  - ${paper.abstract.replace(/\r?\n/g, ' ')}`)
  lines.push('ER  - ')
  // RIS lines should use CRLF per spec; many tools accept LF.
  return lines.join('\r\n') + '\r\n'
}

function _cslJson(paper) {
  const obj = {
    id: paper.id || _bibKey(paper),
    type: 'article-journal',
    title: paper.title || '',
    author: _authorList(paper).map((name) => {
      const tokens = String(name).trim().split(/\s+/)
      const family = tokens.length > 1 ? tokens.pop() : tokens[0] || ''
      const given = tokens.join(' ')
      return { family, given }
    }),
    issued: paper.publishedAt
      ? { 'date-parts': [[Number.parseInt(_yearOf(paper), 10) || 0]] }
      : undefined,
    'container-title': paper.venue || undefined,
    DOI: paper.doi || undefined,
    abstract: paper.abstract || undefined,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

function _apa(paper) {
  const authors = _authorList(paper)
  const authorStr = authors.length > 0 ? authors.join(', ') : 'Anonymous'
  return `${_escapeHtml(authorStr)} (${_escapeHtml(_yearOf(paper))}). ${_escapeHtml(paper.title || '')}. ${
    paper.venue ? `${_escapeHtml(paper.venue)}. ` : ''
  }${paper.doi ? `https://doi.org/${_escapeHtml(paper.doi)}` : ''}\n`
}

function _mla(paper) {
  const authors = _authorList(paper)
  const authorStr = authors.length > 0 ? authors.join(', ') : 'Anonymous'
  return `${_escapeHtml(authorStr)}. "${_escapeHtml(paper.title || '')}." ${
    paper.venue ? `${_escapeHtml(paper.venue)}, ` : ''
  }${_escapeHtml(_yearOf(paper))}.${paper.doi ? ` doi:${_escapeHtml(paper.doi)}` : ''}\n`
}

function _chicago(paper) {
  const authors = _authorList(paper)
  const authorStr = authors.length > 0 ? authors.join(', ') : 'Anonymous'
  return `${_escapeHtml(authorStr)}. ${_escapeHtml(_yearOf(paper))}. "${_escapeHtml(paper.title || '')}." ${
    paper.venue ? `${_escapeHtml(paper.venue)}.` : ''
  }${paper.doi ? ` https://doi.org/${_escapeHtml(paper.doi)}` : ''}\n`
}

function _ieee(paper) {
  const authors = _authorList(paper)
  const authorStr = authors.length > 0 ? authors.join(', ') : 'Anonymous'
  return `${_escapeHtml(authorStr)}, "${_escapeHtml(paper.title || '')}," ${
    paper.venue ? `${_escapeHtml(paper.venue)}, ` : ''
  }${_escapeHtml(_yearOf(paper))}.${paper.doi ? ` doi: ${_escapeHtml(paper.doi)}` : ''}\n`
}

function _harvard(paper) {
  const authors = _authorList(paper)
  const authorStr = authors.length > 0 ? authors.join(', ') : 'Anonymous'
  return `${_escapeHtml(authorStr)} ${_escapeHtml(_yearOf(paper))}, '${_escapeHtml(paper.title || '')}', ${
    paper.venue ? `${_escapeHtml(paper.venue)}.` : ''
  }${paper.doi ? ` https://doi.org/${_escapeHtml(paper.doi)}` : ''}\n`
}

const STYLE_FN = {
  bibtex: _bibtex,
  ris: _ris,
  'csl-json': _cslJson,
  apa: _apa,
  mla: _mla,
  chicago: _chicago,
  ieee: _ieee,
  harvard: _harvard,
}

// ── Route handler ───────────────────────────────────────────────────────

async function citePaper(req, res) {
  try {
    const { paperId, style } = req.body || {}
    if (typeof paperId !== 'string' || !CANONICAL_ID_RE.test(paperId)) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    if (typeof style !== 'string' || !CITE_STYLES.includes(style)) {
      return sendError(res, 400, 'Invalid citation style.', ERROR_CODES.VALIDATION, {
        allowed: CITE_STYLES,
      })
    }
    const paper = await service.getPaperDetail(paperId)
    if (!paper) {
      return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    }
    const fn = STYLE_FN[style]
    const formatted = fn(paper)
    const meta = CITE_STYLE_META[style]
    const baseFilename = sanitizeFilename(_bibKey(paper))
    const filename = `${baseFilename}.${meta.extension}`
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.json({
      formatted,
      contentType: meta.contentType,
      filename,
      style,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.cite.failed' }, 'Scholar cite failed')
    return sendError(res, 500, 'Failed to format citation.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  citePaper,
  // Test seams
  _escapeBibtex,
  _escapeHtml,
  _bibtex,
  _ris,
  _cslJson,
  _apa,
  _mla,
  _chicago,
  _ieee,
  _harvard,
  STYLE_FN,
}

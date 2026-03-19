import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconX, IconSheets, IconUsers, IconSchool } from './Icons'
import { API } from '../config'

const DEBOUNCE_MS = 300

function Highlight({ text, query }) {
  if (!query || query.length < 2 || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#fef08a', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ sheets: [], courses: [], users: [] })
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const navigate = useNavigate()

  // Reset state when modal opens, cancel pending work when it closes
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults({ sheets: [], courses: [], users: [] })
      setActiveIndex(-1)
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(focusTimer)
    }
    // Modal closing — cancel any pending debounce timer and in-flight fetch
    clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [open])

  // Cleanup timer and abort controller on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const fetchResults = useCallback(async (searchQuery) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(
        `${API}/api/search?q=${encodeURIComponent(searchQuery)}&type=all&limit=6`,
        { signal: controller.signal, credentials: 'include' }
      )
      if (!res.ok) return
      const data = await res.json()
      setResults(data.results || { sheets: [], courses: [], users: [] })
      setActiveIndex(-1)
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[search]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange({ target: { value } }) {
    setQuery(value)
    clearTimeout(timerRef.current)

    if (value.trim().length < 2) {
      if (abortRef.current) abortRef.current.abort()
      setResults({ sheets: [], courses: [], users: [] })
      setLoading(false)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(() => fetchResults(value.trim()), DEBOUNCE_MS)
  }

  // Build flat list for keyboard nav
  const flatItems = []
  results.sheets.forEach((s) => flatItems.push({ type: 'sheet', data: s }))
  results.courses.forEach((c) => flatItems.push({ type: 'course', data: c }))
  results.users.forEach((u) => flatItems.push({ type: 'user', data: u }))

  function navigateToItem(item) {
    onClose()
    if (item.type === 'sheet') navigate(`/sheets/${item.data.id}`)
    else if (item.type === 'course') navigate(`/sheets?courseId=${item.data.id}`)
    else if (item.type === 'user') navigate(`/users/${item.data.username}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0 && flatItems[activeIndex]) {
      e.preventDefault()
      navigateToItem(flatItems[activeIndex])
    }
  }

  if (!open) return null

  const hasResults = flatItems.length > 0
  const hasQuery = query.trim().length >= 2

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div style={styles.inputRow}>
          <IconSearch size={16} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search sheets, courses, users..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults({ sheets: [], courses: [], users: [] }); inputRef.current?.focus() }}
              style={styles.clearBtn}
              title="Clear"
            >
              <IconX size={14} />
            </button>
          )}
          <kbd style={styles.kbd}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={styles.resultsContainer}>
          {loading && hasQuery && (
            <div style={styles.statusMsg}>Searching...</div>
          )}

          {!loading && hasQuery && !hasResults && (
            <div style={styles.statusMsg}>No results found for &ldquo;{query}&rdquo;</div>
          )}

          {!hasQuery && (
            <div style={styles.statusMsg}>Type at least 2 characters to search</div>
          )}

          {/* Sheets */}
          {results.sheets.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>
                <IconSheets size={13} /> Sheets
              </div>
              {results.sheets.map((sheet, i) => {
                const flatIdx = i
                return (
                  <div
                    key={`s-${sheet.id}`}
                    style={{
                      ...styles.resultItem,
                      background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
                    }}
                    onClick={() => navigateToItem({ type: 'sheet', data: sheet })}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <div style={styles.resultTitle}><Highlight text={sheet.title} query={query} /></div>
                    <div style={styles.resultMeta}>
                      {sheet.course?.code} &middot; by {sheet.author?.username}
                      {sheet.stars > 0 && <span> &middot; {sheet.stars} stars</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Courses */}
          {results.courses.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>
                <IconSchool size={13} /> Courses
              </div>
              {results.courses.map((course, i) => {
                const flatIdx = results.sheets.length + i
                return (
                  <div
                    key={`c-${course.id}`}
                    style={{
                      ...styles.resultItem,
                      background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
                    }}
                    onClick={() => navigateToItem({ type: 'course', data: course })}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <div style={styles.resultTitle}><Highlight text={`${course.code} — ${course.name}`} query={query} /></div>
                    <div style={styles.resultMeta}>{course.school?.name}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Users */}
          {results.users.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>
                <IconUsers size={13} /> Users
              </div>
              {results.users.map((user, i) => {
                const flatIdx = results.sheets.length + results.courses.length + i
                return (
                  <div
                    key={`u-${user.id}`}
                    style={{
                      ...styles.resultItem,
                      background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
                    }}
                    onClick={() => navigateToItem({ type: 'user', data: user })}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={styles.userAvatar}>
                        {user.username?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={styles.resultTitle}><Highlight text={user.username} query={query} /></div>
                        <div style={styles.resultMeta}>{user.role}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 500,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 'clamp(80px, 12vh, 160px)',
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: 'min(560px, 92vw)',
    maxHeight: '70vh',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 18px',
    borderBottom: '1px solid #e2e8f0',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    fontFamily: 'inherit',
    color: '#0f172a',
    background: 'transparent',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    padding: 2,
  },
  kbd: {
    fontSize: 10,
    fontWeight: 600,
    color: '#94a3b8',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    padding: '2px 6px',
    lineHeight: 1.2,
    fontFamily: 'inherit',
  },
  resultsContainer: {
    overflowY: 'auto',
    maxHeight: 'calc(70vh - 60px)',
    padding: '6px 0',
  },
  statusMsg: {
    padding: '24px 18px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '10px 18px 4px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  resultItem: {
    padding: '10px 18px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    lineHeight: 1.3,
  },
  resultMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#eff6ff',
    border: '1.5px solid #3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: '#3b82f6',
  },
}

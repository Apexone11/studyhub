import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconX } from './Icons'
import { API } from '../config'
import { DEBOUNCE_MS, styles } from './searchModalConstants'
import { SheetResults, CourseResults, UserResults } from './SearchResultItems'

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
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search sheets, courses, and users">
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
            aria-label="Search sheets, courses, and users"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults({ sheets: [], courses: [], users: [] }); inputRef.current?.focus() }}
              style={styles.clearBtn}
              title="Clear"
              aria-label="Clear search"
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

          <SheetResults
            sheets={results.sheets}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />

          <CourseResults
            courses={results.courses}
            sheetsCount={results.sheets.length}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />

          <UserResults
            users={results.users}
            sheetsCount={results.sheets.length}
            coursesCount={results.courses.length}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />
        </div>
      </div>
    </div>
  )
}

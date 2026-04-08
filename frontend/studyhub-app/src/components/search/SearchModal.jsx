import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconX } from '../Icons'
import { API } from '../../config'
import { DEBOUNCE_MS, styles } from './searchModalConstants'
import { SheetResults, NoteResults, CourseResults, UserResults, GroupResults } from './SearchResultItems'
import { trackEvent } from '../../lib/telemetry'
import { useFocusTrap } from '../../lib/useFocusTrap'

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ sheets: [], courses: [], users: [], notes: [], groups: [] })
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const navigate = useNavigate()
  const trapRef = useFocusTrap({ active: open, onClose, initialFocusRef: inputRef })

  // Reset state when modal opens, cancel pending work when it closes
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults({ sheets: [], courses: [], users: [], notes: [], groups: [] })
      setActiveIndex(-1)
      return
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

  const fetchResults = useCallback(async (searchQuery) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    const fetchStart = performance.now()
    try {
      const res = await fetch(
        `${API}/api/search?q=${encodeURIComponent(searchQuery)}&type=all&limit=6`,
        { signal: controller.signal, credentials: 'include' }
      )
      if (!res.ok) return
      const data = await res.json()
      const apiLatencyMs = Math.round(performance.now() - fetchStart)
      const totalResults = (data.results?.sheets?.length || 0) + (data.results?.courses?.length || 0) +
        (data.results?.users?.length || 0) + (data.results?.notes?.length || 0) + (data.results?.groups?.length || 0)
      trackEvent('page_timing', { page: 'search', apiLatencyMs, totalResults })
      setResults({
        sheets: data.results?.sheets || [],
        courses: data.results?.courses || [],
        users: data.results?.users || [],
        notes: data.results?.notes || [],
        groups: data.results?.groups || [],
      })
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
      setResults({ sheets: [], courses: [], users: [], notes: [], groups: [] })
      setLoading(false)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(() => fetchResults(value.trim()), DEBOUNCE_MS)
  }

  // Build flat list for keyboard nav
  const flatItems = []
  results.sheets.forEach((s) => flatItems.push({ type: 'sheet', data: s }))
  results.notes.forEach((n) => flatItems.push({ type: 'note', data: n }))
  results.courses.forEach((c) => flatItems.push({ type: 'course', data: c }))
  results.users.forEach((u) => flatItems.push({ type: 'user', data: u }))
  results.groups.forEach((g) => flatItems.push({ type: 'group', data: g }))

  function navigateToItem(item) {
    onClose()
    if (item.type === 'sheet') navigate(`/sheets/${item.data.id}`)
    else if (item.type === 'note') navigate(`/notes/${item.data.id}`)
    else if (item.type === 'course') navigate(`/sheets?courseId=${item.data.id}`)
    else if (item.type === 'user') navigate(`/users/${item.data.username}`)
    else if (item.type === 'group') navigate(`/study-groups/${item.data.id}`)
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
      <div ref={trapRef} style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search sheets, courses, and users">
        {/* Search input */}
        <div style={styles.inputRow}>
          <IconSearch size={16} style={{ color: 'var(--sh-slate-500, #64748b)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search sheets, notes, courses, users..."
            aria-label="Search sheets, notes, courses, and users"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults({ sheets: [], courses: [], users: [], notes: [], groups: [] }); inputRef.current?.focus() }}
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

          <NoteResults
            notes={results.notes}
            sheetsCount={results.sheets.length}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />

          <CourseResults
            courses={results.courses}
            sheetsCount={results.sheets.length + results.notes.length}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />

          <UserResults
            users={results.users}
            sheetsCount={results.sheets.length + results.notes.length}
            coursesCount={results.courses.length}
            query={query}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            navigateToItem={navigateToItem}
          />

          <GroupResults
            groups={results.groups}
            sheetsCount={results.sheets.length + results.notes.length}
            coursesCount={results.courses.length}
            usersCount={results.users.length}
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

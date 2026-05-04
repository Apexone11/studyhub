import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconX, IconScroll } from '../Icons'
import { API } from '../../config'
import { DEBOUNCE_MS, styles } from './searchModalConstants'
import {
  SheetResults,
  NoteResults,
  CourseResults,
  UserResults,
  GroupResults,
} from './SearchResultItems'
import { trackEvent } from '../../lib/telemetry'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { truncate } from '../../pages/scholar/scholarConstants'

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({
    sheets: [],
    courses: [],
    users: [],
    notes: [],
    groups: [],
    papers: [],
  })
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
      setResults({ sheets: [], courses: [], users: [], notes: [], groups: [], papers: [] })
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
      // Fan out: existing /api/search for sheets/courses/users/notes/groups
      // and /api/scholar/search for papers. We don't merge into the existing
      // /api/search backend yet because it would couple the unified search
      // module to the Scholar adapter fan-out (added in Week 4-5).
      const [searchRes, scholarRes] = await Promise.allSettled([
        fetch(`${API}/api/search?q=${encodeURIComponent(searchQuery)}&type=all&limit=6`, {
          signal: controller.signal,
          credentials: 'include',
        }),
        fetch(`${API}/api/scholar/search?q=${encodeURIComponent(searchQuery)}&limit=4`, {
          signal: controller.signal,
          credentials: 'include',
        }),
      ])
      let data = { results: {} }
      if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
        data = await searchRes.value.json()
      }
      let papers = []
      if (scholarRes.status === 'fulfilled' && scholarRes.value.ok) {
        const j = await scholarRes.value.json()
        papers = Array.isArray(j.results) ? j.results.slice(0, 4) : []
      }
      const apiLatencyMs = Math.round(performance.now() - fetchStart)
      const totalResults =
        (data.results?.sheets?.length || 0) +
        (data.results?.courses?.length || 0) +
        (data.results?.users?.length || 0) +
        (data.results?.notes?.length || 0) +
        (data.results?.groups?.length || 0) +
        papers.length
      trackEvent('page_timing', { page: 'search', apiLatencyMs, totalResults })
      setResults({
        sheets: data.results?.sheets || [],
        courses: data.results?.courses || [],
        users: data.results?.users || [],
        notes: data.results?.notes || [],
        groups: data.results?.groups || [],
        papers,
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
      setResults({ sheets: [], courses: [], users: [], notes: [], groups: [], papers: [] })
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
  results.papers.forEach((p) => flatItems.push({ type: 'paper', data: p }))

  function navigateToItem(item) {
    onClose()
    if (item.type === 'sheet') navigate(`/sheets/${item.data.id}`)
    else if (item.type === 'note') navigate(`/notes/${item.data.id}`)
    else if (item.type === 'course') navigate(`/sheets?courseId=${item.data.id}`)
    else if (item.type === 'user') navigate(`/users/${item.data.username}`)
    else if (item.type === 'group') navigate(`/study-groups/${item.data.id}`)
    else if (item.type === 'paper') navigate(`/scholar/paper/${encodeURIComponent(item.data.id)}`)
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
      <div
        ref={trapRef}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search sheets, courses, and users"
      >
        {/* Search input */}
        <div className="sh-search-input-row" style={styles.inputRow}>
          <IconSearch size={16} style={{ color: 'var(--sh-slate-500, #64748b)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search sheets, notes, courses, users..."
            aria-label="Search sheets, notes, courses, and users"
            className="sh-search-input"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults({
                  sheets: [],
                  courses: [],
                  users: [],
                  notes: [],
                  groups: [],
                  papers: [],
                })
                inputRef.current?.focus()
              }}
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
          {loading && hasQuery && <div style={styles.statusMsg}>Searching...</div>}

          {!loading && hasQuery && !hasResults && (
            <div style={styles.statusMsg}>No results found for &ldquo;{query}&rdquo;</div>
          )}

          {!hasQuery && <div style={styles.statusMsg}>Type at least 2 characters to search</div>}

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

          {results.papers.length > 0 && (
            <div role="group" aria-label="Paper results">
              <div style={styles.sectionLabel} aria-hidden="true">
                <IconScroll size={13} /> Papers
              </div>
              {results.papers.map((paper, i) => {
                const flatIdx =
                  results.sheets.length +
                  results.notes.length +
                  results.courses.length +
                  results.users.length +
                  results.groups.length +
                  i
                return (
                  <div
                    key={`p-${paper.id}`}
                    role="option"
                    aria-selected={activeIndex === flatIdx}
                    aria-label={paper.title}
                    tabIndex={-1}
                    style={{
                      ...styles.resultItem,
                      background:
                        activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
                    }}
                    onClick={() => navigateToItem({ type: 'paper', data: paper })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigateToItem({ type: 'paper', data: paper })
                      }
                    }}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <div style={styles.resultTitle}>{truncate(paper.title || 'Untitled', 80)}</div>
                    <div style={styles.resultMeta}>
                      {(paper.authors || [])
                        .slice(0, 2)
                        .map((a) => a.name)
                        .filter(Boolean)
                        .join(', ')}
                      {paper.venue ? ` · ${paper.venue}` : ''}
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

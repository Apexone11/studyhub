import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch, IconX } from '../Icons'
import { API } from '../../config'
import { DEBOUNCE_MS, RECENT_SEARCHES_DISPLAY, SEARCH_TABS, styles } from './searchModalConstants'
import {
  SearchEmptyState,
  SearchNoResults,
  SearchSkeletonList,
  SearchTabChips,
} from './searchModalComponents'
import {
  SheetResults,
  NoteResults,
  CourseResults,
  UserResults,
  GroupResults,
} from './SearchResultItems'
import { clearRecentSearches, pushRecentSearch, readRecentSearches } from './searchModalRecent'
import { trackEvent } from '../../lib/telemetry'
import { useFocusTrap } from '../../lib/useFocusTrap'

const EMPTY_RESULTS = Object.freeze({
  sheets: [],
  courses: [],
  users: [],
  notes: [],
  groups: [],
})

/**
 * Build "Try ..." suggestion strings from the user's enrolled courses.
 * Returns an empty array if no courses are available (suggestions are
 * a soft enhancement — never block render on them).
 */
function buildSuggestions(courses) {
  if (!Array.isArray(courses) || courses.length === 0) return []
  const out = []
  for (const c of courses.slice(0, 3)) {
    if (c?.code) out.push(`${c.code} review sheet`)
    else if (c?.name) out.push(`${c.name} notes`)
  }
  return out.slice(0, 4)
}

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [activeTab, setActiveTab] = useState('all')
  const [recent, setRecent] = useState([])
  const [enrolledCourses, setEnrolledCourses] = useState([])

  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const tabRefs = useRef([])
  const navigate = useNavigate()
  const trapRef = useFocusTrap({ active: open, onClose, initialFocusRef: inputRef })

  // Hydrate recent searches and enrolled courses each time the modal opens.
  useEffect(() => {
    if (!open) {
      clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
      return
    }

    queueMicrotask(() => {
      setQuery('')
      setResults(EMPTY_RESULTS)
      setActiveIndex(-1)
      setActiveTab('all')
      setLoading(false)
      setRecent(readRecentSearches().slice(0, RECENT_SEARCHES_DISPLAY))
    })

    // Pull enrolled courses for suggestions. Fail-soft — suggestions are a
    // UX enhancement; a 401 / network error must not break search.
    let cancelled = false
    fetch(`${API}/api/dashboard/summary`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setEnrolledCourses(Array.isArray(data.courses) ? data.courses : [])
      })
      .catch(() => {
        // Silent — suggestions stay empty.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Cleanup timer and abort controller on unmount.
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
      const searchRes = await fetch(
        `${API}/api/search?q=${encodeURIComponent(searchQuery)}&type=all&limit=6`,
        { signal: controller.signal, credentials: 'include' },
      )
      let data = { results: {} }
      if (searchRes.ok) {
        data = await searchRes.json()
      }
      // Stale-result guard. If a newer search has replaced abortRef while we
      // were awaiting JSON, the fresh request owns the loading state — we must
      // NOT overwrite its results with our older response.
      if (abortRef.current !== controller || controller.signal.aborted) {
        return
      }
      const apiLatencyMs = Math.round(performance.now() - fetchStart)
      const totalResults =
        (data.results?.sheets?.length || 0) +
        (data.results?.courses?.length || 0) +
        (data.results?.users?.length || 0) +
        (data.results?.notes?.length || 0) +
        (data.results?.groups?.length || 0)
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
      if (abortRef.current === controller) {
        setLoading(false)
      }
    }
  }, [])

  function runSearch(value) {
    setQuery(value)
    clearTimeout(timerRef.current)
    const trimmed = value.trim()

    if (trimmed.length < 2) {
      if (abortRef.current) abortRef.current.abort()
      setResults(EMPTY_RESULTS)
      setLoading(false)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(() => fetchResults(trimmed), DEBOUNCE_MS)
  }

  function handleChange({ target: { value } }) {
    runSearch(value)
  }

  // Compute the flat list of results visible under the current tab filter.
  // Order matches the on-screen render order so keyboard nav lines up.
  const flatItems = useMemo(() => {
    const items = []
    if (activeTab === 'all' || activeTab === 'sheets') {
      results.sheets.forEach((s) => items.push({ type: 'sheet', data: s }))
    }
    if (activeTab === 'all' || activeTab === 'notes') {
      results.notes.forEach((n) => items.push({ type: 'note', data: n }))
    }
    if (activeTab === 'all' || activeTab === 'courses') {
      results.courses.forEach((c) => items.push({ type: 'course', data: c }))
    }
    if (activeTab === 'all' || activeTab === 'users') {
      results.users.forEach((u) => items.push({ type: 'user', data: u }))
    }
    if (activeTab === 'all' || activeTab === 'groups') {
      results.groups.forEach((g) => items.push({ type: 'group', data: g }))
    }
    return items
  }, [results, activeTab])

  // Compute the empty-state flat list (recent + suggestions, in render order).
  const suggestions = useMemo(() => buildSuggestions(enrolledCourses), [enrolledCourses])
  const emptyStateFlat = useMemo(() => {
    const items = []
    for (const entry of recent) items.push({ kind: 'recent', value: entry })
    for (const entry of suggestions) items.push({ kind: 'suggestion', value: entry })
    return items
  }, [recent, suggestions])

  function recordRecent(value) {
    const trimmed = (value || '').trim()
    if (trimmed.length < 2) return
    pushRecentSearch(trimmed)
    setRecent(readRecentSearches().slice(0, RECENT_SEARCHES_DISPLAY))
  }

  function navigateToItem(item) {
    recordRecent(query)
    onClose()
    if (item.type === 'sheet') navigate(`/sheets/${item.data.id}`)
    else if (item.type === 'note') navigate(`/notes/${item.data.id}`)
    else if (item.type === 'course') navigate(`/sheets?courseId=${item.data.id}`)
    else if (item.type === 'user') navigate(`/users/${item.data.username}`)
    else if (item.type === 'group') navigate(`/study-groups/${item.data.id}`)
  }

  function handleEmptyStatePick(value) {
    recordRecent(value)
    setQuery(value)
    inputRef.current?.focus()
    runSearch(value)
  }

  function handleClearRecent() {
    clearRecentSearches()
    setRecent([])
    setActiveIndex(-1)
  }

  function cycleTab(direction) {
    const currentIdx = SEARCH_TABS.findIndex((t) => t.key === activeTab)
    const safeIdx = currentIdx === -1 ? 0 : currentIdx
    const nextIdx = (safeIdx + direction + SEARCH_TABS.length) % SEARCH_TABS.length
    const nextKey = SEARCH_TABS[nextIdx].key
    setActiveTab(nextKey)
    setActiveIndex(-1)
    // Pulse focus to the tab chip then back to the input so screen-readers
    // announce the active filter while typing stays uninterrupted.
    tabRefs.current[nextIdx]?.focus()
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleKeyDown(e) {
    const hasQuery = query.trim().length >= 2
    const navList = hasQuery ? flatItems : emptyStateFlat

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, navList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (hasQuery && activeIndex >= 0 && flatItems[activeIndex]) {
        e.preventDefault()
        navigateToItem(flatItems[activeIndex])
      } else if (!hasQuery && activeIndex >= 0 && emptyStateFlat[activeIndex]) {
        e.preventDefault()
        handleEmptyStatePick(emptyStateFlat[activeIndex].value)
      } else if (hasQuery) {
        recordRecent(query)
      }
    } else if (e.key === 'Tab') {
      // Cycle through the tab-filter chips. Shift+Tab goes backwards.
      e.preventDefault()
      cycleTab(e.shiftKey ? -1 : 1)
    }
  }

  if (!open) return null

  const hasResults = flatItems.length > 0
  const hasQuery = query.trim().length >= 2

  // Tab chips show counts while the user is searching so they can see at a
  // glance how many results are in each bucket.
  const tabsWithCounts = hasQuery
    ? SEARCH_TABS.map((tab) => {
        if (tab.key === 'all') {
          const total =
            results.sheets.length +
            results.notes.length +
            results.courses.length +
            results.users.length +
            results.groups.length
          return { ...tab, count: total }
        }
        return { ...tab, count: (results[tab.key] || []).length }
      })
    : SEARCH_TABS

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
            aria-controls="sh-search-results"
            className="sh-search-input"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults(EMPTY_RESULTS)
                setActiveIndex(-1)
                inputRef.current?.focus()
              }}
              style={styles.clearBtn}
              title="Clear"
              aria-label="Clear search"
              type="button"
            >
              <IconX size={14} />
            </button>
          )}
          <kbd style={styles.kbd}>Esc</kbd>
        </div>

        {/* Tab filter chips */}
        <SearchTabChips
          active={activeTab}
          onChange={(key) => {
            setActiveTab(key)
            setActiveIndex(-1)
            inputRef.current?.focus()
          }}
          registerTab={(node, idx) => {
            tabRefs.current[idx] = node
          }}
          tabs={tabsWithCounts}
        />

        {/* Results / empty state / no-results / loading */}
        <div style={styles.resultsContainer} id="sh-search-results" role="listbox">
          {loading && hasQuery && <SearchSkeletonList count={5} />}

          {!loading && hasQuery && !hasResults && (
            <SearchNoResults
              query={query}
              onBroaden={
                activeTab !== 'all'
                  ? () => {
                      setActiveTab('all')
                      setActiveIndex(-1)
                    }
                  : undefined
              }
            />
          )}

          {!hasQuery && (
            <SearchEmptyState
              recent={recent}
              suggestions={suggestions}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPick={handleEmptyStatePick}
              onClearRecent={handleClearRecent}
            />
          )}

          {hasQuery && !loading && (
            <>
              {(activeTab === 'all' || activeTab === 'sheets') && (
                <SheetResults
                  sheets={results.sheets}
                  query={query}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigateToItem={navigateToItem}
                />
              )}

              {(activeTab === 'all' || activeTab === 'notes') && (
                <NoteResults
                  notes={results.notes}
                  sheetsCount={activeTab === 'all' ? results.sheets.length : 0}
                  query={query}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigateToItem={navigateToItem}
                />
              )}

              {(activeTab === 'all' || activeTab === 'courses') && (
                <CourseResults
                  courses={results.courses}
                  sheetsCount={
                    activeTab === 'all' ? results.sheets.length + results.notes.length : 0
                  }
                  query={query}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigateToItem={navigateToItem}
                />
              )}

              {(activeTab === 'all' || activeTab === 'users') && (
                <UserResults
                  users={results.users}
                  sheetsCount={
                    activeTab === 'all' ? results.sheets.length + results.notes.length : 0
                  }
                  coursesCount={activeTab === 'all' ? results.courses.length : 0}
                  query={query}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigateToItem={navigateToItem}
                />
              )}

              {(activeTab === 'all' || activeTab === 'groups') && (
                <GroupResults
                  groups={results.groups}
                  sheetsCount={
                    activeTab === 'all' ? results.sheets.length + results.notes.length : 0
                  }
                  coursesCount={activeTab === 'all' ? results.courses.length : 0}
                  usersCount={activeTab === 'all' ? results.users.length : 0}
                  query={query}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  navigateToItem={navigateToItem}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

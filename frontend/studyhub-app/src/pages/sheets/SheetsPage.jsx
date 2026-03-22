import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import {
  IconFork,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconUpload,
} from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'
import { staggerEntrance } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonSheetGrid } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { SHEETS_STEPS } from '../../lib/tutorialSteps'
import './SheetsPage.css'

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Recent' },
  { value: 'stars', label: 'Stars' },
  { value: 'forks', label: 'Forks' },
  { value: 'updatedAt', label: 'Updated' },
]

const FORMAT_OPTIONS = [
  { value: 'all', label: 'All formats' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'pdf', label: 'PDF' },
]

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function resolveSheetFormat(sheet) {
  const attachmentType = String(sheet?.attachmentType || '').toLowerCase()
  if (attachmentType.includes('pdf')) return 'pdf'
  const contentFormat = String(sheet?.contentFormat || '').toLowerCase()
  if (contentFormat === 'html') return 'html'
  return 'markdown'
}

function formatBadgeText(format) {
  if (format === 'html') return 'HTML'
  if (format === 'pdf') return 'PDF'
  return 'MD'
}

function SheetListRow({ sheet, forking, onOpen, onStar, onFork }) {
  const format = resolveSheetFormat(sheet)
  const authorName = sheet.author?.username || 'Unknown author'
  const schoolLabel = sheet.course?.school?.short || sheet.course?.school?.name || 'StudyHub'
  const preview = (sheet.description || sheet.content || 'No summary available yet.').replace(/\s+/g, ' ').trim()

  const handleRowKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(sheet.id)
    }
  }

  return (
    <article
      className="sheets-repo-row"
      role="link"
      tabIndex={0}
      onClick={() => onOpen(sheet.id)}
      onKeyDown={handleRowKeyDown}
      aria-label={`Open ${sheet.title}`}
    >
      <div className="sheets-repo-row__main">
        <h2 className="sheets-repo-row__title">
          <Link to={`/sheets/${sheet.id}`} onClick={(event) => event.stopPropagation()}>
            {sheet.title}
          </Link>
        </h2>
        <p className="sheets-repo-row__description">{preview}</p>
        <div className="sheets-repo-row__meta">
          <span>{sheet.course?.code || 'General'} · {schoolLabel}</span>
          <span aria-hidden="true">•</span>
          {sheet.author?.username ? (
            <span>
              by{' '}
              <Link to={`/users/${sheet.author.username}`} onClick={(event) => event.stopPropagation()}>
                {sheet.author.username}
              </Link>
            </span>
          ) : (
            <span>by {authorName}</span>
          )}
          <span aria-hidden="true">•</span>
          <span>Updated {timeAgo(sheet.updatedAt || sheet.createdAt)}</span>
          <span aria-hidden="true">•</span>
          <span className={`sh-pill sheets-repo-row__format sheets-repo-row__format--${format}`}>
            {formatBadgeText(format)}
          </span>
          {sheet.status === 'draft' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-muted)', background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', borderRadius: 6, padding: '1px 6px' }}>Draft</span>
          ) : sheet.status === 'rejected' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-danger)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger)', borderRadius: 6, padding: '1px 6px' }}>Rejected</span>
          ) : sheet.status === 'quarantined' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sh-danger)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger)', borderRadius: 6, padding: '1px 6px' }}>Quarantined</span>
          ) : (sheet.htmlRiskTier || 0) === 1 ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ca8a04', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px' }}>Flagged</span>
          ) : (sheet.htmlRiskTier || 0) >= 2 || sheet.status === 'pending_review' ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px' }}>Pending Review</span>
          ) : null}
        </div>
      </div>

      <div className="sheets-repo-row__side">
        <div className="sheets-repo-row__stats" aria-label="Sheet stats">
          <span className="sheets-repo-row__stat">
            <IconStar size={13} />
            {sheet.stars || 0}
          </span>
          <span className="sheets-repo-row__stat">
            <IconFork size={13} />
            {sheet.forks || 0}
          </span>
        </div>
        <div className="sheets-repo-row__actions">
          <button
            type="button"
            className={`sh-btn sh-btn--secondary sh-btn--sm sheets-repo-row__action ${sheet.starred ? 'is-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onStar(sheet)
            }}
            aria-pressed={Boolean(sheet.starred)}
            aria-label={`Star ${sheet.title}`}
          >
            {sheet.starred ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            Star
          </button>
          <button
            type="button"
            className="sh-btn sh-btn--secondary sh-btn--sm sheets-repo-row__action"
            onClick={(event) => {
              event.stopPropagation()
              onFork(sheet)
            }}
            disabled={forking}
            aria-label={`Fork ${sheet.title}`}
          >
            <IconFork size={13} />
            {forking ? 'Forking...' : 'Fork'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function SheetsPage() {
  usePageTitle('Study Sheets')
  const navigate = useNavigate()
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()
  const [catalog, setCatalog] = useState([])
  const [catalogError, setCatalogError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [forkingSheetId, setForkingSheetId] = useState(null)
  const [sheetsState, setSheetsState] = useState({ sheets: [], total: 0, loading: true, error: '' })
  const cardsRef = useRef(null)
  const animatedRef = useRef(false)

  const search = searchParams.get('search') || ''
  const schoolId = searchParams.get('schoolId') || ''
  const courseId = searchParams.get('courseId') || ''
  const mine = searchParams.get('mine') === '1'
  const starred = searchParams.get('starred') === '1'
  const sortValue = SORT_OPTIONS.some((option) => option.value === searchParams.get('sort'))
    ? searchParams.get('sort')
    : 'createdAt'
  const formatValue = FORMAT_OPTIONS.some((option) => option.value === searchParams.get('format'))
    ? searchParams.get('format')
    : 'all'

  const tutorial = useTutorial('sheets', SHEETS_STEPS)

  useEffect(() => {
    if (sheetsState.loading || animatedRef.current || sheetsState.sheets.length === 0) return
    animatedRef.current = true
    if (cardsRef.current) {
      staggerEntrance(cardsRef.current.children, { staggerMs: 45, duration: 300, y: 8 })
    }
  }, [sheetsState.loading, sheetsState.sheets.length])

  const setQueryParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleSchoolChange = useCallback((value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('schoolId', value)
    else next.delete('schoolId')

    if (!value) {
      next.delete('courseId')
    } else {
      const selectedSchool = catalog.find((school) => String(school.id) === String(value))
      const currentCourseId = next.get('courseId')
      const hasCourse = (selectedSchool?.courses || []).some((course) => String(course.id) === String(currentCourseId))
      if (currentCourseId && !hasCourse) {
        next.delete('courseId')
      }
    }

    setSearchParams(next, { replace: true })
  }, [catalog, searchParams, setSearchParams])

  const allCourses = useMemo(
    () => catalog.flatMap((school) =>
      (school.courses || []).map((course) => ({ ...course, school }))),
    [catalog],
  )

  const activeSchool = useMemo(
    () => catalog.find((school) => String(school.id) === schoolId) || null,
    [catalog, schoolId],
  )

  const availableCourses = useMemo(() => {
    if (!activeSchool) return allCourses
    return (activeSchool.courses || []).map((course) => ({ ...course, school: activeSchool }))
  }, [activeSchool, allCourses])

  const selectedCourse = useMemo(
    () => allCourses.find((course) => String(course.id) === courseId) || null,
    [allCourses, courseId],
  )

  const subtitle = useMemo(() => {
    if (selectedCourse) {
      const schoolLabel = selectedCourse.school?.short || selectedCourse.school?.name || 'StudyHub'
      return `${selectedCourse.code} — ${selectedCourse.name} · ${schoolLabel}`
    }
    if (activeSchool) {
      return `Browse sheets shared in ${activeSchool.short || activeSchool.name}.`
    }
    return 'Browse, star, and fork study sheets shared by your classmates.'
  }, [activeSchool, selectedCourse])

  const hasActiveFilters = Boolean(
    search || schoolId || courseId || mine || starred || formatValue !== 'all' || sortValue !== 'createdAt',
  )

  useEffect(() => {
    const legacySearch = searchParams.get('q') || ''
    const legacyCourseId = searchParams.get('course') || ''
    const nextSearch = searchParams.get('search') || ''
    const nextCourseId = searchParams.get('courseId') || ''

    if (!legacySearch && !legacyCourseId) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)

    if (legacySearch && !nextSearch) {
      nextParams.set('search', legacySearch)
    }
    if (legacySearch) {
      nextParams.delete('q')
    }

    if (legacyCourseId && !nextCourseId) {
      nextParams.set('courseId', legacyCourseId)
    }
    if (legacyCourseId) {
      nextParams.delete('course')
    }

    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  const loadCatalog = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())
    try {
      const response = await fetch(`${API}/api/courses/schools`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })
      const data = await response.json().catch(() => [])
      if (!response.ok) {
        throw new Error('Could not load schools.')
      }
      apply(() => {
        setCatalog(Array.isArray(data) ? data : [])
        setCatalogError('')
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => setCatalogError(error.message || 'Could not load schools.'))
    }
  }, [])

  const loadSheets = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())
    const params = new URLSearchParams({ limit: '24', sort: sortValue })

    if (search) params.set('search', search)
    if (schoolId) params.set('schoolId', schoolId)
    if (courseId) params.set('courseId', courseId)
    if (mine) params.set('mine', '1')
    if (starred) params.set('starred', '1')
    if (formatValue !== 'all') params.set('format', formatValue)

    try {
      const response = await fetch(`${API}/api/sheets?${params.toString()}`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        return
      }

      if (response.status === 403) {
        apply(() => {
          setSheetsState((current) => ({
            ...current,
            loading: false,
            error: getApiErrorMessage(data, 'Access to study sheets is temporarily restricted.'),
          }))
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load sheets.'))
      }

      apply(() => {
        setSheetsState({
          sheets: Array.isArray(data.sheets) ? data.sheets : [],
          total: data.total || 0,
          loading: false,
          error: '',
        })
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => {
        setSheetsState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Could not load sheets.',
        }))
      })
    }
  }, [clearSession, courseId, formatValue, mine, schoolId, search, sortValue, starred])

  const loadMoreSheets = useCallback(async () => {
    setLoadingMore(true)
    const params = new URLSearchParams({
      limit: '24',
      offset: String(sheetsState.sheets.length),
      sort: sortValue,
    })
    if (search) params.set('search', search)
    if (schoolId) params.set('schoolId', schoolId)
    if (courseId) params.set('courseId', courseId)
    if (mine) params.set('mine', '1')
    if (starred) params.set('starred', '1')
    if (formatValue !== 'all') params.set('format', formatValue)

    try {
      const response = await fetch(`${API}/api/sheets?${params.toString()}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (response.ok && Array.isArray(data.sheets)) {
        setSheetsState((current) => ({
          ...current,
          sheets: [...current.sheets, ...data.sheets],
          total: data.total || current.total,
        }))
      }
    } catch {
      // Keep current list if load-more fails.
    } finally {
      setLoadingMore(false)
    }
  }, [courseId, formatValue, mine, schoolId, search, sheetsState.sheets.length, sortValue, starred])

  useLivePolling(loadCatalog, {
    enabled: Boolean(user),
    intervalMs: 120000,
  })

  useLivePolling(loadSheets, {
    enabled: Boolean(user),
    intervalMs: 45000,
    refreshKey: `${search}|${schoolId}|${courseId}|${mine}|${starred}|${sortValue}|${formatValue}`,
  })

  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const toggleStar = async (sheet) => {
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the star.')
      }
      setSheetsState((current) => ({
        ...current,
        sheets: current.sheets.map((entry) => (
          entry.id === sheet.id
            ? { ...entry, starred: data.starred, stars: data.stars }
            : entry
        )),
      }))
    } catch (error) {
      showToast(error.message || 'Could not update the star.', 'error')
      setSheetsState((current) => ({
        ...current,
        error: error.message || 'Could not update the star.',
      }))
    }
  }

  const handleFork = async (sheet) => {
    if (forkingSheetId === sheet.id) return
    setForkingSheetId(sheet.id)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/fork`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not fork this sheet.')
      }
      showToast('Sheet forked! Redirecting to editor…', 'success')
      navigate(`/sheets/${data.id}/edit`)
    } catch (error) {
      showToast(error.message || 'Could not fork this sheet.', 'error')
    } finally {
      setForkingSheetId(null)
    }
  }

  return (
    <>
      <Navbar />
      <div className="sheets-page">
        <div style={pageShell('app', 26, 48)}>
          <div className="app-three-col-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" className="sheets-page__main">
              <section className="sh-card sheets-page__title-card">
                <div className="sheets-page__title-row">
                  <div>
                    <h1 className="sheets-page__title">Study Sheets</h1>
                    <p className="sheets-page__subtitle">{subtitle}</p>
                  </div>
                  <Link data-tutorial="sheets-upload" to="/sheets/upload" className="sh-btn sh-btn--primary sheets-page__upload-cta">
                    <IconUpload size={14} />
                    Upload a sheet
                  </Link>
                </div>
              </section>

              <section className="sh-card sheets-page__filters-card">
                <div className="sheets-page__mobile-search-row">
                  <label className="sheets-page__search-wrap">
                    <IconSearch size={15} className="sheets-page__search-icon" />
                    <input
                      className="sh-input sheets-page__search-input"
                      value={search}
                      onChange={(event) => setQueryParam('search', event.target.value)}
                      placeholder="Search sheets, topics, or authors..."
                    />
                  </label>
                  <button
                    type="button"
                    className="sh-btn sh-btn--secondary sh-btn--sm"
                    onClick={() => setMobileFiltersOpen((open) => !open)}
                    aria-expanded={mobileFiltersOpen}
                    aria-controls="sheets-filter-panel"
                  >
                    {mobileFiltersOpen ? 'Close' : 'Filters'}
                  </button>
                </div>

                <div
                  id="sheets-filter-panel"
                  className={`sheets-page__filter-grid ${mobileFiltersOpen ? 'is-open' : ''}`}
                  data-tutorial="sheets-filters"
                >
                  <label data-tutorial="sheets-search" className="sheets-page__search-wrap sheets-page__desktop-search">
                    <IconSearch size={15} className="sheets-page__search-icon" />
                    <input
                      className="sh-input sheets-page__search-input"
                      value={search}
                      onChange={(event) => setQueryParam('search', event.target.value)}
                      placeholder="Search sheets, topics, or authors..."
                    />
                  </label>

                  <select
                    className="sh-input sheets-page__filter-select"
                    value={schoolId}
                    onChange={(event) => handleSchoolChange(event.target.value)}
                  >
                    <option value="">All schools</option>
                    {catalog.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.short || school.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="sh-input sheets-page__filter-select"
                    value={courseId}
                    onChange={(event) => setQueryParam('courseId', event.target.value)}
                  >
                    <option value="">All courses</option>
                    {availableCourses.map((course) => {
                      const schoolLabel = course.school?.short || course.school?.name
                      return (
                        <option key={course.id} value={course.id}>
                          {activeSchool ? course.code : `${course.code}${schoolLabel ? ` · ${schoolLabel}` : ''}`}
                        </option>
                      )
                    })}
                  </select>

                  <select
                    className="sh-input sheets-page__filter-select"
                    value={sortValue}
                    onChange={(event) => setQueryParam('sort', event.target.value)}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="sh-input sheets-page__filter-select"
                    value={formatValue}
                    onChange={(event) => setQueryParam('format', event.target.value === 'all' ? '' : event.target.value)}
                  >
                    {FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="sheets-page__toggle-row" data-tutorial="sheets-toggles">
                    <button
                      type="button"
                      className={`sh-chip ${mine ? 'sh-chip--active' : ''}`}
                      onClick={() => setQueryParam('mine', mine ? '' : '1')}
                    >
                      Mine
                    </button>
                    <button
                      type="button"
                      className={`sh-chip ${starred ? 'sh-chip--active' : ''}`}
                      onClick={() => setQueryParam('starred', starred ? '' : '1')}
                    >
                      Starred
                    </button>
                  </div>
                </div>
              </section>

              {catalogError ? <div className="sh-alert sh-alert--danger">{catalogError}</div> : null}
              {sheetsState.error ? <div className="sh-alert sh-alert--danger">{sheetsState.error}</div> : null}

              {sheetsState.loading ? (
                <SkeletonSheetGrid count={4} />
              ) : sheetsState.sheets.length === 0 ? (
                <section className="sh-card sheets-page__empty-state">
                  {search.trim() ? (
                    <>
                      <h2 className="sheets-page__empty-title">No results for &ldquo;{search}&rdquo;</h2>
                      <p className="sheets-page__empty-copy">
                        Try another query or clear your filters to scan the full sheet index.
                      </p>
                      <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : hasActiveFilters ? (
                    <>
                      <h2 className="sheets-page__empty-title">No sheets matched your filters</h2>
                      <p className="sheets-page__empty-copy">
                        Your current filters are too narrow. Clear them to return to the full list.
                      </p>
                      <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : mine ? (
                    <>
                      <h2 className="sheets-page__empty-title">No sheets yet</h2>
                      <p className="sheets-page__empty-copy">
                        You haven&rsquo;t uploaded any sheets yet. Upload your notes or start with a template.
                      </p>
                      <div className="sheets-page__empty-actions">
                        <Link to="/sheets/upload?new=1" className="sh-btn sh-btn--primary">
                          <IconUpload size={14} />
                          Upload a sheet
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="sheets-page__empty-title">Be the first to share for this space</h2>
                      <p className="sheets-page__empty-copy">
                        No published sheets yet. Upload your notes or start with a template to kick off the course repo.
                      </p>
                      <div className="sheets-page__empty-actions">
                        <Link to="/sheets/upload" className="sh-btn sh-btn--primary">
                          <IconUpload size={14} />
                          Upload a sheet
                        </Link>
                        <Link to="/sheets/upload?template=starter" className="sh-btn sh-btn--secondary">
                          Use a template
                        </Link>
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <section className="sh-card sh-card--flat sh-card--flush sheets-page__list-shell">
                  <div className="sheets-page__list-head">
                    <span>{sheetsState.total} sheet{sheetsState.total === 1 ? '' : 's'}</span>
                    {hasActiveFilters ? (
                      <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    ) : null}
                  </div>

                  <div ref={cardsRef} className="sheets-page__rows" role="list">
                    {sheetsState.sheets.map((sheet) => (
                      <SheetListRow
                        key={sheet.id}
                        sheet={sheet}
                        forking={forkingSheetId === sheet.id}
                        onOpen={(sheetId) => {
                          const s = sheetsState.sheets.find((x) => x.id === sheetId)
                          if (s && s.status === 'draft') {
                            navigate(`/sheets/upload?draft=${sheetId}`)
                          } else {
                            navigate(`/sheets/${sheetId}`)
                          }
                        }}
                        onStar={toggleStar}
                        onFork={handleFork}
                      />
                    ))}
                  </div>

                  {sheetsState.sheets.length < sheetsState.total ? (
                    <div className="sheets-page__load-more-wrap">
                      <button onClick={loadMoreSheets} disabled={loadingMore} className="sh-load-more-btn">
                        {loadingMore
                          ? 'Loading...'
                          : `Load More (${sheetsState.sheets.length} of ${sheetsState.total})`}
                      </button>
                    </div>
                  ) : null}
                </section>
              )}
            </main>

            <aside className="feed-aside sheets-page__aside">
              <section className="sh-card">
                <h2 className="sh-card-title">Quick view</h2>
                <p className="sh-card-helper">Live index context</p>
                <div className="sheets-page__aside-stats">
                  <div>{sheetsState.total} sheets found</div>
                  <div>{catalog.length} schools available</div>
                  <div>{user?.enrollments?.length || 0} courses in your profile</div>
                </div>
              </section>

              <section className="sh-card">
                <h2 className="sh-card-title">Workflow</h2>
                <p className="sheets-page__aside-copy">
                  Use the filters to narrow the repo list, open a sheet row, then fork or star from the same view.
                </p>
                <Link to="/feed" className="sh-btn sh-btn--secondary sh-btn--sm">
                  Back to feed
                </Link>
              </section>
            </aside>
          </div>
        </div>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen ? (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" className="sheets-page__tutorial-btn">
          ?
        </button>
      ) : null}
    </>
  )
}

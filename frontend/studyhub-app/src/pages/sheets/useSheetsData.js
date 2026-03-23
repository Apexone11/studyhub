import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { staggerEntrance } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { SORT_OPTIONS, FORMAT_OPTIONS, authHeaders } from './sheetsPageConstants'

export default function useSheetsData() {
  const navigate = useNavigate()
  const { user, clearSession } = useSession()
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
  const statusFilter = searchParams.get('status') || ''
  const sortValue = SORT_OPTIONS.some((option) => option.value === searchParams.get('sort'))
    ? searchParams.get('sort')
    : 'createdAt'
  const formatValue = FORMAT_OPTIONS.some((option) => option.value === searchParams.get('format'))
    ? searchParams.get('format')
    : 'all'

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
    search || schoolId || courseId || mine || starred || statusFilter || formatValue !== 'all' || sortValue !== 'createdAt',
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
    if (mine && statusFilter) params.set('status', statusFilter)
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
  }, [clearSession, courseId, formatValue, mine, schoolId, search, sortValue, starred, statusFilter])

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
    if (mine && statusFilter) params.set('status', statusFilter)
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
      showToast('Could not load more sheets. Try again.', 'error')
    } finally {
      setLoadingMore(false)
    }
  }, [courseId, formatValue, mine, schoolId, search, sheetsState.sheets.length, sortValue, starred, statusFilter])

  useLivePolling(loadCatalog, {
    enabled: Boolean(user),
    intervalMs: 120000,
  })

  useLivePolling(loadSheets, {
    enabled: Boolean(user),
    intervalMs: 45000,
    refreshKey: `${search}|${schoolId}|${courseId}|${mine}|${starred}|${sortValue}|${formatValue}|${statusFilter}`,
  })

  const toggleMine = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    if (mine) {
      next.delete('mine')
      next.delete('status')
    } else {
      next.set('mine', '1')
    }
    setSearchParams(next, { replace: true })
  }, [mine, searchParams, setSearchParams])

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
      showToast('Sheet forked! Redirecting to editor\u2026', 'success')
      navigate(`/sheets/${data.id}/edit`)
    } catch (error) {
      showToast(error.message || 'Could not fork this sheet.', 'error')
    } finally {
      setForkingSheetId(null)
    }
  }

  return {
    user,
    navigate,
    search,
    schoolId,
    courseId,
    mine,
    starred,
    statusFilter,
    sortValue,
    formatValue,
    catalog,
    catalogError,
    sheetsState,
    loadingMore,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    forkingSheetId,
    cardsRef,
    activeSchool,
    availableCourses,
    subtitle,
    hasActiveFilters,
    setQueryParam,
    handleSchoolChange,
    toggleMine,
    clearAllFilters,
    toggleStar,
    handleFork,
    loadMoreSheets,
  }
}

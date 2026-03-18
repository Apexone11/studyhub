/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsPage.jsx — Browse, star, and download study sheets
 *
 * Layout (responsive via CSS class `app-three-col-grid` in responsive.css):
 *   Desktop: sidebar (250px) | main content (flex) | quick-view aside (300px)
 *   Tablet:  sidebar trigger (auto) | main + aside (280px)
 *   Phone:   single column
 *
 * Filter bar uses `sheets-filter-grid` class for responsive wrapping.
 * Card grid uses `sheets-card-grid` class (2-col on tablet, 1-col phone).
 *
 * Features: search, school/course/sort filters, Mine/Starred toggles,
 * star/download actions, live polling, sheet quick-view panel.
 *
 * Tutorial: First-visit Joyride highlights search, filters, upload, toggles.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import {
  IconDownload,
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
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { SHEETS_STEPS } from '../../lib/tutorialSteps'

/* ── Shared constants ──────────────────────────────────────────────────── */
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

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

function courseTone(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  const palette = {
    CMSC: ['#ede9fe', '#6d28d9'],
    MATH: ['#d1fae5', '#047857'],
    ENGL: ['#fef3c7', '#b45309'],
    PHYS: ['#e0f2fe', '#0369a1'],
    BIOL: ['#fce7f3', '#be185d'],
    HIST: ['#e0e7ff', '#4338ca'],
    ECON: ['#ccfbf1', '#0f766e'],
    CHEM: ['#ffedd5', '#c2410c'],
  }
  return palette[prefix] || ['#eff6ff', '#1d4ed8']
}

function panelStyle() {
  return {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    padding: 18,
  }
}

function SheetCard({ sheet, onStar }) {
  const [background, tone] = courseTone(sheet.course?.code)
  return (
    <article style={{ ...panelStyle(), padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span
              style={{
                borderRadius: 999,
                background,
                color: tone,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '.05em',
              }}
            >
              {sheet.course?.code || 'General'}
            </span>
            {sheet.course?.school?.short || sheet.course?.school?.name ? (
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                {sheet.course.school.short || sheet.course.school.name}
              </span>
            ) : null}
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{timeAgo(sheet.createdAt)}</span>
          </div>
          <Link to={`/sheets/${sheet.id}`} style={{ display: 'block', color: '#0f172a', textDecoration: 'none', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>{sheet.title}</h2>
          </Link>
          <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
            {sheet.description || sheet.content?.slice(0, 180) || 'No preview yet.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={metricPill()}>{sheet.author?.username || 'Unknown author'}</span>
            <span style={metricPill()}>{sheet.commentCount || 0} comments</span>
            <span style={metricPill()}>{sheet.downloads || 0} downloads</span>
            <span style={metricPill()}><IconFork size={13} /> {sheet.forks || 0} forks</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
          <button type="button" onClick={() => onStar(sheet)} style={actionButton(sheet.starred ? '#f59e0b' : '#475569')}>
            {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
            {sheet.stars || 0}
          </button>
          <Link to={`/sheets/${sheet.id}`} style={linkButton()}>
            <IconDownload size={14} />
            Open
          </Link>
        </div>
      </div>
    </article>
  )
}

function actionButton(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function metricPill() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    padding: '7px 11px',
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  }
}

export default function SheetsPage() {
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()
  const [catalog, setCatalog] = useState([])             // school+course catalog for filters
  const [sheetsState, setSheetsState] = useState({ sheets: [], total: 0, loading: true, error: '' })
  const [catalogError, setCatalogError] = useState('')

  /* ── Query parameters drive the filter state (URL-as-truth) ──────────── */
  const search = searchParams.get('search') || ''
  const schoolId = searchParams.get('schoolId') || ''
  const courseId = searchParams.get('courseId') || ''
  const mine = searchParams.get('mine') === '1'
  const starred = searchParams.get('starred') === '1'
  const orderBy = searchParams.get('sort') || 'createdAt'

  /* Tutorial popup — first-visit or re-trigger via floating "?" button */
  const tutorial = useTutorial('sheets', SHEETS_STEPS)

  const setQueryParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'schoolId' && !value) next.delete('courseId')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const activeSchool = useMemo(
    () => catalog.find((school) => String(school.id) === schoolId) || null,
    [catalog, schoolId],
  )

  const loadCatalog = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())
    try {
      const response = await fetch(`${API}/api/courses/schools`, { headers: authHeaders(), signal })
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
    const params = new URLSearchParams({ limit: '24', sort: orderBy })
    if (search) params.set('search', search)
    if (schoolId) params.set('schoolId', schoolId)
    if (courseId) params.set('courseId', courseId)
    if (mine) params.set('mine', '1')
    if (starred) params.set('starred', '1')

    try {
      const response = await fetch(`${API}/api/sheets?${params.toString()}`, {
        headers: authHeaders(),
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
  }, [clearSession, courseId, mine, orderBy, schoolId, search, starred])

  useLivePolling(loadCatalog, {
    enabled: Boolean(user),
    intervalMs: 120000,
  })

  useLivePolling(loadSheets, {
    enabled: Boolean(user),
    intervalMs: 45000,
    refreshKey: `${search}|${schoolId}|${courseId}|${mine}|${starred}|${orderBy}`,
  })

  const toggleStar = async (sheet) => {
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
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
      setSheetsState((current) => ({ ...current, error: error.message || 'Could not update the star.' }))
    }
  }

  return (
    <>
      <Navbar />
      <div style={{ background: '#edf0f5', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('app', 26, 48)}>
          {/* 3-column responsive grid: sidebar | sheets list | quick view
           * Desktop: all 3 columns visible
           * Tablet:  sidebar trigger (auto) + sheets + quick view
           * Phone:   single column, everything stacked */}
          <div className="app-three-col-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main style={{ display: 'grid', gap: 16 }}>
              <section style={panelStyle()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>Study Sheets</h1>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
                      Browse, star, and download study sheets shared by your classmates.
                    </p>
                  </div>
                  <Link data-tutorial="sheets-upload" to="/sheets/upload" style={linkButton()}>
                    <IconUpload size={14} />
                    Upload a sheet
                  </Link>
                </div>

                {/* Filter bar: responsive via CSS class sheets-filter-grid */}
                <div className="sheets-filter-grid" data-tutorial="sheets-filters">
                  <label data-tutorial="sheets-search" style={{ position: 'relative' }}>
                    <IconSearch size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                    <input
                      value={search}
                      onChange={(event) => setQueryParam('search', event.target.value)}
                      placeholder="Search by title, description..."
                      style={{ width: '100%', borderRadius: 12, border: '1px solid #cbd5e1', padding: '10px 12px 10px 36px', fontSize: 13, fontFamily: FONT }}
                    />
                  </label>
                  <select value={schoolId} onChange={(event) => setQueryParam('schoolId', event.target.value)} style={selectStyle()}>
                    <option value="">All schools</option>
                    {catalog.map((school) => (
                      <option key={school.id} value={school.id}>{school.short || school.name}</option>
                    ))}
                  </select>
                  <select value={courseId} onChange={(event) => setQueryParam('courseId', event.target.value)} style={selectStyle()}>
                    <option value="">All courses</option>
                    {(activeSchool?.courses || []).map((course) => (
                      <option key={course.id} value={course.id}>{course.code}</option>
                    ))}
                  </select>
                  <select value={orderBy} onChange={(event) => setQueryParam('sort', event.target.value)} style={selectStyle()}>
                    <option value="createdAt">Newest</option>
                    <option value="updatedAt">Recently updated</option>
                    <option value="stars">Most starred</option>
                    <option value="downloads">Most downloaded</option>
                    <option value="forks">Most forked</option>
                  </select>
                  <div data-tutorial="sheets-toggles" style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setQueryParam('mine', mine ? '' : '1')} style={togglePill(mine)}>Mine</button>
                    <button type="button" onClick={() => setQueryParam('starred', starred ? '' : '1')} style={togglePill(starred)}>Starred</button>
                  </div>
                </div>
              </section>

              {catalogError ? <div style={errorBanner()}>{catalogError}</div> : null}
              {sheetsState.error ? <div style={errorBanner()}>{sheetsState.error}</div> : null}

              {sheetsState.loading ? (
                <section style={panelStyle()}>
                  <div style={{ color: '#64748b', fontSize: 14 }}>Loading sheets...</div>
                </section>
              ) : sheetsState.sheets.length === 0 ? (
                <section style={{ ...panelStyle(), borderStyle: 'dashed', textAlign: 'center', color: '#94a3b8' }}>
                  No sheets matched your filters.
                </section>
              ) : (
                <div className="sheets-card-grid">
                  {sheetsState.sheets.map((sheet) => (
                    <SheetCard key={sheet.id} sheet={sheet} onStar={toggleStar} />
                  ))}
                </div>
              )}
            </main>

            <aside style={{ display: 'grid', gap: 16 }}>
              <section style={panelStyle()}>
                <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>Quick view</h2>
                <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#64748b' }}>
                  <div>{sheetsState.total} sheets found</div>
                  <div>{catalog.length} schools in the catalog</div>
                  <div>{user?.enrollments?.length || 0} courses in your profile</div>
                </div>
              </section>
              <section style={panelStyle()}>
                <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>Workflow</h2>
                <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                  <div>Use filters to narrow the library, open a sheet, then move back to the list without corrupting the SPA state.</div>
                  <Link to="/feed" style={linkButton()}>Back to feed</Link>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {/* Tutorial popup */}
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" style={{ position: 'fixed', bottom: 24, right: 24, width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', zIndex: 50, display: 'grid', placeItems: 'center' }}>?</button>
      )}
    </>
  )
}

function selectStyle() {
  return {
    width: '100%',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    fontFamily: FONT,
    fontSize: 14,
    color: '#0f172a',
  }
}

function togglePill(active) {
  return {
    borderRadius: 999,
    border: active ? '1px solid #93c5fd' : '1px solid #e2e8f0',
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#1d4ed8' : '#475569',
    padding: '9px 14px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function errorBanner() {
  return {
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: 13,
  }
}

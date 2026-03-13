import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

const API = 'http://localhost:4000'

function getToken() { return localStorage.getItem('token') }
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  }
}

// ─── top nav ─────────────────────────────────────────────────────
function TopNav() {
  return (
    <header style={{
      background: '#0f172a', height: 56,
      position: 'sticky', top: 0, zIndex: 100,
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16,
      borderBottom: '1px solid #1e293b',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" fill="#1e293b"/>
          <line x1="40" y1="64" x2="40" y2="45" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"/>
          <path d="M40 45 Q40 33 25 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <path d="M40 45 Q40 33 55 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <circle cx="40" cy="45" r="4" fill="#3b82f6"/>
          <circle cx="25" cy="23" r="3.5" fill="#60a5fa"/>
          <circle cx="55" cy="23" r="3.5" fill="#60a5fa"/>
          <rect x="30" y="67" width="20" height="4" rx="2" fill="#f59e0b"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
          Study<span style={{ color: '#3b82f6' }}>Hub</span>
        </span>
      </Link>
      <span style={{ color: '#334155', fontSize: 14 }}>/</span>
      <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>Study Sheets</span>
      <div style={{ flex: 1 }} />
      <Link to="/feed" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
      >← Feed</Link>
      <Link to="/sheets/upload" style={{
        padding: '7px 16px', background: '#3b82f6', color: '#fff',
        borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <i className="fa-solid fa-upload" style={{ fontSize: 12 }} />Upload Sheet
      </Link>
    </header>
  )
}

// ─── skeleton card ────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
      padding: '18px 20px', marginBottom: 12,
    }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      <div style={{ display: 'flex', gap: 16, animation: 'shimmer 1.4s ease-in-out infinite' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 15, width: '52%', background: '#f1f5f9', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ height: 12, width: '28%', background: '#f8fafc', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ height: 20, width: 52, background: '#f8fafc', borderRadius: 99 }} />
            <div style={{ height: 20, width: 64, background: '#f8fafc', borderRadius: 99 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ height: 12, width: 80, background: '#f1f5f9', borderRadius: 6 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ height: 30, width: 58, background: '#f1f5f9', borderRadius: 8 }} />
            <div style={{ height: 30, width: 52, background: '#f1f5f9', borderRadius: 8 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── single sheet card ────────────────────────────────────────────
function SheetCard({ sheet }) {
  const [starring,   setStarring]   = useState(false)
  const [hasStarred, setHasStarred] = useState(false)
  const [localStars, setLocalStars] = useState(sheet.stars || 0)

  const courseName = sheet.course?.code           || ''
  const schoolName = sheet.course?.school?.short  || ''
  const authorName = sheet.author?.username       || 'unknown'
  const timeAgo    = fmtTime(sheet.createdAt)

  async function handleStar(e) {
    e.preventDefault(); e.stopPropagation()
    if (starring || !getToken()) return
    setStarring(true)
    // optimistic update
    setHasStarred(v => !v)
    setLocalStars(n => n + (hasStarred ? -1 : 1))
    try {
      const res = await fetch(`${API}/api/sheets/${sheet.id}/star`, {
        method: 'POST', headers: authHeaders(),
      })
      if (res.ok) {
        const d = await res.json()
        setLocalStars(d.stars)
      }
    } catch { /* keep optimistic */ }
    finally { setStarring(false) }
  }

  function trackDownload() {
    // fire-and-forget — don't block navigation
    fetch(`${API}/api/sheets/${sheet.id}/download`, { method: 'POST' }).catch(() => {})
  }

  return (
    <Link to={`/sheets/${sheet.id}`} onClick={trackDownload} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
        boxShadow: '0 2px 10px rgba(15,23,42,0.04)',
        padding: '18px 20px', marginBottom: 12,
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 22px rgba(15,23,42,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(15,23,42,0.04)'; e.currentTarget.style.transform = 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          {/* icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: '#eff6ff',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fa-solid fa-file-lines" style={{ color: '#3b82f6', fontSize: 20 }} />
          </div>

          {/* info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{sheet.title}</span>
              {courseName && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', flexShrink: 0,
                }}>{courseName}</span>
              )}
              {sheet.forkOf && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', flexShrink: 0,
                }}>
                  <i className="fa-solid fa-code-fork" style={{ marginRight: 3, fontSize: 10 }} />forked
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              by <span style={{ color: '#64748b', fontWeight: 600 }}>{authorName}</span>
              {schoolName && <>&nbsp;·&nbsp;<span>{schoolName}</span></>}
              &nbsp;·&nbsp;{timeAgo}
            </div>
          </div>

          {/* stats + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { icon: hasStarred ? 'fa-solid fa-star' : 'fa-regular fa-star', val: localStars,        color: hasStarred ? '#f59e0b' : '#94a3b8' },
                { icon: 'fa-solid fa-code-fork',                                val: sheet.forks || 0,   color: '#94a3b8' },
                { icon: 'fa-solid fa-download',                                 val: sheet.downloads || 0, color: '#94a3b8' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: s.color, fontWeight: 500 }}>
                  <i className={s.icon} style={{ fontSize: 12 }} />{s.val}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleStar} disabled={starring || !getToken()}
                title={!getToken() ? 'Log in to star' : (hasStarred ? 'Unstar' : 'Star')}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid',
                  borderColor: hasStarred ? '#fde68a' : '#e2e8f0',
                  background:  hasStarred ? '#fef9ec' : '#fff',
                  color:       hasStarred ? '#92400e' : '#64748b',
                  fontSize: 12, fontWeight: 600, cursor: starring ? 'wait' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                  opacity: !getToken() ? 0.5 : 1,
                }}>
                <i className={hasStarred ? 'fa-solid fa-star' : 'fa-regular fa-star'} style={{ marginRight: 4 }} />
                {hasStarred ? 'Starred' : 'Star'}
              </button>
              <span style={{
                padding: '6px 12px', borderRadius: 8,
                background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600,
              }}>View →</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── main page ────────────────────────────────────────────────────
const PAGE_SIZE = 10

export default function SheetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [search,   setSearch]   = useState(searchParams.get('q')      || '')
  const [schoolId, setSchoolId] = useState(searchParams.get('school') || '')
  const [courseId, setCourseId] = useState(searchParams.get('course') || '')
  const [sort,     setSort]     = useState(searchParams.get('sort')   || 'newest')
  const [page,     setPage]     = useState(parseInt(searchParams.get('page') || '0'))

  const [sheets,  setSheets]  = useState([])
  const [total,   setTotal]   = useState(0)
  const [schools, setSchools] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const debounce = useRef(null)

  // load schools once
  useEffect(() => {
    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setSchools(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // update course list when school changes
  useEffect(() => {
    if (!schoolId) { setCourses([]); setCourseId(''); return }
    const s = schools.find(s => String(s.id) === schoolId)
    if (s?.courses) setCourses(s.courses)
  }, [schoolId, schools])

  // fetch sheets
  const fetchSheets = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams()
      if (search)            p.set('search',   search)
      if (schoolId)          p.set('schoolId', schoolId)
      if (courseId)          p.set('courseId', courseId)
      // pass sort to the backend so ordering applies across all pages, not just the current one
      if (sort !== 'newest') p.set('orderBy',  sort)
      p.set('limit',  PAGE_SIZE)
      p.set('offset', page * PAGE_SIZE)

      const res = await fetch(`${API}/api/sheets?${p}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`${res.status} — ${res.statusText}`)
      const data = await res.json()

      const list = data.sheets || []

      setSheets(list)
      setTotal(data.total || list.length)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, schoolId, courseId, sort, page])

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(fetchSheets, search ? 350 : 0)
    return () => clearTimeout(debounce.current)
  }, [fetchSheets])

  // sync state → URL
  useEffect(() => {
    const p = {}
    if (search)            p.q      = search
    if (schoolId)          p.school = schoolId
    if (courseId)          p.course = courseId
    if (sort !== 'newest') p.sort   = sort
    if (page > 0)          p.page   = page
    setSearchParams(p, { replace: true })
  }, [search, schoolId, courseId, sort, page, setSearchParams])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px' }}>

        {/* header */}
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            <i className="fa-solid fa-file-lines" style={{ color: '#3b82f6', marginRight: 10 }} />
            Study Sheets
          </h1>
          <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
            Browse, star, and fork study sheets from students across your school.
            {total > 0 && !loading && (
              <span style={{ color: '#3b82f6', fontWeight: 600 }}> {total} sheet{total !== 1 ? 's' : ''} available.</span>
            )}
          </p>
        </div>

        {/* filter bar */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #e8ecf0',
          padding: '14px 16px', marginBottom: 18,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          boxShadow: '0 2px 10px rgba(15,23,42,0.04)',
        }}>
          {/* search */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <i className="fa-solid fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search sheets…"
              style={{
                width: '100%', padding: '9px 32px 9px 34px',
                border: '1px solid #e2e8f0', borderRadius: 9,
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                color: '#1e293b', boxSizing: 'border-box', background: '#fafbfc',
              }}
              onFocus={e => e.target.style.borderColor = '#93c5fd'}
              onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(0) }} style={{
                position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16,
              }}>×</button>
            )}
          </div>

          {/* school */}
          <select value={schoolId} onChange={e => { setSchoolId(e.target.value); setCourseId(''); setPage(0) }} style={SEL}>
            <option value="">All Schools</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* course — only when school selected */}
          {schoolId && (
            <select value={courseId} onChange={e => { setCourseId(e.target.value); setPage(0) }} style={SEL}>
              <option value="">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          )}

          {/* sort */}
          <select value={sort} onChange={e => setSort(e.target.value)} style={SEL}>
            <option value="newest">Newest first</option>
            <option value="stars">Most starred</option>
            <option value="downloads">Most downloaded</option>
          </select>

          {/* clear */}
          {(search || schoolId || courseId || sort !== 'newest') && (
            <button onClick={() => { setSearch(''); setSchoolId(''); setCourseId(''); setSort('newest'); setPage(0) }} style={{
              padding: '7px 12px', border: '1px solid #fecaca', borderRadius: 9,
              background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear</button>
          )}
        </div>

        {/* error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 10,
          }}>
            <i className="fa-solid fa-circle-exclamation" style={{ color: '#dc2626', marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 14 }}>Could not load sheets</div>
              <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 2 }}>
                {error} — make sure the backend is running on port 4000.
              </div>
              <button onClick={fetchSheets} style={{
                marginTop: 8, padding: '5px 12px', background: '#dc2626',
                border: 'none', borderRadius: 7, color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>Retry</button>
            </div>
          </div>
        )}

        {/* results count */}
        {!loading && !error && (
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {total > 0
                ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`
                : 'No results'}
            </span>
            {totalPages > 1 && <span>Page {page + 1} of {totalPages}</span>}
          </div>
        )}

        {/* skeletons */}
        {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}

        {/* cards */}
        {!loading && !error && sheets.map(s => <SheetCard key={s.id} sheet={s} />)}

        {/* empty */}
        {!loading && !error && sheets.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: '#fff', borderRadius: 16, border: '1.5px dashed #cbd5e1',
          }}>
            <i className="fa-solid fa-file-circle-question" style={{ fontSize: 44, color: '#cbd5e1', display: 'block', marginBottom: 14 }} />
            <div style={{ fontWeight: 800, fontSize: 17, color: '#64748b', marginBottom: 6 }}>
              {search || courseId ? 'No sheets match your filters' : 'No sheets yet'}
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
              {search ? `No results for "${search}"` : 'Be the first to upload one!'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {(search || courseId || schoolId) && (
                <button onClick={() => { setSearch(''); setSchoolId(''); setCourseId('') }} style={{
                  padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 9,
                  background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Clear filters</button>
              )}
              <Link to="/sheets/upload" style={{
                padding: '9px 24px', background: '#3b82f6', color: '#fff',
                borderRadius: 9, textDecoration: 'none', fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className="fa-solid fa-upload" style={{ fontSize: 12 }} />Upload a Sheet
              </Link>
            </div>
          </div>
        )}

        {/* pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pageBtn(false, page === 0)}>
              <i className="fa-solid fa-chevron-left" style={{ fontSize: 11 }} />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              if (i !== 0 && i !== totalPages - 1 && Math.abs(i - page) > 2) {
                if (i === 1 || i === totalPages - 2) return <span key={i} style={{ padding: '0 4px', color: '#94a3b8', alignSelf: 'center' }}>…</span>
                return null
              }
              return <button key={i} onClick={() => setPage(i)} style={pageBtn(i === page, false)}>{i + 1}</button>
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pageBtn(false, page >= totalPages - 1)}>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 11 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── style helpers ────────────────────────────────────────────────
const SEL = {
  padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: '#475569', background: '#fafbfc', outline: 'none', cursor: 'pointer',
}

function pageBtn(active, disabled) {
  return {
    minWidth: 36, height: 36, borderRadius: 8, border: '1px solid',
    borderColor: active ? '#3b82f6' : '#e2e8f0',
    background:  active ? '#3b82f6' : '#fff',
    color:       active ? '#fff' : disabled ? '#cbd5e1' : '#64748b',
    fontWeight:  active ? 700 : 500, fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    opacity: disabled ? 0.5 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  }
}

function fmtTime(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

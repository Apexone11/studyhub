// src/pages/SheetsPage.jsx  — PATCH v2
// Changes: 2-col layout, filter sidebar, rich cards with course colors, custom icons

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import {
  IconSearch, IconStar, IconStarFilled, IconFork,
  IconDownload, IconUpload,
} from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'

import { API } from '../config'
const LIMIT  = 10
const FONT   = "'Plus Jakarta Sans', system-ui, sans-serif"
const getToken    = () => localStorage.getItem('token')
const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
})

// course prefix → accent color
const COLORS = {
  CMSC: { a:'#8b5cf6', bg:'#ede9fe', tx:'#5b21b6', bd:'#c4b5fd' },
  MATH: { a:'#10b981', bg:'#d1fae5', tx:'#065f46', bd:'#6ee7b7' },
  ENGL: { a:'#f59e0b', bg:'#fef3c7', tx:'#78350f', bd:'#fcd34d' },
  PHYS: { a:'#0ea5e9', bg:'#e0f2fe', tx:'#0c4a6e', bd:'#7dd3fc' },
  BIOL: { a:'#ec4899', bg:'#fce7f3', tx:'#831843', bd:'#f9a8d4' },
  HIST: { a:'#6366f1', bg:'#e0e7ff', tx:'#312e81', bd:'#a5b4fc' },
  ECON: { a:'#14b8a6', bg:'#ccfbf1', tx:'#134e4a', bd:'#5eead4' },
  CHEM: { a:'#f97316', bg:'#ffedd5', tx:'#7c2d12', bd:'#fdba74' },
}
const DEF = { a:'#3b82f6', bg:'#eff6ff', tx:'#1e40af', bd:'#bfdbfe' }
function color(code='') { return COLORS[code.replace(/\d.*/,'').toUpperCase()] || DEF }

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000
  if (s<60) return 'just now'
  if (s<3600) return `${Math.floor(s/60)}m ago`
  if (s<86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

// — Skeleton —————————————————————————————————————————————————
function SkeletonCard() {
  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'16px 18px', marginBottom:9, animation:'shimmer 1.4s ease-in-out infinite' }}>
      <div style={{ display:'flex', gap:10, marginBottom:10 }}>
        <div style={{ width:38, height:38, borderRadius:9, background:'#f1f5f9', flexShrink:0 }}/>
        <div style={{ flex:1 }}>
          <div style={{ height:14, background:'#f1f5f9', borderRadius:5, width:'65%', marginBottom:7 }}/>
          <div style={{ height:11, background:'#f1f5f9', borderRadius:5, width:'40%' }}/>
        </div>
      </div>
      <div style={{ height:11, background:'#f1f5f9', borderRadius:5, marginBottom:6 }}/>
      <div style={{ height:11, background:'#f1f5f9', borderRadius:5, width:'75%' }}/>
    </div>
  )
}

// — Sheet Card ————————————————————————————————————————————————
function SheetCard({ sheet, onStar }) {
  const c      = color(sheet.course?.code)
  const code   = sheet.course?.code || ''
  const school = sheet.course?.school?.short || sheet.course?.school?.name || ''
  const author = sheet.author?.username || 'unknown'
  const preview = sheet.content
    ? sheet.content.replace(/[#*`>_~[\]()]/g,'').replace(/\n/g,' ').trim().slice(0,140)+'…'
    : null
  const tags   = [...new Set(sheet.content?.match(/#\w+/g) || [])].slice(0,3)

  return (
    <div
      style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', borderLeft:`3px solid ${c.a}`, marginBottom:9, overflow:'hidden', transition:'box-shadow .18s' }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(15,23,42,0.08)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
    >
      <div style={{ padding:'14px 18px 14px 16px' }}>
        {/* header */}
        <div style={{ display:'flex', gap:10, marginBottom:8, alignItems:'flex-start' }}>
          <div style={{ width:38, height:38, borderRadius:9, background:c.bg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c.a} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap', marginBottom:3 }}>
              <Link to={`/sheets/${sheet.id}`} style={{ fontSize:14, fontWeight:700, color:'#0f172a', textDecoration:'none', lineHeight:1.3 }}
                onMouseEnter={e=>e.currentTarget.style.color='#3b82f6'}
                onMouseLeave={e=>e.currentTarget.style.color='#0f172a'}
              >{sheet.title}</Link>
              {code && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:c.bg, color:c.tx, border:`1px solid ${c.bd}`, whiteSpace:'nowrap' }}>{code}</span>}
              {sheet.forkOf && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, background:'#f0fdf4', color:'#166534', border:'1px solid #bbf7d0', display:'flex', alignItems:'center', gap:3 }}>
                  <IconFork size={9}/>forked
                </span>
              )}
            </div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>
              by <strong style={{ color:'#64748b' }}>{author}</strong>
              {school && <> · {school}</>}
              {' · '}{timeAgo(sheet.createdAt)}
            </div>
          </div>
        </div>

        {preview && (
          <p style={{ fontSize:12, color:'#64748b', lineHeight:1.65, margin:'0 0 8px', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {preview}
          </p>
        )}

        {tags.length>0 && (
          <div style={{ display:'flex', gap:5, marginBottom:10, flexWrap:'wrap' }}>
            {tags.map(t=><span key={t} style={{ fontSize:10, color:'#64748b', background:'#f1f5f9', padding:'2px 8px', borderRadius:99 }}>{t}</span>)}
          </div>
        )}

        {/* stats + actions */}
        <div style={{ display:'flex', alignItems:'center', gap:12, paddingTop:10, borderTop:'1px solid #f8fafc' }}>
          <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'#94a3b8' }}><IconStar size={12}/>{sheet.stars||0}</div>
          <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'#94a3b8' }}><IconFork size={12}/>{sheet.forks||0}</div>
          <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'#94a3b8' }}><IconDownload size={12}/>{sheet.downloads||0}</div>
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            <button onClick={()=>onStar(sheet.id)} style={{
              display:'flex', alignItems:'center', gap:4, padding:'5px 11px',
              border:'1px solid #e2e8f0', borderRadius:7,
              background: sheet.starred?'#fef9ec':'#fff',
              color: sheet.starred?'#92400e':'#64748b',
              fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT, transition:'all .15s',
            }}>
              {sheet.starred ? <IconStarFilled size={12} style={{ color:'#f59e0b' }}/> : <IconStar size={12}/>}
              {sheet.starred ? 'Starred' : 'Star'}
            </button>
            <Link to={`/sheets/${sheet.id}`} style={{
              display:'flex', alignItems:'center', gap:4, padding:'5px 14px',
              border:'none', borderRadius:7, background:'#3b82f6',
              color:'#fff', fontSize:11, fontWeight:700, textDecoration:'none',
            }}>View →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// — Filter Sidebar ————————————————————————————————————————————
function Sidebar({ schools, courses, filters, onChange }) {
  const activeColor = (active) => ({
    display:'flex', alignItems:'center', gap:7, width:'100%', textAlign:'left',
    padding:'6px 12px', border:'none',
    borderLeft:`2px solid ${active?'#3b82f6':'transparent'}`,
    background: active?'#eff6ff':'transparent',
    color: active?'#1d4ed8':'#64748b',
    fontSize:12, fontWeight: active?600:400,
    cursor:'pointer', fontFamily:FONT, transition:'all .15s',
  })
  const sectionLbl = (label) => (
    <div style={{ fontSize:9, letterSpacing:'.1em', fontWeight:600, color:'#94a3b8', padding:'12px 14px 5px', textTransform:'uppercase' }}>{label}</div>
  )
  const visibleCourses = filters.schoolId
    ? courses.filter(c=>String(c.schoolId)===String(filters.schoolId))
    : courses

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* school */}
      <div style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        {sectionLbl('School')}
        <button style={activeColor(!filters.schoolId)} onClick={()=>onChange({ schoolId:null, courseId:null })}>All Schools</button>
        {schools.map(s=>(
          <button key={s.id} style={activeColor(String(filters.schoolId)===String(s.id))} onClick={()=>onChange({ schoolId:s.id, courseId:null })}>
            {s.short||s.name}
          </button>
        ))}
      </div>
      {/* course */}
      <div style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        {sectionLbl('Course')}
        <button style={activeColor(!filters.courseId)} onClick={()=>onChange({ courseId:null })}>All Courses</button>
        {visibleCourses.slice(0,20).map(c=>{
          const col=color(c.code)
          return (
            <button key={c.id} style={activeColor(String(filters.courseId)===String(c.id))} onClick={()=>onChange({ courseId:c.id })}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:String(filters.courseId)===String(c.id)?'#3b82f6':col.a, flexShrink:0 }}/>
              {c.code}
            </button>
          )
        })}
      </div>
      {/* sort */}
      <div style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        {sectionLbl('Sort By')}
        {[['newest','Newest first'],['stars','Most stars'],['downloads','Most downloads']].map(([val,label])=>(
          <button key={val} style={activeColor(filters.sortBy===val)} onClick={()=>onChange({ sortBy:val })}>{label}</button>
        ))}
      </div>
    </div>
  )
}

// — Main Page —————————————————————————————————————————————————
export default function SheetsPage() {
  const navigate  = useNavigate()
  const [sp,setSp]= useSearchParams()

  // 'all' | 'mine' | 'starred'  — stays in sync with URL params
  const viewFromUrl = sp.get('mine') === '1' ? 'mine' : sp.get('starred') === '1' ? 'starred' : 'all'
  const [view,    setView]    = useState(viewFromUrl)

  // Sync view when URL params change (e.g. Navbar tab clicks)
  useEffect(() => {
    const v = sp.get('mine') === '1' ? 'mine' : sp.get('starred') === '1' ? 'starred' : 'all'
    setView(v)
  }, [sp])
  const [filters, setFilters] = useState({
    search:   sp.get('q')        || '',
    schoolId: sp.get('schoolId') || null,
    courseId: sp.get('courseId') || null,
    sortBy:   sp.get('sort')     || 'newest',
  })
  const [sheets,  setSheets]  = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [schools, setSchools] = useState([])
  const [courses, setCourses] = useState([])
  const searchTimer = useRef()

  useEffect(()=>{
    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then(r=>r.json())
      .then(data=>{
        setSchools(data||[])
        setCourses((data||[]).flatMap(s=>(s.courses||[]).map(c=>({ ...c, schoolId:s.id }))))
      }).catch(()=>{})
  },[])

  const fetchSheets = useCallback((f,pg,v)=>{
    setLoading(true); setError(null)
    const p=new URLSearchParams({ limit:LIMIT, offset:(pg-1)*LIMIT,
      ...(f.search&&{search:f.search}),
      ...(f.schoolId&&{schoolId:f.schoolId}),
      ...(f.courseId&&{courseId:f.courseId}),
      ...(v==='mine'    && {mine:'1'}),
      ...(v==='starred' && {starred:'1'}),
    })
    fetch(`${API}/api/sheets?${p}`,{ headers:authHeaders() })
      .then(r=>{ if(!r.ok) throw new Error(r.status); return r.json() })
      .then(d=>{
        let list=d.sheets||d||[]
        if(f.sortBy==='stars')     list=[...list].sort((a,b)=>(b.stars||0)-(a.stars||0))
        if(f.sortBy==='downloads') list=[...list].sort((a,b)=>(b.downloads||0)-(a.downloads||0))
        setSheets(list); setTotal(d.total||list.length)
      })
      .catch(err=>setError(err.message))
      .finally(()=>setLoading(false))
  },[])

  useEffect(()=>{
    const timer = setTimeout(()=>{ fetchSheets(filters,page,view) }, 0)
    return ()=>clearTimeout(timer)
  },[filters,page,view,fetchSheets])

  useEffect(()=>{
    const p=new URLSearchParams()
    if(filters.search)   p.set('q',filters.search)
    if(filters.schoolId) p.set('schoolId',filters.schoolId)
    if(filters.courseId) p.set('courseId',filters.courseId)
    if(filters.sortBy!=='newest') p.set('sort',filters.sortBy)
    if(view==='mine')    p.set('mine','1')
    if(view==='starred') p.set('starred','1')
    setSp(p,{replace:true})
  },[filters,view,setSp])

  const update=(patch)=>{ setFilters(f=>({...f,...patch})); setPage(1) }
  const switchView=(v)=>{ setView(v); setPage(1) }

  const handleStar=async(id)=>{
    if(!getToken()){ navigate('/login'); return }
    setSheets(prev=>prev.map(s=>s.id===id
      ? { ...s, starred:!s.starred, stars:(s.stars||0)+(s.starred?-1:1) }
      : s
    ))
    fetch(`${API}/api/sheets/${id}/star`,{ method:'POST', headers:authHeaders() })
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d) setSheets(prev=>prev.map(s=>s.id===id?{...s,stars:d.stars}:s)) })
      .catch(()=>{})
  }

  const totalPages=Math.ceil(total/LIMIT)

  const navActions=(
    <div style={{ display:'flex', gap:7, alignItems:'center' }}>
      <Link to="/feed" style={{ fontSize:12, color:'#64748b', textDecoration:'none', padding:'5px 10px', border:'1px solid #334155', borderRadius:7 }}>← Feed</Link>
      <Link to="/sheets/upload" style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'5px 13px', background:'#3b82f6', borderRadius:7, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
        <IconUpload size={13}/>Upload Sheet
      </Link>
    </div>
  )

  const pBtn=(disabled)=>({
    padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:7,
    background:'#fff', color:disabled?'#cbd5e1':'#64748b',
    fontSize:12, cursor:disabled?'default':'pointer', fontFamily:FONT,
  })

  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.45}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <Navbar actions={navActions}/>
      <div style={pageShell('app')}>
        <div style={{ display:'grid', gridTemplateColumns:pageColumns.appTwoColumn, gap:20, alignItems:'start' }}>
          {/* sidebar */}
          <div style={{ position:'sticky', top:74 }}>
            <Sidebar schools={schools} courses={courses} filters={filters} onChange={update}/>
          </div>
          {/* main */}
          <main style={{ animation:'fadeIn .3s ease-out' }}>
            {/* view tabs */}
            <div style={{ display:'flex', gap:2, marginBottom:14, background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:4, width:'fit-content' }}>
              {[['all','Browse All'],['mine','My Sheets'],['starred','Starred']].map(([v,label])=>(
                <button key={v} onClick={()=>switchView(v)} style={{
                  padding:'6px 18px', borderRadius:9, border:'none',
                  background: view===v ? '#3b82f6' : 'transparent',
                  color: view===v ? '#fff' : '#64748b',
                  fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:FONT, transition:'all .15s',
                }}>{label}</button>
              ))}
            </div>
            {/* search */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10, padding:'0 16px', minHeight:48, marginBottom:14 }}>
              <IconSearch size={15} style={{ color:'#94a3b8', flexShrink:0 }}/>
              <input defaultValue={filters.search} placeholder="Search sheets by title, content or author…"
                onChange={e=>{ clearTimeout(searchTimer.current); searchTimer.current=setTimeout(()=>update({search:e.target.value}),350) }}
                style={{ flex:1, border:'none', outline:'none', fontSize:14, color:'#334155', fontFamily:FONT, background:'transparent' }}
              />
            </div>
            {/* count */}
            {!loading&&!error&&(
              <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10 }}>
                {total===0?'No sheets found':`Showing ${(page-1)*LIMIT+1}–${Math.min(page*LIMIT,total)} of ${total} sheet${total!==1?'s':''}`}
                {(filters.courseId||filters.schoolId)&&(
                  <button onClick={()=>update({schoolId:null,courseId:null})} style={{ marginLeft:10, fontSize:11, color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontFamily:FONT }}>Clear filters ×</button>
                )}
              </div>
            )}
            {/* error */}
            {error&&(
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:13, padding:'20px', textAlign:'center' }}>
                <div style={{ fontWeight:700, color:'#dc2626', marginBottom:8 }}>Failed to load sheets</div>
                <button onClick={()=>fetchSheets(filters,page)} style={{ padding:'7px 18px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontFamily:FONT, fontWeight:600 }}>Retry</button>
              </div>
            )}
            {/* skeletons */}
            {loading&&Array.from({length:5}).map((_,i)=><SkeletonCard key={i}/>)}
            {/* cards */}
            {!loading&&!error&&sheets.map(s=><SheetCard key={s.id} sheet={s} onStar={handleStar}/>)}
            {/* empty */}
            {!loading&&!error&&sheets.length===0&&(
              <div style={{ background:'#fff', borderRadius:16, border:'1.5px dashed #cbd5e1', padding:'56px 28px', minHeight:320, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12, color:'#cbd5e1' }}><i className="fas fa-file-lines"></i></div>
                <div style={{ fontWeight:700, fontSize:18, color:'#64748b', marginBottom:8 }}>
                  {view==='mine'?'No sheets yet':view==='starred'?'No starred sheets yet':'No sheets yet'}
                </div>
                <div style={{ fontSize:14, color:'#94a3b8', marginBottom:22 }}>
                  {filters.search?`No results for "${filters.search}"`:
                   view==='mine'?'Upload your first sheet!':
                   view==='starred'?'Star sheets you want to save and they\'ll appear here.':
                   'Be the first to upload!'}
                </div>
                <Link to="/sheets/upload" style={{ padding:'8px 20px', background:'#3b82f6', color:'#fff', borderRadius:8, textDecoration:'none', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}>
                  <IconUpload size={13}/>Upload first sheet
                </Link>
              </div>
            )}
            {/* pagination */}
            {!loading&&totalPages>1&&(
              <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:20 }}>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={pBtn(page===1)}>←</button>
                {Array.from({length:totalPages}).map((_,i)=>(
                  <button key={i} onClick={()=>setPage(i+1)} style={{ ...pBtn(false), ...(page===i+1?{background:'#3b82f6',color:'#fff',border:'none'}:{}) }}>{i+1}</button>
                ))}
                <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={pBtn(page===totalPages)}>→</button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

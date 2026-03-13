// src/pages/PlaceholderPages.jsx — PATCH v2
// UploadSheetPage: split-pane editor + live preview, real API
// TestsPage / NotesPage / AnnouncementsPage: sidebar layout + teasers
// SubmitPage / AdminPage / TestTakerPage: cleaned shells

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { IconUpload, IconEye, IconPlus, IconCheck } from '../components/Icons'

const API  = 'http://localhost:4000'
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const getToken    = () => localStorage.getItem('token')
const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
})

function timeAgo(d) {
  const s=(Date.now()-new Date(d))/1000
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

// — shared 2-col shell —————————————————————————————————————————
function PageShell({ nav, sidebar, children }) {
  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      {nav}
      <div style={{ maxWidth:1140, margin:'0 auto', padding:'24px 20px 60px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16, alignItems:'start' }}>
          <div style={{ position:'sticky', top:62 }}>{sidebar}</div>
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}

// — sidebar nav card ———————————————————————————————————————————
function SideCard({ sections }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {sections.map((sec,si)=>(
        <div key={si} style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          {sec.label && <div style={{ fontSize:9, letterSpacing:'.1em', fontWeight:600, color:'#94a3b8', padding:'12px 14px 5px', textTransform:'uppercase' }}>{sec.label}</div>}
          {sec.items.map((item,ii)=>(
            <div key={ii} style={{
              display:'flex', alignItems:'center', gap:7, padding:'7px 12px',
              borderLeft:`2px solid ${item.active?'#3b82f6':'transparent'}`,
              background: item.active?'#eff6ff':'transparent',
              color: item.active?'#1d4ed8':'#64748b',
              fontSize:12, fontWeight:item.active?600:400,
            }}>
              {item.dot && <span style={{ width:8, height:8, borderRadius:'50%', background:item.active?'#3b82f6':item.dot, flexShrink:0 }}/>}
              {item.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// — locked teaser card —————————————————————————————————————————
function TeaserCard({ title, sub, chips=[] }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'14px 16px', marginBottom:9, position:'relative', overflow:'hidden' }}>
      <span style={{ position:'absolute', top:0, right:0, background:'#f1f5f9', fontSize:9, fontWeight:600, color:'#64748b', padding:'3px 10px', borderRadius:'0 0 0 8px' }}>Coming V1</span>
      <div style={{ fontSize:14, fontWeight:700, color:'#334155', marginBottom:5, paddingRight:64 }}>{title}</div>
      <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.55, marginBottom:8 }}>{sub}</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {chips.map((ch,i)=>(
          <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:ch.bg||'#f1f5f9', color:ch.color||'#64748b', border:ch.border?`1px solid ${ch.border}`:'none' }}>{ch.label}</span>
        ))}
      </div>
      <div style={{ height:4, background:'#f1f5f9', borderRadius:99, marginTop:10 }}/>
    </div>
  )
}

// — mini markdown preview ——————————————————————————————————————
function MiniPreview({ md }) {
  if (!md) return <div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>Start typing to see a live preview…</div>
  const esc    = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const inline = s => esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code style="background:#f1f5f9;border-radius:4px;padding:1px 5px;font-size:.88em;color:#be185d;font-family:monospace">$1</code>')
  const lines = md.split('\n')
  const nodes = []; let i=0
  while (i < lines.length) {
    const line=lines[i]
    const hm=line.match(/^(#{1,4})\s+(.+)/)
    if (hm) {
      const lvl=hm[1].length; const sz=[20,16,14,13][lvl-1]
      nodes.push(<div key={i} style={{ fontSize:sz, fontWeight:700, color:'#0f172a', margin:lvl===1?'0 0 10px':'8px 0 4px', borderBottom:lvl<=2?'1px solid #f1f5f9':'none', paddingBottom:lvl<=2?5:0 }} dangerouslySetInnerHTML={{ __html:inline(hm[2]) }}/>)
      i++; continue
    }
    if (line.match(/^```/)) {
      const lang=line.slice(3).trim(); let code=''; i++
      while(i<lines.length&&!lines[i].match(/^```/)){code+=esc(lines[i])+'\n';i++}
      nodes.push(<div key={i} style={{ background:'#0f172a', borderRadius:9, padding:'12px 14px', marginBottom:10 }}>
        {lang&&<div style={{ fontSize:9, color:'#64748b', letterSpacing:'.08em', marginBottom:6 }}>{lang.toUpperCase()}</div>}
        <pre style={{ margin:0, fontFamily:'monospace', fontSize:11, color:'#e2e8f0', lineHeight:1.7, overflowX:'auto' }}>{code}</pre>
      </div>); i++; continue
    }
    if (line.startsWith('> ')) {
      nodes.push(<div key={i} style={{ borderLeft:'3px solid #3b82f6', background:'#eff6ff', padding:'8px 12px', borderRadius:'0 8px 8px 0', marginBottom:8 }}>
        <div style={{ fontSize:12, color:'#1e40af', fontStyle:'italic' }} dangerouslySetInnerHTML={{ __html:inline(line.slice(2)) }}/>
      </div>); i++; continue
    }
    if (line.match(/^[-*+]\s/)) {
      const items=[]; while(i<lines.length&&lines[i].match(/^[-*+]\s/)){items.push(lines[i].slice(2));i++}
      nodes.push(<ul key={`ul${i}`} style={{ margin:'0 0 8px 18px', padding:0 }}>
        {items.map((it,j)=><li key={j} style={{ fontSize:12, color:'#334155', lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html:inline(it) }}/>)}
      </ul>); continue
    }
    if (line.trim()===''){nodes.push(<div key={i} style={{ height:8 }}/>);i++;continue}
    nodes.push(<p key={i} style={{ fontSize:12, color:'#334155', lineHeight:1.7, margin:'0 0 6px' }} dangerouslySetInnerHTML={{ __html:inline(line) }}/>)
    i++
  }
  return <>{nodes}</>
}

// ─────────────────────────────────────────────────────────────────
// UPLOAD SHEET PAGE
// ─────────────────────────────────────────────────────────────────
export function UploadSheetPage() {
  const navigate=useNavigate()
  const [title,   setTitle]   = useState('')
  const [courseId,setCourseId]= useState('')
  const [content, setContent] = useState('# Sheet Title\n\n## Topic 1\n\nYour notes here…\n\n## Topic 2\n\n- Point one\n- Point two\n- Point three\n\n```java\n// Code example\npublic class Hello {\n  public static void main(String[] args) {\n    System.out.println("Hello!");\n  }\n}\n```\n')
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const autoTimer = useRef()

  useEffect(()=>{
    fetch(`${API}/api/courses/schools`,{headers:authHeaders()})
      .then(r=>r.json())
      .then(data=>setCourses((data||[]).flatMap(s=>(s.courses||[]).map(c=>({...c,schoolName:s.name})))))
      .catch(()=>{})
  },[])

  useEffect(()=>{
    setSaved(false); clearTimeout(autoTimer.current)
    autoTimer.current=setTimeout(()=>setSaved(true),1500)
    return ()=>clearTimeout(autoTimer.current)
  },[title,content,courseId])

  async function handlePublish() {
    if(!title.trim()){setError('Please enter a title.');return}
    if(!courseId){setError('Please select a course.');return}
    if(!content.trim()){setError('Content cannot be empty.');return}
    setLoading(true);setError('')
    try {
      const res=await fetch(`${API}/api/sheets`,{
        method:'POST',headers:authHeaders(),
        body:JSON.stringify({title:title.trim(),courseId:parseInt(courseId),content}),
      })
      if(!res.ok) throw new Error((await res.json()).error||'Failed to publish.')
      const sheet=await res.json()
      navigate(`/sheets/${sheet.id}`)
    } catch(err){setError(err.message);setLoading(false)}
  }

  const navActions=(
    <div style={{ display:'flex', gap:7, alignItems:'center' }}>
      {saved&&<span style={{ fontSize:11, color:'#10b981', display:'flex', alignItems:'center', gap:4 }}><IconCheck size={12}/>Saved</span>}
      {!saved&&<span style={{ fontSize:11, color:'#64748b' }}>Saving…</span>}
      <Link to="/sheets" style={{ fontSize:12, color:'#64748b', textDecoration:'none', padding:'5px 10px', border:'1px solid #334155', borderRadius:7 }}>Cancel</Link>
      <button onClick={handlePublish} disabled={loading} style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'5px 15px', background:loading?'#93c5fd':'#3b82f6', border:'none', borderRadius:7, cursor:loading?'wait':'pointer', fontFamily:FONT, display:'flex', alignItems:'center', gap:5 }}>
        {loading?'Publishing…':<><IconUpload size={13}/>Publish Sheet</>}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Study Sheets',to:'/sheets'},{label:'New Sheet',to:null}]} hideTabs actions={navActions} hideSearch/>
      <div style={{ maxWidth:1140, margin:'0 auto', padding:'20px 20px 60px' }}>
        {/* meta row */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'14px 20px', marginBottom:12, display:'grid', gridTemplateColumns:'1fr 1fr 180px', gap:12, alignItems:'end' }}>
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.06em', display:'block', marginBottom:5 }}>SHEET TITLE</label>
            <input value={title} onChange={e=>{setTitle(e.target.value);setError('')}} placeholder='e.g. "CMSC131 Final Exam Cheatsheet"'
              style={{ width:'100%', padding:'8px 12px', border:`1.5px solid ${error&&!title.trim()?'#fca5a5':'#e2e8f0'}`, borderRadius:8, fontSize:13, fontFamily:FONT, outline:'none', color:'#0f172a', boxSizing:'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.06em', display:'block', marginBottom:5 }}>COURSE</label>
            <select value={courseId} onChange={e=>{setCourseId(e.target.value);setError('')}}
              style={{ width:'100%', padding:'8px 12px', border:`1.5px solid ${error&&!courseId?'#fca5a5':'#e2e8f0'}`, borderRadius:8, fontSize:13, fontFamily:FONT, outline:'none', color:courseId?'#0f172a':'#94a3b8', boxSizing:'border-box' }}
            >
              <option value="">Select a course…</option>
              {courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.06em', display:'block', marginBottom:5 }}>VISIBILITY</label>
            <div style={{ padding:'8px 12px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, color:'#64748b', background:'#f8fafc' }}>Public</div>
          </div>
        </div>
        {error&&<div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:9, padding:'10px 14px', marginBottom:10, fontSize:13, color:'#dc2626' }}>{error}</div>}
        {/* split pane */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid #e2e8f0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 16px', borderRight:'1px solid #e2e8f0' }}>
              <IconUpload size={13} style={{ color:'#3b82f6' }}/><span style={{ fontSize:12, fontWeight:600, color:'#3b82f6' }}>Markdown Editor</span>
              <span style={{ fontSize:10, color:'#94a3b8' }}>· {content.length} chars</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 16px' }}>
              <IconEye size={13} style={{ color:'#64748b' }}/><span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>Live Preview</span>
              <span style={{ fontSize:10, color:'#10b981' }}>✓ synced</span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:460 }}>
            <div style={{ borderRight:'1px solid #1e293b', background:'#0f172a' }}>
              <textarea value={content} onChange={e=>setContent(e.target.value)} spellCheck={false}
                style={{ width:'100%', height:'100%', minHeight:460, background:'transparent', border:'none', outline:'none', resize:'none', padding:'16px 18px', fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:12.5, lineHeight:1.9, color:'#e2e8f0', boxSizing:'border-box' }}
              />
            </div>
            <div style={{ padding:'16px 20px', overflowY:'auto', maxHeight:600 }}>
              <MiniPreview md={content}/>
            </div>
          </div>
          <div style={{ background:'#f8fafc', borderTop:'1px solid #f1f5f9', padding:'8px 16px', display:'flex', gap:14, flexWrap:'wrap' }}>
            {[['# H1','Heading'],['**bold**','Bold'],['*italic*','Italic'],['`code`','Code'],['```','Block'],['- item','List'],['> text','Quote']].map(([ex,lbl])=>(
              <div key={lbl} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <code style={{ fontSize:10, background:'#e2e8f0', padding:'1px 5px', borderRadius:4, color:'#334155', fontFamily:'monospace' }}>{ex}</code>
                <span style={{ fontSize:10, color:'#94a3b8' }}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TESTS PAGE
// ─────────────────────────────────────────────────────────────────
export function TestsPage() {
  const sidebar=(<SideCard sections={[
    { label:'Browse', items:[{label:'All Tests',active:true},{label:'My Attempts',active:false},{label:'Leaderboard',active:false}]},
    { label:'My Courses', items:[{label:'CMSC131',dot:'#8b5cf6',active:false},{label:'MATH140',dot:'#10b981',active:false},{label:'ENGL101',dot:'#f59e0b',active:false}]},
  ]}/>)
  return (
    <PageShell nav={<Navbar crumbs={[{label:'Practice Tests',to:'/tests'}]} hideTabs/>} sidebar={sidebar}>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>Practice Tests</h1>
        <p style={{ fontSize:13, color:'#64748b' }}>Course-linked tests with instant scoring. Coming in V1.</p>
      </div>
      <TeaserCard title="CMSC131 Final Exam Prep" sub="20 questions · Multiple choice · Based on CMSC131 Complete Study Guide"
        chips={[{label:'CMSC131',bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},{label:'20 questions'},{label:'~15 min'}]}/>
      <TeaserCard title="MATH140 Derivatives Quick Quiz" sub="15 questions · Short answer · AI-generated from Limits & Derivatives sheet"
        chips={[{label:'MATH140',bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},{label:'15 questions'}]}/>
      <TeaserCard title="CMSC131 Recursion Drills" sub="10 trace-through problems · Based on Recursion Cheatsheet"
        chips={[{label:'CMSC131',bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},{label:'10 problems'},{label:'Intermediate'}]}/>
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', borderRadius:14, padding:'20px', marginTop:16, textAlign:'center' }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:6 }}>AI-Generated Tests Coming in V1</div>
        <div style={{ fontSize:12, color:'#64748b', maxWidth:340, margin:'0 auto' }}>Claude AI will read your study sheets and automatically generate practice questions with instant scoring.</div>
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// NOTES PAGE
// ─────────────────────────────────────────────────────────────────
export function NotesPage() {
  const sidebar=(<SideCard sections={[
    { label:'My Notes', items:[{label:'All Notes',active:true},{label:'Shared by me',active:false},{label:'Recent',active:false}]},
    { label:'By Course', items:[{label:'CMSC131',dot:'#8b5cf6',active:false},{label:'MATH140',dot:'#10b981',active:false},{label:'ENGL101',dot:'#f59e0b',active:false}]},
  ]}/>)
  return (
    <PageShell nav={<Navbar crumbs={[{label:'My Notes',to:'/notes'}]} hideTabs/>} sidebar={sidebar}>
      <div style={{ marginBottom:14, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>My Notes</h1>
          <p style={{ fontSize:13, color:'#64748b' }}>Private notes per course. Optionally share with classmates.</p>
        </div>
        <button disabled style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#f1f5f9', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#94a3b8', cursor:'not-allowed', fontFamily:FONT }}>
          <IconPlus size={13}/>New Note
        </button>
      </div>
      <TeaserCard title="CMSC131 — Week 3 OOP Notes" sub="Private · Created by you · 2 pages"
        chips={[{label:'CMSC131',bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},{label:'Private'},{label:'2 pages'}]}/>
      <TeaserCard title="MATH140 — Exam Day Formula Sheet" sub="Shared with course · Created by you · 1 page"
        chips={[{label:'MATH140',bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},{label:'Shared'}]}/>
      <TeaserCard title="ENGL101 — Essay Draft Notes" sub="Private · Created by you · 3 pages"
        chips={[{label:'ENGL101',bg:'#fef3c7',color:'#78350f',border:'#fcd34d'},{label:'Private'}]}/>
      <div style={{ background:'#fff', borderRadius:14, border:'1.5px dashed #cbd5e1', padding:'28px 24px', textAlign:'center', marginTop:8 }}>
        <div style={{ fontSize:13, color:'#94a3b8', marginBottom:4 }}>Rich text editor with markdown support</div>
        <div style={{ fontSize:12, color:'#cbd5e1' }}>GET / POST / DELETE /api/notes — coming in V1</div>
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS PAGE
// ─────────────────────────────────────────────────────────────────
const MOCK_ANNOUNCEMENTS = [
  { id:1, pinned:true,  type:'platform', title:'Welcome to StudyHub Beta!', body:"You're one of the first students using StudyHub. Upload your study sheets, earn stars from classmates, and help us build the best study platform.", author:'StudyHub', createdAt:new Date(Date.now()-2*3600*1000).toISOString() },
  { id:2, pinned:false, type:'platform', title:'Sheet upload limits raised to 50MB', body:'You can now upload larger study sheets including image-rich PDFs. Markdown rendering has been improved with table and code block support.', author:'StudyHub', createdAt:new Date(Date.now()-28*3600*1000).toISOString() },
  { id:3, pinned:false, type:'CMSC131', title:'Midterm study session this Friday', body:'Join the virtual study group this Friday at 7pm. We will go through recursion and OOP concepts. Link in the sheet comments.', author:'studyhub_seed', createdAt:new Date(Date.now()-48*3600*1000).toISOString() },
  { id:4, pinned:false, type:'MATH140', title:'New Calculus cheatsheet uploaded', body:'studyhub_seed uploaded a comprehensive limits & derivatives cheatsheet. 31 stars already — great for quick exam review.', author:'studyhub_seed', createdAt:new Date(Date.now()-3*24*3600*1000).toISOString() },
]
const TYPE_COL = {
  platform:{bg:'#eff6ff',color:'#1d4ed8',border:'#bfdbfe'},
  CMSC131: {bg:'#ede9fe',color:'#5b21b6',border:'#c4b5fd'},
  MATH140: {bg:'#d1fae5',color:'#065f46',border:'#6ee7b7'},
  ENGL101: {bg:'#fef3c7',color:'#78350f',border:'#fcd34d'},
}

export function AnnouncementsPage() {
  const user=(() => { try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null } })()
  const isAdmin=user?.role==='admin'

  const sidebar=(<SideCard sections={[
    { label:'Filter', items:[{label:'All',active:true},{label:'Pinned',active:false},{label:'Platform',active:false}]},
    { label:'By Course', items:[{label:'CMSC131',dot:'#8b5cf6',active:false},{label:'MATH140',dot:'#10b981',active:false},{label:'ENGL101',dot:'#f59e0b',active:false}]},
  ]}/>)

  const navActions=isAdmin?(
    <button style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'5px 13px', background:'#3b82f6', border:'none', borderRadius:7, cursor:'pointer', fontFamily:FONT, display:'flex', alignItems:'center', gap:5 }}>
      <IconPlus size={13}/>Post Announcement
    </button>
  ):null

  return (
    <PageShell nav={<Navbar crumbs={[{label:'Announcements',to:'/announcements'}]} hideTabs actions={navActions}/>} sidebar={sidebar}>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>Announcements</h1>
        <p style={{ fontSize:13, color:'#64748b' }}>Official updates from admins and course staff.</p>
      </div>
      {MOCK_ANNOUNCEMENTS.map(a=>{
        const tc=TYPE_COL[a.type]||TYPE_COL.platform
        if(a.pinned) return (
          <div key={a.id} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:14, padding:'14px 18px', marginBottom:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#92400e', letterSpacing:'.08em', marginBottom:8 }}>PINNED</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#92400e', marginBottom:6 }}>{a.title}</div>
            <div style={{ fontSize:12, color:'#78350f', lineHeight:1.65, marginBottom:8 }}>{a.body}</div>
            <div style={{ fontSize:11, color:'#b45309' }}>Posted by <strong>{a.author}</strong> · {timeAgo(a.createdAt)}</div>
          </div>
        )
        return (
          <div key={a.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'14px 18px', marginBottom:8 }}>
            <div style={{ display:'flex', gap:7, alignItems:'center', marginBottom:7 }}>
              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:tc.bg, color:tc.color, border:`1px solid ${tc.border}` }}>{a.type}</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{timeAgo(a.createdAt)}</span>
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:5 }}>{a.title}</div>
            <div style={{ fontSize:12, color:'#64748b', lineHeight:1.65, marginBottom:7 }}>{a.body}</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>by <strong style={{ color:'#64748b' }}>{a.author}</strong></div>
          </div>
        )
      })}
      <div style={{ background:'#fff', borderRadius:14, border:'1.5px dashed #cbd5e1', padding:'24px', textAlign:'center', marginTop:8 }}>
        <div style={{ fontSize:13, color:'#94a3b8', marginBottom:4 }}>Admin posting panel coming soon</div>
        <div style={{ fontSize:12, color:'#cbd5e1' }}>POST /api/announcements · Pin/unpin · Real-time feed updates</div>
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// SHELLS (submit, admin, test-taker)
// ─────────────────────────────────────────────────────────────────
export function SubmitPage() {
  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Submit Request',to:'/submit'}]} hideTabs/>
      <div style={{ maxWidth:640, margin:'48px auto', padding:'0 20px' }}>
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e2e8f0', padding:'32px' }}>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:8 }}>Request a Missing Course</h1>
          <p style={{ fontSize:13, color:'#64748b', marginBottom:24 }}>Can't find your course? Let us know and we'll add it within 24h.</p>
          <div style={{ fontSize:12, color:'#94a3b8', border:'1.5px dashed #cbd5e1', borderRadius:10, padding:20, textAlign:'center' }}>Form coming soon — POST /api/courses/request</div>
        </div>
      </div>
    </div>
  )
}

export function AdminPage() {
  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Admin',to:'/admin'}]} hideTabs/>
      <div style={{ maxWidth:1140, margin:'0 auto', padding:'24px 20px 60px' }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:16 }}>Admin Panel</h1>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[['Total Users','—'],['Total Sheets','—'],['Flagged Courses','—'],['Total Stars','—']].map(([lbl,val])=>(
            <div key={lbl} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'16px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#94a3b8', letterSpacing:'.06em', marginBottom:6 }}>{lbl.toUpperCase()}</div>
              <div style={{ fontSize:22, fontWeight:800, color:'#0f172a' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:'#94a3b8', border:'1.5px dashed #cbd5e1', borderRadius:12, padding:28, textAlign:'center' }}>
          Admin dashboard — user management, flagged courses, and moderation tools coming in V1.
        </div>
      </div>
    </div>
  )
}

export function TestTakerPage() {
  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Practice Tests',to:'/tests'},{label:'Taking test…',to:null}]} hideTabs hideSearch/>
      <div style={{ maxWidth:720, margin:'48px auto', padding:'0 20px' }}>
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e2e8f0', padding:'32px', textAlign:'center' }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Test interface coming in V1</div>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>Multiple choice + short answer with instant AI scoring.</div>
          <Link to="/tests" style={{ fontSize:13, color:'#3b82f6', fontWeight:600, textDecoration:'none' }}>← Back to Practice Tests</Link>
        </div>
      </div>
    </div>
  )
}

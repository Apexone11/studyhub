// src/pages/PlaceholderPages.jsx — PATCH v2
// UploadSheetPage: split-pane editor + live preview, real API
// TestsPage / NotesPage / AnnouncementsPage: sidebar layout + teasers
// SubmitPage / AdminPage / TestTakerPage: cleaned shells

import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import Navbar from '../components/Navbar'
import { IconUpload, IconEye, IconPlus, IconCheck } from '../components/Icons'
import { pageColumns, pageShell } from '../lib/ui'

import { API } from '../config'
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
      <div style={pageShell('app')}>
        <div style={{ display:'grid', gridTemplateColumns:pageColumns.appTwoColumn, gap:20, alignItems:'start' }}>
          <div style={{ position:'sticky', top:74 }}>{sidebar}</div>
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
      nodes.push(<div key={i} style={{ fontSize:sz, fontWeight:700, color:'#0f172a', margin:lvl===1?'0 0 10px':'8px 0 4px', borderBottom:lvl<=2?'1px solid #f1f5f9':'none', paddingBottom:lvl<=2?5:0 }} dangerouslySetInnerHTML={{ __html:DOMPurify.sanitize(inline(hm[2])) }}/>)
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
        <div style={{ fontSize:12, color:'#1e40af', fontStyle:'italic' }} dangerouslySetInnerHTML={{ __html:DOMPurify.sanitize(inline(line.slice(2))) }}/>
      </div>); i++; continue
    }
    if (line.match(/^[-*+]\s/)) {
      const items=[]; while(i<lines.length&&lines[i].match(/^[-*+]\s/)){items.push(lines[i].slice(2));i++}
      nodes.push(<ul key={`ul${i}`} style={{ margin:'0 0 8px 18px', padding:0 }}>
        {items.map((it,j)=><li key={j} style={{ fontSize:12, color:'#334155', lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html:DOMPurify.sanitize(inline(it)) }}/>)}
      </ul>); continue
    }
    if (line.trim()===''){nodes.push(<div key={i} style={{ height:8 }}/>);i++;continue}
    nodes.push(<p key={i} style={{ fontSize:12, color:'#334155', lineHeight:1.7, margin:'0 0 6px' }} dangerouslySetInnerHTML={{ __html:DOMPurify.sanitize(inline(line)) }}/>)
    i++
  }
  return <>{nodes}</>
}

// ─────────────────────────────────────────────────────────────────
// UPLOAD SHEET PAGE
// ─────────────────────────────────────────────────────────────────
// Allowed attachment types (client-side pre-validation)
const ATTACH_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ATTACH_ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']
const ATTACH_MAX_BYTES = 10 * 1024 * 1024

function validateAttachment(file) {
  if (!file) return ''
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (!ATTACH_ALLOWED_TYPES.includes(file.type) || !ATTACH_ALLOWED_EXT.includes(ext)) {
    return 'Attachment must be a PDF or image (JPEG, PNG, GIF, WebP).'
  }
  if (file.size > ATTACH_MAX_BYTES) return 'Attachment must be 10 MB or smaller.'
  return ''
}

export function UploadSheetPage() {
  const navigate=useNavigate()
  const [title,   setTitle]   = useState('')
  const [courseId,setCourseId]= useState('')
  const [content, setContent] = useState('# Sheet Title\n\n## Topic 1\n\nYour notes here…\n\n## Topic 2\n\n- Point one\n- Point two\n- Point three\n\n```java\n// Code example\npublic class Hello {\n  public static void main(String[] args) {\n    System.out.println("Hello!");\n  }\n}\n```\n')
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)
  // File attachment
  const [attachFile, setAttachFile] = useState(null)
  const [attachErr,  setAttachErr]  = useState('')
  const [attachUploading, setAttachUploading] = useState(false)
  const fileInputRef = useRef()
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

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateAttachment(file)
    if (err) { setAttachErr(err); e.target.value=''; return }
    setAttachErr('')
    setAttachFile(file)
  }

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

      // Upload attachment if selected
      if (attachFile) {
        setAttachUploading(true)
        const fd = new FormData()
        fd.append('attachment', attachFile)
        try {
          await fetch(`${API}/api/upload/attachment/${sheet.id}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: fd,
          })
        } catch { /* attachment upload failure is non-fatal */ }
        setAttachUploading(false)
      }

      navigate(`/sheets/${sheet.id}`)
    } catch(err){setError(err.message);setLoading(false)}
  }

  const navActions=(
    <div style={{ display:'flex', gap:7, alignItems:'center' }}>
      {saved&&<span style={{ fontSize:11, color:'#10b981', display:'flex', alignItems:'center', gap:4 }}><IconCheck size={12}/>Saved</span>}
      {!saved&&<span style={{ fontSize:11, color:'#64748b' }}>Saving…</span>}
      <Link to="/sheets" style={{ fontSize:12, color:'#64748b', textDecoration:'none', padding:'5px 10px', border:'1px solid #334155', borderRadius:7 }}>Cancel</Link>
      <button onClick={handlePublish} disabled={loading||attachUploading} style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'5px 15px', background:(loading||attachUploading)?'#93c5fd':'#3b82f6', border:'none', borderRadius:7, cursor:(loading||attachUploading)?'wait':'pointer', fontFamily:FONT, display:'flex', alignItems:'center', gap:5 }}>
        {loading?'Publishing…':attachUploading?'Uploading…':<><IconUpload size={13}/>Publish Sheet</>}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Study Sheets',to:'/sheets'},{label:'New Sheet',to:null}]} hideTabs actions={navActions} hideSearch/>
      <div style={pageShell('editor', 20, 60)}>
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

        {/* Attachment row */}
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'14px 20px', marginBottom:12 }}>
          <label style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.06em', display:'block', marginBottom:8 }}>
            OPTIONAL ATTACHMENT <span style={{ fontSize:9, color:'#94a3b8', textTransform:'none', letterSpacing:0 }}>(PDF, PNG, JPEG, GIF, WebP — max 10 MB)</span>
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display:'none' }} onChange={handleFileSelect}/>
            <button
              type="button"
              onClick={()=>fileInputRef.current?.click()}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#f8fafc', border:'1.5px dashed #cbd5e1', borderRadius:8, fontSize:12, fontWeight:600, color:'#64748b', cursor:'pointer', fontFamily:FONT }}
            >
              <i className="fas fa-paperclip" style={{ fontSize:12 }}></i>
              {attachFile ? 'Change file' : 'Attach file'}
            </button>
            {attachFile && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <i className={`fas ${attachFile.type==='application/pdf'?'fa-file-pdf':'fa-file-image'}`} style={{ color:'#3b82f6', fontSize:14 }}></i>
                <span style={{ fontSize:12, color:'#334155', fontWeight:600 }}>{attachFile.name}</span>
                <span style={{ fontSize:11, color:'#94a3b8' }}>({(attachFile.size/1024/1024).toFixed(1)} MB)</span>
                <button onClick={()=>{setAttachFile(null);if(fileInputRef.current)fileInputRef.current.value=''}} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:16, padding:'0 4px' }}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
          </div>
          {attachErr && <div style={{ marginTop:6, fontSize:12, color:'#dc2626' }}><i className="fas fa-circle-exclamation" style={{ marginRight:5 }}></i>{attachErr}</div>}
          <div style={{ marginTop:8, fontSize:11, color:'#94a3b8' }}>
            <i className="fas fa-shield-halved" style={{ marginRight:5, color:'#10b981' }}></i>
            Files are scanned for allowed types. Executable files (.exe, .js, .sh, etc.) are blocked for security.
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
              <span style={{ fontSize:10, color:'#10b981' }}>
                <i className="fas fa-check" style={{ fontSize:9, marginRight:3 }}></i>synced
              </span>
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
// NOTES PAGE — full CRUD editor
// ─────────────────────────────────────────────────────────────────
const COURSE_COLORS = ['#8b5cf6','#10b981','#f59e0b','#3b82f6','#ef4444','#06b6d4','#ec4899']

export function NotesPage() {
  const [notes, setNotes] = useState([])
  const [activeNote, setActiveNote] = useState(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editorPrivate, setEditorPrivate] = useState(true)
  const [editorCourseId, setEditorCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [filterTab, setFilterTab] = useState('all')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const saveTimer = useRef()

  useEffect(() => {
    fetch(`${API}/api/notes`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setNotes(Array.isArray(d) ? d : []); setLoadingNotes(false) })
      .catch(() => setLoadingNotes(false))
    fetch(`${API}/api/courses/schools`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCourses((data||[]).flatMap(s => (s.courses||[]).map(c => ({ ...c, schoolName: s.name })))))
      .catch(() => {})
  }, [])

  function selectNote(note) {
    setActiveNote(note)
    setEditorTitle(note.title)
    setEditorContent(note.content || '')
    setEditorPrivate(note.private !== false)
    setEditorCourseId(note.courseId ? String(note.courseId) : '')
    setConfirmDelete(false)
  }

  const autoSave = useCallback((noteId, title, content, priv, courseId) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!noteId) return
      setSaving(true)
      try {
        const res = await fetch(`${API}/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ title, content, private: priv, courseId: courseId || null }),
        })
        if (res.ok) {
          const updated = await res.json()
          setNotes(prev => prev.map(n => n.id === noteId ? updated : n))
          setActiveNote(updated)
        }
      } finally { setSaving(false) }
    }, 1500)
  }, [])

  function handleTitleChange(v) {
    setEditorTitle(v)
    if (activeNote) autoSave(activeNote.id, v, editorContent, editorPrivate, editorCourseId)
  }
  function handleContentChange(v) {
    setEditorContent(v)
    if (activeNote) autoSave(activeNote.id, editorTitle, v, editorPrivate, editorCourseId)
  }
  function handlePrivateChange(v) {
    setEditorPrivate(v)
    if (activeNote) autoSave(activeNote.id, editorTitle, editorContent, v, editorCourseId)
  }
  function handleCourseChange(v) {
    setEditorCourseId(v)
    if (activeNote) autoSave(activeNote.id, editorTitle, editorContent, editorPrivate, v)
  }

  async function createNote() {
    setCreating(true)
    try {
      const res = await fetch(`${API}/api/notes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: 'Untitled Note', content: '' }),
      })
      if (!res.ok) return
      const note = await res.json()
      setNotes(prev => [note, ...prev])
      selectNote(note)
    } finally { setCreating(false) }
  }

  async function deleteNote() {
    if (!activeNote) return
    const res = await fetch(`${API}/api/notes/${activeNote.id}`, { method: 'DELETE', headers: authHeaders() })
    if (res.ok) {
      setNotes(prev => prev.filter(n => n.id !== activeNote.id))
      setActiveNote(null)
      setConfirmDelete(false)
    }
  }

  const visibleNotes = notes.filter(n => {
    if (filterTab === 'private') return n.private !== false
    if (filterTab === 'shared')  return n.private === false
    return true
  })

  const enrolledCourses = courses.slice(0, 8)

  const sidebar = (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ fontSize:9, letterSpacing:'.1em', fontWeight:600, color:'#94a3b8', padding:'12px 14px 5px', textTransform:'uppercase' }}>Filter</div>
        {[['all','All Notes'],['private','Private'],['shared','Shared']].map(([id, label]) => (
          <div key={id} onClick={() => { setFilterTab(id); setActiveNote(null) }}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderLeft:`2px solid ${filterTab===id?'#3b82f6':'transparent'}`, background:filterTab===id?'#eff6ff':'transparent', color:filterTab===id?'#1d4ed8':'#64748b', fontSize:12, fontWeight:filterTab===id?600:400, cursor:'pointer' }}>
            <i className={`fas ${id==='all'?'fa-layer-group':id==='private'?'fa-lock':'fa-share-nodes'}`} style={{ fontSize:10 }}></i>
            {label}
          </div>
        ))}
      </div>
      {enrolledCourses.length > 0 && (
        <div style={{ background:'#fff', borderRadius:13, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ fontSize:9, letterSpacing:'.1em', fontWeight:600, color:'#94a3b8', padding:'12px 14px 5px', textTransform:'uppercase' }}>My Courses</div>
          {enrolledCourses.map((c, i) => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', fontSize:12, color:'#64748b' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:COURSE_COLORS[i%COURSE_COLORS.length], flexShrink:0 }}/>
              {c.code}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <PageShell nav={<Navbar crumbs={[{label:'My Notes',to:'/notes'}]} hideTabs/>} sidebar={sidebar}>
      <div style={{ marginBottom:14, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>My Notes</h1>
          <p style={{ fontSize:13, color:'#64748b' }}>Markdown notes per course. Private by default.</p>
        </div>
        <button onClick={createNote} disabled={creating}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#3b82f6', border:'none', borderRadius:8, fontSize:12, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:FONT }}>
          <IconPlus size={13}/>{creating ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <div style={{ color:'#94a3b8', fontSize:13, padding:'20px 0' }}>Loading…</div>
      ) : visibleNotes.length === 0 && !activeNote ? (
        <div style={{ background:'#fff', borderRadius:14, border:'1.5px dashed #cbd5e1', padding:'48px 24px', textAlign:'center' }}>
          <i className="fas fa-book-open" style={{ fontSize:32, color:'#cbd5e1', marginBottom:12, display:'block' }}></i>
          <div style={{ fontSize:14, fontWeight:600, color:'#64748b', marginBottom:6 }}>
            {filterTab==='private'?'No private notes':filterTab==='shared'?'No shared notes':'No notes yet'}
          </div>
          <div style={{ fontSize:12, color:'#94a3b8', marginBottom:16 }}>
            {filterTab==='private'?'Create a note and keep the Private checkbox checked.':
             filterTab==='shared'?'Uncheck "Private" on a note to share it.':
             'Create your first note to get started.'}
          </div>
          <button onClick={createNote} style={{ background:'#3b82f6', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
            Create a Note
          </button>
        </div>
      ) : (
        <>
          {/* Note list rows */}
          {!activeNote && (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {visibleNotes.map(n => (
                <div key={n.id} onClick={() => selectNote(n)}
                  style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', cursor:'pointer', transition:'box-shadow .15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{n.title}</div>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:n.private!==false?'#f1f5f9':'#dcfce7', color:n.private!==false?'#64748b':'#16a34a', marginLeft:8, whiteSpace:'nowrap' }}>
                      {n.private !== false ? 'Private' : 'Shared'}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'#94a3b8', display:'flex', gap:10 }}>
                    {n.course && <span><i className="fas fa-book" style={{ marginRight:4 }}></i>{n.course.code}</span>}
                    <span>{timeAgo(n.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Editor */}
          {activeNote && (
            <div>
              <button onClick={() => setActiveNote(null)} style={{ background:'none', border:'none', color:'#3b82f6', fontSize:12, cursor:'pointer', fontFamily:FONT, marginBottom:10, padding:0, display:'flex', alignItems:'center', gap:5 }}>
                <i className="fas fa-arrow-left"></i> All Notes
              </button>

              {/* Meta row */}
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', marginBottom:10, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                <input value={editorTitle} onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Note title…"
                  style={{ flex:'1 1 200px', border:'none', outline:'none', fontSize:16, fontWeight:700, color:'#0f172a', fontFamily:FONT, minWidth:120 }} />
                <select value={editorCourseId} onChange={e => handleCourseChange(e.target.value)}
                  style={{ border:'1px solid #e2e8f0', borderRadius:7, padding:'5px 10px', fontSize:12, fontFamily:FONT, color:'#64748b', outline:'none' }}>
                  <option value="">No course</option>
                  {courses.map(c => <option key={c.id} value={String(c.id)}>{c.code}</option>)}
                </select>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', cursor:'pointer' }}>
                  <input type="checkbox" checked={editorPrivate} onChange={e => handlePrivateChange(e.target.checked)} />
                  Private
                </label>
                {saving && <span style={{ fontSize:11, color:'#94a3b8' }}>Saving…</span>}
                {!saving && <span style={{ fontSize:11, color:'#10b981' }}><i className="fas fa-check" style={{ marginRight:3 }}></i>Saved</span>}
              </div>

              {/* Split pane */}
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid #e2e8f0' }}>
                  <div style={{ padding:'8px 14px', borderRight:'1px solid #e2e8f0', fontSize:11, fontWeight:600, color:'#3b82f6' }}>
                    <i className="fas fa-pen" style={{ marginRight:6 }}></i>Markdown
                  </div>
                  <div style={{ padding:'8px 14px', fontSize:11, fontWeight:600, color:'#64748b' }}>
                    <i className="fas fa-eye" style={{ marginRight:6 }}></i>Preview
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:360 }}>
                  <div style={{ borderRight:'1px solid #1e293b', background:'#0f172a' }}>
                    <textarea value={editorContent} onChange={e => handleContentChange(e.target.value)} spellCheck={false}
                      style={{ width:'100%', height:'100%', minHeight:360, background:'transparent', border:'none', outline:'none', resize:'none', padding:'14px 16px', fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:12, lineHeight:1.9, color:'#e2e8f0', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ padding:'14px 18px', overflowY:'auto', maxHeight:500 }}>
                    <MiniPreview md={editorContent} />
                  </div>
                </div>
              </div>

              {/* Delete */}
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'7px 16px', fontSize:12, cursor:'pointer', fontFamily:FONT }}>
                  <i className="fas fa-trash" style={{ marginRight:6 }}></i>Delete Note
                </button>
              ) : (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'#dc2626' }}>Delete this note permanently?</span>
                  <button onClick={deleteNote} style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:7, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:FONT }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background:'none', border:'1px solid #e2e8f0', color:'#64748b', borderRadius:7, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:FONT }}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS PAGE
// ─────────────────────────────────────────────────────────────────
export function AnnouncementsPage() {
  const user=(() => { try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null } })()
  const isAdmin=user?.role==='admin'

  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  // Admin post form
  const [showForm, setShowForm] = useState(false)
  const [aTitle, setATitle] = useState('')
  const [aBody, setABody] = useState('')
  const [aPinned, setAPinned] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postErr, setPostErr] = useState('')

  useEffect(() => {
    fetch(`${API}/api/announcements`)
      .then(r => r.json())
      .then(data => { setAnnouncements(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handlePost(e) {
    e.preventDefault()
    if (!aTitle.trim() || !aBody.trim()) { setPostErr('Title and body are required.'); return }
    setPosting(true); setPostErr('')
    try {
      const res = await fetch(`${API}/api/announcements`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: aTitle.trim(), body: aBody.trim(), pinned: aPinned }),
      })
      const data = await res.json()
      if (!res.ok) { setPostErr(data.error || 'Failed to post.'); return }
      setAnnouncements(prev => [data, ...prev])
      setATitle(''); setABody(''); setAPinned(false); setShowForm(false)
    } catch { setPostErr('Could not connect to server.') }
    finally { setPosting(false) }
  }

  const navActions=isAdmin?(
    <button onClick={() => setShowForm(f => !f)} style={{ fontSize:12, fontWeight:700, color:'#fff', padding:'5px 13px', background:'#3b82f6', border:'none', borderRadius:7, cursor:'pointer', fontFamily:FONT, display:'flex', alignItems:'center', gap:5 }}>
      <IconPlus size={13}/>{showForm ? 'Cancel' : 'Post Announcement'}
    </button>
  ):null

  const sidebar=(<SideCard sections={[
    { label:'Filter', items:[{label:'All',active:true},{label:'Pinned',active:false}]},
  ]}/>)

  return (
    <PageShell nav={<Navbar crumbs={[{label:'Announcements',to:'/announcements'}]} hideTabs actions={navActions}/>} sidebar={sidebar}>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>Announcements</h1>
        <p style={{ fontSize:13, color:'#64748b' }}>Official updates from the StudyHub team.</p>
      </div>

      {/* Admin post form */}
      {isAdmin && showForm && (
        <form onSubmit={handlePost} style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:12 }}>New Announcement</div>
          <input value={aTitle} onChange={e => setATitle(e.target.value)} placeholder="Title" style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:13, fontFamily:FONT, marginBottom:10, outline:'none' }} />
          <textarea value={aBody} onChange={e => setABody(e.target.value)} placeholder="Body" rows={3} style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 12px', fontSize:13, fontFamily:FONT, resize:'vertical', outline:'none', marginBottom:10 }} />
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#64748b', marginBottom:12, cursor:'pointer' }}>
            <input type="checkbox" checked={aPinned} onChange={e => setAPinned(e.target.checked)} />
            Pin this announcement
          </label>
          {postErr && <div style={{ color:'#dc2626', fontSize:12, marginBottom:8 }}>{postErr}</div>}
          <button type="submit" disabled={posting} style={{ background:'#3b82f6', color:'#fff', border:'none', borderRadius:7, padding:'7px 18px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </form>
      )}

      {loading && <div style={{ color:'#94a3b8', fontSize:13, padding:'20px 0' }}>Loading…</div>}
      {!loading && announcements.length === 0 && (
        <div style={{ background:'#fff', borderRadius:14, border:'1.5px dashed #cbd5e1', padding:'28px', textAlign:'center' }}>
          <div style={{ fontSize:13, color:'#94a3b8' }}>No announcements yet.</div>
        </div>
      )}
      {announcements.map(a => a.pinned ? (
        <div key={a.id} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:14, padding:'14px 18px', marginBottom:10 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#92400e', letterSpacing:'.08em', marginBottom:8 }}>PINNED</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#92400e', marginBottom:6 }}>{a.title}</div>
          <div style={{ fontSize:12, color:'#78350f', lineHeight:1.65, marginBottom:8 }}>{a.body}</div>
          <div style={{ fontSize:11, color:'#b45309' }}>Posted by <strong>{a.author?.username}</strong> · {timeAgo(a.createdAt)}</div>
        </div>
      ) : (
        <div key={a.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'14px 18px', marginBottom:8 }}>
          <div style={{ display:'flex', gap:7, alignItems:'center', marginBottom:7 }}>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{timeAgo(a.createdAt)}</span>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:5 }}>{a.title}</div>
          <div style={{ fontSize:12, color:'#64748b', lineHeight:1.65, marginBottom:7 }}>{a.body}</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>by <strong style={{ color:'#64748b' }}>{a.author?.username}</strong></div>
        </div>
      ))}
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
  const navigate = useNavigate()
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null } })()

  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [sheets, setSheets] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [deletionReasons, setDeletionReasons] = useState([])
  const [usersPage, setUsersPage] = useState(1)
  const [sheetsPage, setSheetsPage] = useState(1)
  const [annPage, setAnnPage] = useState(1)
  const [drPage, setDrPage] = useState(1)
  const [usersTotal, setUsersTotal] = useState(0)
  const [sheetsTotal, setSheetsTotal] = useState(0)
  const [annTotal, setAnnTotal] = useState(0)
  const [drTotal, setDrTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Announcement form
  const [showAnnForm, setShowAnnForm] = useState(false)
  const [aTitle, setATitle] = useState('')
  const [aBody, setABody] = useState('')
  const [aPinned, setAPinned] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postErr, setPostErr] = useState('')

  // Admin settings form
  const [adPwForm, setAdPwForm] = useState({ currentPassword:'', newPassword:'', confirmPassword:'' })
  const [adUnForm, setAdUnForm] = useState({ newUsername:'', password:'' })
  const [adPwMsg, setAdPwMsg] = useState(null)
  const [adUnMsg, setAdUnMsg] = useState(null)
  const [adSaving, setAdSaving] = useState(false)

  // User delete confirm
  const [deleteUserId, setDeleteUserId] = useState(null)

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') { navigate('/feed'); return }
    fetch(`${API}/api/admin/stats`, { headers: authHeaders() })
      .then(r => r.json()).then(setStats).catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'users') return
    fetch(`${API}/api/admin/users?page=${usersPage}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setUsers(d.users || []); setUsersTotal(d.total || 0) }).catch(() => {})
  }, [tab, usersPage])

  useEffect(() => {
    if (tab !== 'sheets') return
    fetch(`${API}/api/admin/sheets?page=${sheetsPage}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setSheets(d.sheets || []); setSheetsTotal(d.total || 0) }).catch(() => {})
  }, [tab, sheetsPage])

  useEffect(() => {
    if (tab !== 'announcements') return
    fetch(`${API}/api/admin/announcements?page=${annPage}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setAnnouncements(d.announcements || []); setAnnTotal(d.total || 0) }).catch(() => {})
  }, [tab, annPage])

  useEffect(() => {
    if (tab !== 'deletion-reasons') return
    fetch(`${API}/api/admin/deletion-reasons?page=${drPage}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setDeletionReasons(d.reasons || []); setDrTotal(d.total || 0) }).catch(() => {})
  }, [tab, drPage])

  async function patchRole(userId, role) {
    const res = await fetch(`${API}/api/admin/users/${userId}/role`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ role }),
    })
    if (res.ok) setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
  }

  async function confirmDeleteUser(userId) {
    const res = await fetch(`${API}/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() })
    if (res.ok) { setUsers(prev => prev.filter(u => u.id !== userId)); setDeleteUserId(null) }
  }

  async function deleteSheet(sheetId) {
    if (!window.confirm('Delete this sheet permanently?')) return
    const res = await fetch(`${API}/api/admin/sheets/${sheetId}`, { method: 'DELETE', headers: authHeaders() })
    if (res.ok) setSheets(prev => prev.filter(s => s.id !== sheetId))
  }

  async function togglePin(ann) {
    const res = await fetch(`${API}/api/admin/announcements/${ann.id}/pin`, { method: 'PATCH', headers: authHeaders() })
    if (res.ok) {
      const updated = await res.json()
      setAnnouncements(prev => prev.map(a => a.id === ann.id ? updated : a))
    }
  }

  async function deleteAnn(annId) {
    if (!window.confirm('Delete this announcement?')) return
    const res = await fetch(`${API}/api/admin/announcements/${annId}`, { method: 'DELETE', headers: authHeaders() })
    if (res.ok) setAnnouncements(prev => prev.filter(a => a.id !== annId))
  }

  async function postAnn(e) {
    e.preventDefault()
    if (!aTitle.trim() || !aBody.trim()) { setPostErr('Title and body are required.'); return }
    setPosting(true); setPostErr('')
    try {
      const res = await fetch(`${API}/api/admin/announcements`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ title: aTitle.trim(), body: aBody.trim(), pinned: aPinned }),
      })
      const data = await res.json()
      if (!res.ok) { setPostErr(data.error || 'Failed.'); return }
      setAnnouncements(prev => [data, ...prev])
      setATitle(''); setABody(''); setAPinned(false); setShowAnnForm(false)
    } catch { setPostErr('Server error.') }
    finally { setPosting(false) }
  }

  async function handleAdminPatch(endpoint, body, setMsg) {
    setAdSaving(true); setMsg(null)
    try {
      const res = await fetch(`${API}/api/settings/${endpoint}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ type:'error', text: data.error }); return }
      if (data.token) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)) }
      setMsg({ type:'success', text: data.message })
    } catch { setMsg({ type:'error', text:'Server error.' }) }
    finally { setAdSaving(false) }
  }

  const TABS = [
    { id:'overview', label:'Overview' },
    { id:'users', label:'Users' },
    { id:'sheets', label:'Sheets' },
    { id:'announcements', label:'Announcements' },
    { id:'deletion-reasons', label:'Deletion Reasons' },
    { id:'admin-settings', label:'Admin Settings' },
  ]

  const adBtnStyle = { background:'#2563eb', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FONT }
  const adInputStyle = { width:'100%', boxSizing:'border-box', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'9px 12px', fontSize:13, fontFamily:FONT, outline:'none', color:'#0f172a', marginBottom:12 }

  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:FONT }}>
      <Navbar crumbs={[{label:'Admin',to:'/admin'}]} hideTabs/>
      <div style={pageShell('reading')}>
        <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'7px 14px', borderRadius:8, border:'none', fontSize:12, fontWeight:600,
              background: tab === t.id ? '#0f172a' : '#fff',
              color: tab === t.id ? '#fff' : '#64748b',
              cursor:'pointer', fontFamily:FONT,
              boxShadow: tab === t.id ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            {loading ? <div style={{ color:'#94a3b8', fontSize:13 }}>Loading stats…</div> : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:20 }}>
                {[
                  ['Users', stats?.totalUsers, 'fa-users', '#3b82f6'],
                  ['Sheets', stats?.totalSheets, 'fa-file-lines', '#8b5cf6'],
                  ['Notes', stats?.totalNotes, 'fa-book-open', '#10b981'],
                  ['Comments', stats?.totalComments, 'fa-comments', '#f59e0b'],
                  ['Reactions', stats?.totalReactions, 'fa-thumbs-up', '#ef4444'],
                  ['Follows', stats?.totalFollows, 'fa-user-plus', '#06b6d4'],
                ].map(([lbl, val, icon, color]) => (
                  <div key={lbl} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'16px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <i className={`fas ${icon}`} style={{ color, fontSize:14 }}></i>
                      <div style={{ fontSize:10, fontWeight:600, color:'#94a3b8', letterSpacing:'.06em' }}>{lbl.toUpperCase()}</div>
                    </div>
                    <div style={{ fontSize:26, fontWeight:800, color:'#0f172a' }}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:12 }}>{usersTotal} total users</div>
            {deleteUserId && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:13, color:'#dc2626' }}>Delete this user permanently? This cannot be undone.</span>
                <button onClick={() => confirmDeleteUser(deleteUserId)} style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:7, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:FONT }}>Confirm Delete</button>
                <button onClick={() => setDeleteUserId(null)} style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:7, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:FONT, color:'#64748b' }}>Cancel</button>
              </div>
            )}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['Username','Email','Role','Sheets','Joined','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#64748b', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#0f172a' }}>{u.username}</td>
                      <td style={{ padding:'10px 14px', color:'#64748b' }}>{u.email || '—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background: u.role==='admin'?'#fef3c7':'#f1f5f9', color: u.role==='admin'?'#92400e':'#64748b' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding:'10px 14px', color:'#64748b' }}>{u._count?.studySheets ?? 0}</td>
                      <td style={{ padding:'10px 14px', color:'#94a3b8', whiteSpace:'nowrap' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding:'10px 14px', display:'flex', gap:6, flexWrap:'wrap' }}>
                        {u.role === 'student'
                          ? <button onClick={() => patchRole(u.id, 'admin')} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, color:'#64748b' }}>Make Admin</button>
                          : <button onClick={() => patchRole(u.id, 'student')} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', cursor:'pointer', fontFamily:FONT, color:'#dc2626' }}>Revoke Admin</button>
                        }
                        {u.id !== currentUser?.id && (
                          <button onClick={() => setDeleteUserId(u.id)} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', cursor:'pointer', fontFamily:FONT, color:'#dc2626' }}>
                            <i className="fas fa-trash" style={{ marginRight:4 }}></i>Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:14 }}>
              <button onClick={() => setUsersPage(p => Math.max(1, p-1))} disabled={usersPage===1} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Prev</button>
              <span style={{ fontSize:12, color:'#64748b', lineHeight:'32px' }}>Page {usersPage}</span>
              <button onClick={() => setUsersPage(p => p+1)} disabled={usersPage*20>=usersTotal} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Next</button>
            </div>
          </div>
        )}

        {/* ── SHEETS ── */}
        {tab === 'sheets' && (
          <div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:12 }}>{sheetsTotal} total sheets</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {sheets.map(s => (
                <div key={s.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:2 }}>{s.title}</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>
                      by {s.author?.username} · {s.course?.code}
                      <i className="fas fa-star" style={{ marginLeft:8, marginRight:3, color:'#f59e0b' }}></i>{s.stars}
                      <i className="fas fa-download" style={{ marginLeft:8, marginRight:3, color:'#3b82f6' }}></i>{s.downloads}
                    </div>
                  </div>
                  <button onClick={() => deleteSheet(s.id)} style={{ fontSize:12, padding:'5px 12px', borderRadius:7, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontFamily:FONT }}>Delete</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:14 }}>
              <button onClick={() => setSheetsPage(p => Math.max(1,p-1))} disabled={sheetsPage===1} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Prev</button>
              <span style={{ fontSize:12, color:'#64748b', lineHeight:'32px' }}>Page {sheetsPage}</span>
              <button onClick={() => setSheetsPage(p => p+1)} disabled={sheetsPage*20>=sheetsTotal} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Next</button>
            </div>
          </div>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {tab === 'announcements' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:13, color:'#64748b' }}>{annTotal} announcements</div>
              <button onClick={() => setShowAnnForm(f => !f)} style={{ ...adBtnStyle, background:'#3b82f6', padding:'7px 14px', fontSize:12 }}>
                <i className="fas fa-plus" style={{ marginRight:5 }}></i>{showAnnForm ? 'Cancel' : 'New Announcement'}
              </button>
            </div>
            {showAnnForm && (
              <form onSubmit={postAnn} style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:12 }}>New Announcement</div>
                <input value={aTitle} onChange={e => setATitle(e.target.value)} placeholder="Title" style={adInputStyle} />
                <textarea value={aBody} onChange={e => setABody(e.target.value)} placeholder="Body" rows={3} style={{ ...adInputStyle, resize:'vertical' }} />
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#64748b', marginBottom:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={aPinned} onChange={e => setAPinned(e.target.checked)} /> Pin this announcement
                </label>
                {postErr && <div style={{ color:'#dc2626', fontSize:12, marginBottom:8 }}>{postErr}</div>}
                <button type="submit" disabled={posting} style={adBtnStyle}>{posting ? 'Posting…' : 'Post Announcement'}</button>
              </form>
            )}
            {announcements.map(a => (
              <div key={a.id} style={{ background: a.pinned ? '#fffbeb' : '#fff', borderRadius:12, border:`1px solid ${a.pinned ? '#fde68a' : '#e2e8f0'}`, padding:'12px 16px', marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    {a.pinned && <div style={{ fontSize:9, fontWeight:700, color:'#92400e', letterSpacing:'.08em', marginBottom:4 }}>PINNED</div>}
                    <div style={{ fontSize:13, fontWeight:700, color: a.pinned?'#92400e':'#0f172a', marginBottom:4 }}>{a.title}</div>
                    <div style={{ fontSize:12, color: a.pinned?'#78350f':'#64748b', lineHeight:1.6, marginBottom:6 }}>{a.body}</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>by <strong>{a.author?.username}</strong> · {timeAgo(a.createdAt)}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:12 }}>
                    <button onClick={() => togglePin(a)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontFamily:FONT, color:'#64748b' }}>
                      <i className={`fas ${a.pinned ? 'fa-thumbtack' : 'fa-thumbtack'}`} style={{ marginRight:4, color: a.pinned?'#f59e0b':'#94a3b8' }}></i>{a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={() => deleteAnn(a.id)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', cursor:'pointer', fontFamily:FONT, color:'#dc2626' }}>
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:14 }}>
              <button onClick={() => setAnnPage(p => Math.max(1,p-1))} disabled={annPage===1} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Prev</button>
              <span style={{ fontSize:12, color:'#64748b', lineHeight:'32px' }}>Page {annPage}</span>
              <button onClick={() => setAnnPage(p => p+1)} disabled={annPage*20>=annTotal} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Next</button>
            </div>
          </div>
        )}

        {/* ── DELETION REASONS ── */}
        {tab === 'deletion-reasons' && (
          <div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:12 }}>{drTotal} deletion records</div>
            {deletionReasons.length === 0 ? (
              <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'28px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                No account deletions recorded yet.
              </div>
            ) : (
              <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Username','Reason','Details','Date'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#64748b', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deletionReasons.map(r => (
                      <tr key={r.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:'#0f172a' }}>{r.username}</td>
                        <td style={{ padding:'10px 14px', color:'#64748b' }}>{r.reason.replace(/_/g,' ')}</td>
                        <td style={{ padding:'10px 14px', color:'#94a3b8', maxWidth:220 }}>{r.details || '—'}</td>
                        <td style={{ padding:'10px 14px', color:'#94a3b8', whiteSpace:'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:14 }}>
              <button onClick={() => setDrPage(p => Math.max(1,p-1))} disabled={drPage===1} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Prev</button>
              <span style={{ fontSize:12, color:'#64748b', lineHeight:'32px' }}>Page {drPage}</span>
              <button onClick={() => setDrPage(p => p+1)} disabled={drPage*20>=drTotal} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontFamily:FONT, fontSize:12 }}>Next</button>
            </div>
          </div>
        )}

        {/* ── ADMIN SETTINGS ── */}
        {tab === 'admin-settings' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#0f172a', marginBottom:16 }}>Admin Account Settings</div>
            {/* Change password */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'20px', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:12 }}>Change Password</div>
              <input type="password" placeholder="Current password" value={adPwForm.currentPassword} onChange={e => setAdPwForm(f => ({...f,currentPassword:e.target.value}))} style={adInputStyle}/>
              <input type="password" placeholder="New password (min 8 chars)" value={adPwForm.newPassword} onChange={e => setAdPwForm(f => ({...f,newPassword:e.target.value}))} style={adInputStyle}/>
              <input type="password" placeholder="Confirm new password" value={adPwForm.confirmPassword} onChange={e => setAdPwForm(f => ({...f,confirmPassword:e.target.value}))} style={adInputStyle}/>
              {adPwMsg && <div style={{ fontSize:12, color:adPwMsg.type==='error'?'#dc2626':'#16a34a', marginBottom:10 }}>{adPwMsg.text}</div>}
              <button disabled={adSaving} onClick={() => {
                if (adPwForm.newPassword !== adPwForm.confirmPassword) { setAdPwMsg({ type:'error', text:'Passwords do not match.' }); return }
                handleAdminPatch('password', { currentPassword:adPwForm.currentPassword, newPassword:adPwForm.newPassword }, setAdPwMsg)
                  .then(() => setAdPwForm({ currentPassword:'', newPassword:'', confirmPassword:'' }))
              }} style={adBtnStyle}>{adSaving ? 'Saving…' : 'Update Password'}</button>
            </div>
            {/* Change username */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'20px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:12 }}>Change Username</div>
              <input type="text" placeholder="New username (3-20 chars)" value={adUnForm.newUsername} onChange={e => setAdUnForm(f => ({...f,newUsername:e.target.value}))} style={adInputStyle}/>
              <input type="password" placeholder="Confirm with password" value={adUnForm.password} onChange={e => setAdUnForm(f => ({...f,password:e.target.value}))} style={adInputStyle}/>
              {adUnMsg && <div style={{ fontSize:12, color:adUnMsg.type==='error'?'#dc2626':'#16a34a', marginBottom:10 }}>{adUnMsg.text}</div>}
              <button disabled={adSaving} onClick={() => handleAdminPatch('username', adUnForm, setAdUnMsg)} style={adBtnStyle}>{adSaving ? 'Saving…' : 'Update Username'}</button>
            </div>
          </div>
        )}
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

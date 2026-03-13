// ─────────────────────────────────────────────────────────────────
// PLACEHOLDER PAGES
// Each page has: correct route, correct layout, real nav,
// feature sections marked with TODO, and a clear "coming soon" UI.
// When you're ready to build a page, replace the ComingSoon block
// with the real component.
// ─────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

const NAV_STYLE = {
  background: '#0f172a', height: 56, position: 'sticky', top: 0, zIndex: 100,
  display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
  borderBottom: '1px solid #1e293b',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
}
const PAGE_STYLE = {
  minHeight: '100vh', background: '#edf0f5',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: '#1e293b',
}
const CARD = {
  background: '#fff', borderRadius: 16,
  border: '1px solid #e8ecf0',
  boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
  padding: '32px', marginBottom: 20,
}

const INPUT = {
  width: '100%', padding: '10px 14px',
  border: '1px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: '#1e293b', outline: 'none', boxSizing: 'border-box',
  background: '#fafbfc',
}

function TopNav({ backLabel = '← Feed', backTo = '/feed' }) {
  return (
    <header style={NAV_STYLE}>
      <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" fill="#1e293b"/>
          <line x1="40" y1="64" x2="40" y2="45" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"/>
          <path d="M40 45 Q40 33 25 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <path d="M40 45 Q40 33 55 23" stroke="#3b82f6" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <circle cx="40" cy="45" r="4" fill="#3b82f6"/>
          <circle cx="25" cy="23" r="3.5" fill="#60a5fa"/>
          <circle cx="55" cy="23" r="3.5" fill="#60a5fa"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
          Study<span style={{ color: '#3b82f6' }}>Hub</span>
        </span>
      </Link>
      <div style={{ flex: 1 }} />
      <Link to={backTo} style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>{backLabel}</Link>
    </header>
  )
}

function PlaceholderSection({ icon, title, description, features = [] }) {
  return (
    <div style={{
      ...CARD,
      borderStyle: 'dashed', borderColor: '#cbd5e1',
      textAlign: 'center', padding: '40px 32px',
    }}>
      <i className={icon} style={{ fontSize: 40, color: '#cbd5e1', display: 'block', marginBottom: 14 }} />
      <div style={{ fontWeight: 800, fontSize: 18, color: '#475569', marginBottom: 6 }}>{title}</div>
      <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.65 }}>
        {description}
      </p>
      {features.length > 0 && (
        <div style={{
          background: '#f8fafc', borderRadius: 12,
          padding: '16px 20px', textAlign: 'left',
          maxWidth: 380, margin: '0 auto',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 10 }}>
            PLANNED FEATURES
          </div>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 0', fontSize: 13, color: '#64748b',
            }}>
              <i className="fa-regular fa-circle-dot" style={{ color: '#cbd5e1', fontSize: 12 }} />
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PRACTICE TESTS ────────────────────────────────────────────────
export function TestsPage() {
  return (
    <div style={PAGE_STYLE}>
      <TopNav />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
          <i className="fa-solid fa-circle-question" style={{ color: '#3b82f6', marginRight: 10 }} />
          Practice Tests
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
          Take course-linked practice tests and see your score immediately.
        </p>
        <PlaceholderSection
          icon="fa-solid fa-circle-question"
          title="Practice Tests Coming Soon"
          description="Students will be able to take multiple-choice and short-answer tests linked to any study sheet. Scores are shown instantly."
          features={[
            'Multiple choice & short answer formats',
            'Instant scoring with answer explanations',
            'AI-generated questions from study sheets',
            'Track your score history over time',
            'Share tests with classmates',
          ]}
        />
        {/* TODO: when ready, replace above with:
          - GET /api/tests → list of available tests
          - TestCard component (title, course, question count, attempts)
          - Click → /tests/:id for the test-taking interface
        */}
      </div>
    </div>
  )
}

// ── TEST TAKER ────────────────────────────────────────────────────
export function TestTakerPage() {
  const { id } = useParams()
  return (
    <div style={PAGE_STYLE}>
      <TopNav backLabel="← Tests" backTo="/tests" />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
        <PlaceholderSection
          icon="fa-solid fa-pen-to-square"
          title={`Test #${id} — Coming Soon`}
          description="The test-taking interface will render questions one at a time, let you select answers, and submit for immediate scoring."
          features={[
            'Question-by-question navigation',
            'Timer (optional, set by creator)',
            'Submit and see detailed results',
            'POST /api/tests/:id/attempt endpoint ready',
          ]}
        />
      </div>
    </div>
  )
}

// ── NOTES ─────────────────────────────────────────────────────────
export function NotesPage() {
  return (
    <div style={PAGE_STYLE}>
      <TopNav />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
          <i className="fa-solid fa-note-sticky" style={{ color: '#f59e0b', marginRight: 10 }} />
          My Notes
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
          Personal notes that only you can see. Optionally share with classmates.
        </p>
        <PlaceholderSection
          icon="fa-solid fa-note-sticky"
          title="Personal Notes Coming Soon"
          description="Create, edit, and organize personal notes per course. Notes are private by default with an option to share with classmates."
          features={[
            'Rich text editor (markdown support)',
            'Organize by course',
            'Private by default — opt-in sharing',
            'GET / POST / DELETE /api/notes endpoints',
            'Search across all your notes',
          ]}
        />
      </div>
    </div>
  )
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────
export function AnnouncementsPage() {
  // TODO: fetch from GET /api/announcements
  const MOCK = [
    { id: 1, title: 'Welcome to StudyHub Beta!', body: "You're one of the first students using StudyHub. Upload your study sheets and help us build something great.", author: 'StudyHub', time: '2h ago', pinned: true },
  ]
  return (
    <div style={PAGE_STYLE}>
      <TopNav />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              <i className="fa-solid fa-bullhorn" style={{ color: '#3b82f6', marginRight: 10 }} />
              Announcements
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
              Official updates from admins and course staff.
            </p>
          </div>
          {/* TODO: only show if user.role === 'admin' */}
          <button disabled style={{
            padding: '9px 18px', background: '#f1f5f9',
            border: '1px solid #e2e8f0', borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: '#94a3b8',
            cursor: 'not-allowed', fontFamily: 'inherit',
          }}>
            <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
            Post Announcement (Admin)
          </button>
        </div>

        {/* live announcements – currently mock */}
        {MOCK.map(a => (
          <div key={a.id} style={{
            ...CARD,
            borderColor: a.pinned ? '#fde68a' : '#e8ecf0',
            borderWidth: a.pinned ? 1.5 : 1,
          }}>
            {a.pinned && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa-solid fa-thumbtack" style={{ fontSize: 10 }} />
                PINNED
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 8 }}>{a.title}</div>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: '0 0 12px' }}>{a.body}</p>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Posted by <strong>{a.author}</strong> · {a.time}
            </div>
          </div>
        ))}

        <PlaceholderSection
          icon="fa-solid fa-bullhorn"
          title="Admin Posting Panel — Coming Soon"
          description="Admins will be able to post, pin, and manage announcements directly from this page. Students see new posts in real time."
          features={[
            'POST /api/announcements (admin only)',
            'Pin/unpin announcements',
            'Delete / edit posted announcements',
            'Real-time display in feed',
          ]}
        />
      </div>
    </div>
  )
}

// ── SUBMIT STUDY GUIDE ────────────────────────────────────────────
export function SubmitPage() {
  return (
    <div style={PAGE_STYLE}>
      <TopNav backLabel="← Feed" backTo="/feed" />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
          <i className="fa-solid fa-paper-plane" style={{ color: '#3b82f6', marginRight: 10 }} />
          Submit a Study Guide
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
          Submit your notes or study guide for review. Once approved by an admin, it'll appear for all students in your course.
        </p>
        <PlaceholderSection
          icon="fa-solid fa-paper-plane"
          title="Submission Review Flow — Coming Soon"
          description="Students can submit study guides for admin review. Approved guides are published for everyone. This is the community contribution feature."
          features={[
            'POST /api/submissions',
            'Admin review queue in /admin dashboard',
            'Status tracking: pending → approved → published',
            'Submitter gets notified when approved',
            'Approved guide appears in the main feed',
          ]}
        />
      </div>
    </div>
  )
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────────
export function AdminPage() {
  // TODO: redirect if user.role !== 'admin'
  return (
    <div style={PAGE_STYLE}>
      <TopNav backLabel="← Feed" backTo="/feed" />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#fef9ec', border: '1px solid #fde68a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fa-solid fa-shield-halved" style={{ color: '#f59e0b', fontSize: 20 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Admin Dashboard</h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Manage content, users, and announcements</p>
          </div>
        </div>

        {/* stat cards row – placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'fa-solid fa-users',      label: 'Total Students', val: '—', color: '#3b82f6' },
            { icon: 'fa-solid fa-file-lines', label: 'Study Sheets',   val: '3',  color: '#10b981' },
            { icon: 'fa-solid fa-star',       label: 'Total Stars',    val: '73', color: '#f59e0b' },
            { icon: 'fa-solid fa-inbox',      label: 'Pending Review', val: '—', color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#fff', borderRadius: 14,
              border: '1px solid #e8ecf0', padding: '18px 16px',
              boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
            }}>
              <i className={s.icon} style={{ color: s.color, fontSize: 20, marginBottom: 10, display: 'block' }} />
              <div style={{ fontWeight: 800, fontSize: 24, color: '#0f172a' }}>{s.val}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* sections */}
        {[
          {
            title: 'Content Management',
            icon: 'fa-solid fa-file-lines',
            desc: 'Add, edit, delete study sheets, tests, and announcements.',
            features: ['Edit any sheet', 'Delete flagged content', 'Pin announcements', 'Manage test banks'],
          },
          {
            title: 'Submission Review Queue',
            icon: 'fa-solid fa-inbox',
            desc: 'Review student-submitted study guides. Approve to publish, reject to return with feedback.',
            features: ['GET /api/courses/requested (flagged courses)', 'Review submissions queue', 'Approve / reject with message', 'Auto-publish on approval'],
          },
          {
            title: 'User Management',
            icon: 'fa-solid fa-users',
            desc: 'View registered students, change roles, and manage accounts.',
            features: ['List all users', 'Promote to admin', 'Suspend accounts', 'View activity per user'],
          },
          {
            title: 'Analytics',
            icon: 'fa-solid fa-chart-bar',
            desc: 'See which sheets and tests are most used. Track engagement over time.',
            features: ['Most starred sheets', 'Most active students', 'Course coverage gaps', 'Weekly upload trends'],
          },
        ].map(s => (
          <PlaceholderSection
            key={s.title}
            icon={s.icon}
            title={`${s.title} — Coming Soon`}
            description={s.desc}
            features={s.features}
          />
        ))}
      </div>
    </div>
  )
}

// ── UPLOAD SHEET ──────────────────────────────────────────────────
export function UploadSheetPage() {
  const navigate = useNavigate()
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [course,  setCourse]  = useState('')
  const [submitting, setSub]  = useState(false)

  // TODO: real implementation
  // const courses = await fetch('/api/courses/schools') → populate dropdown
  // const handleSubmit = async () => {
  //   const res = await fetch('/api/sheets', {
  //     method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  //     body: JSON.stringify({ title, content, courseId: course }),
  //   })
  //   if (res.ok) navigate('/sheets')
  // }

  const MOCK_COURSES = [
    { id: 1, code: 'CMSC131', name: 'Introduction to Object Oriented Programming' },
    { id: 2, code: 'CMSC132', name: 'Object Oriented Programming II' },
    { id: 3, code: 'MATH140', name: 'Calculus I' },
  ]

  const handleSubmit = () => {
    if (!title || !content || !course) return alert('Fill out all fields!')
    setSub(true)
    setTimeout(() => { setSub(false); navigate('/sheets') }, 1200)
  }

  return (
    <div style={PAGE_STYLE}>
      <TopNav backLabel="← Sheets" backTo="/sheets" />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
          <i className="fa-solid fa-upload" style={{ color: '#3b82f6', marginRight: 10 }} />
          Upload a Study Sheet
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
          Share your notes with classmates. All sheets are credited to you.
        </p>

        <div style={CARD}>
          {[
            { label: 'Title', note: 'e.g. "CMSC131 Final Exam Cheatsheet"',
              el: <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Sheet title" style={INPUT} /> },
            { label: 'Course',
              el: (
                <select value={course} onChange={e => setCourse(e.target.value)} style={INPUT}>
                  <option value="">Select a course…</option>
                  {MOCK_COURSES.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  {/* TODO: populate from GET /api/courses/schools */}
                </select>
              )},
            { label: 'Content', note: 'Markdown supported — # Headings, **bold**, `code`',
              el: (
                <textarea
                  value={content} onChange={e => setContent(e.target.value)}
                  placeholder={'# Sheet Title\n\n## Topic 1\n\nYour notes here…'}
                  rows={12}
                  style={{ ...INPUT, fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
                />
              )},
          ].map(f => (
            <div key={f.label} style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>
                {f.label}
                {f.note && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>{f.note}</span>}
              </label>
              {f.el}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => navigate('/sheets')} style={{
              padding: '10px 20px', border: '1px solid #e2e8f0',
              borderRadius: 10, background: '#fff', color: '#64748b',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting} style={{
              padding: '10px 28px', background: submitting ? '#93c5fd' : '#3b82f6',
              border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}>
              {submitting ? '⏳ Uploading…' : 'Publish Sheet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

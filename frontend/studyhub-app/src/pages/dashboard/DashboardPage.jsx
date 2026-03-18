// DashboardPage owns the authenticated summary surface for the current user and keeps dashboard polling local.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import {
  IconNotes,
  IconProfile,
  IconSheets,
  IconStar,
  IconTests,
  IconUpload,
} from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function summaryCard(label, value, helper, accent) {
  return {
    label,
    value,
    helper,
    accent,
  }
}

function formatJoinedDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function EmptyState({ title, body, actionLabel, actionTo }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        padding: '30px 24px',
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{title}</div>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.7 }}>{body}</p>
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 16px',
            borderRadius: 10,
            background: '#3b82f6',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ height: 132, borderRadius: 18, background: '#dbe4f0', opacity: 0.6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} style={{ height: 112, borderRadius: 16, background: '#dbe4f0', opacity: 0.55 }} />
        ))}
      </div>
      <div style={{ height: 260, borderRadius: 18, background: '#dbe4f0', opacity: 0.45 }} />
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, clearSession, signOut } = useSession()
  const layout = useResponsiveAppLayout()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSummary = async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/dashboard/summary`, {
        headers: authHeaders(),
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        apply(() => {
          setError(getApiErrorMessage(data, 'You do not have permission to view your dashboard.'))
          setLoading(false)
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load your dashboard.'))
      }

      apply(() => {
        setSummary(data)
        setError('')
        setLoading(false)
      })
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return

      apply(() => {
        setError(loadError.message || 'Could not load your dashboard.')
        setLoading(false)
      })
    }
  }

  useLivePolling(loadSummary, {
    enabled: Boolean(user),
    intervalMs: 45000,
  })

  const cards = useMemo(() => {
    const stats = summary?.stats || {}
    return [
      summaryCard('Courses', stats.courseCount || 0, 'Active enrollments', '#3b82f6'),
      summaryCard('Sheets', stats.sheetCount || 0, 'Sheets you uploaded', '#10b981'),
      summaryCard('Stars', stats.starCount || 0, 'Saved sheets', '#f59e0b'),
    ]
  }, [summary])

  const hero = summary?.hero || {}
  const courses = summary?.courses || []
  const recentSheets = summary?.recentSheets || []

  const navActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => void signOut().then(() => navigate('/'))}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid #334155',
          background: 'transparent',
          color: '#94a3b8',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        Sign Out
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Dashboard', to: '/dashboard' }]} hideTabs actions={navActions} />
      <div
        style={{
          ...pageShell('app'),
          display: 'grid',
          gridTemplateColumns: layout.columns.appTwoColumn,
          gap: 20,
        }}
      >
        <AppSidebar mode={layout.sidebarMode} />

        <main style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              borderRadius: 18,
              border: '1px solid #1e3a5f',
              padding: '28px 30px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700, marginBottom: 8 }}>
                SESSION READY
              </div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>
                Welcome back, {hero.username || user?.username || 'Student'}.
              </h1>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
                Joined {formatJoinedDate(hero.createdAt || user?.createdAt)}.
                {' '}
                {hero.emailVerified
                  ? 'Your email is verified and your account is fully protected.'
                  : 'Finish verifying your email in Settings to unlock password reset and 2-step verification.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                to="/settings?tab=courses"
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Manage Courses
              </Link>
              <Link
                to="/sheets/upload"
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Upload Sheet
              </Link>
            </div>
          </section>

          {error ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 14,
                padding: '12px 14px',
                color: '#b91c1c',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  setError('')
                  void loadSummary()
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: '#fff',
                  color: '#b91c1c',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {loading && !summary ? (
            <DashboardSkeleton />
          ) : (
            <>
              <section style={{ display: 'grid', gridTemplateColumns: layout.isCompact ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                {cards.map((card) => (
                  <div
                    key={card.label}
                    style={{
                      background: '#fff',
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      padding: '18px 18px 20px',
                      boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', marginBottom: 10 }}>
                      {card.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: card.accent, marginBottom: 4 }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{card.helper}</div>
                  </div>
                ))}
              </section>

              <section
                style={{
                  display: 'grid',
                  gridTemplateColumns: layout.isCompact ? 'minmax(0, 1fr)' : '1.1fr 0.9fr',
                  gap: 16,
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    border: '1px solid #e2e8f0',
                    padding: '20px 22px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Recent Sheets</h2>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Rendered from the new summary endpoint for a faster first load.
                      </div>
                    </div>
                    <Link to="/sheets" style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textDecoration: 'none' }}>
                      Browse all
                    </Link>
                  </div>

                  {recentSheets.length === 0 ? (
                    <EmptyState
                      title="No sheets yet"
                      body="Once you or your classmates upload sheets in your enrolled courses, they will show up here."
                      actionLabel="Upload your first sheet"
                      actionTo="/sheets/upload"
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {recentSheets.map((sheet) => (
                        <Link
                          key={sheet.id}
                          to={`/sheets/${sheet.id}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '42px 1fr auto',
                            gap: 12,
                            alignItems: 'center',
                            padding: '14px 16px',
                            borderRadius: 14,
                            border: '1px solid #e2e8f0',
                            textDecoration: 'none',
                            background: '#f8fafc',
                          }}
                        >
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 12,
                              background: '#eff6ff',
                              color: '#2563eb',
                              display: 'grid',
                              placeItems: 'center',
                            }}
                          >
                            <IconSheets size={18} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                              {sheet.title}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {sheet.course?.code || 'General'} · by {sheet.author?.username || 'unknown'}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
                            {sheet.stars || 0} stars
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 18,
                      border: '1px solid #e2e8f0',
                      padding: '20px 22px',
                    }}
                  >
                    <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Course Focus</h2>
                    {courses.length === 0 ? (
                      <EmptyState
                        title="No courses selected"
                        body="Add your courses so StudyHub can personalize your feed, sheets, and dashboard."
                        actionLabel="Choose courses"
                        actionTo="/settings?tab=courses"
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {courses.map((course) => (
                          <div
                            key={course.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              padding: '12px 14px',
                              borderRadius: 12,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{course.code}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{course.name}</div>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {course.school?.short || course.school?.name || 'School'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 18,
                      border: '1px solid #e2e8f0',
                      padding: '20px 22px',
                    }}
                  >
                    <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Quick Actions</h2>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {[
                        { icon: IconSheets, label: 'Browse sheets', to: '/sheets', tone: '#2563eb' },
                        { icon: IconUpload, label: 'Upload a new sheet', to: '/sheets/upload', tone: '#7c3aed' },
                        { icon: IconTests, label: 'Open practice tests', to: '/tests', tone: '#059669' },
                        { icon: IconNotes, label: 'Review your notes', to: '/notes', tone: '#db2777' },
                        { icon: IconProfile, label: 'Update settings', to: '/settings', tone: '#475569' },
                      ].map((action) => (
                        <Link
                          key={action.to}
                          to={action.to}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 14px',
                            borderRadius: 12,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#0f172a',
                            textDecoration: 'none',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          <span style={{ color: action.tone, display: 'grid', placeItems: 'center' }}>
                            <action.icon size={16} />
                          </span>
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

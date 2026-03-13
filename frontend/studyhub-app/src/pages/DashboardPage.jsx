import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LogoDark from '../assets/logo-dark.svg'

const QUICK_ACTIONS = [
  {
    iconClass: 'fa-solid fa-file-lines',
    label: 'Study Sheets',
    to: '/study-sheets',
    toneClass: 'dashboard-action--blue'
  },
  {
    iconClass: 'fa-solid fa-pen-to-square',
    label: 'Practice Tests',
    to: '/practice-tests',
    toneClass: 'dashboard-action--green'
  },
  {
    iconClass: 'fa-solid fa-scroll',
    label: 'Syllabus',
    to: '/syllabus',
    toneClass: 'dashboard-action--amber'
  },
  {
    iconClass: 'fa-solid fa-scale-balanced',
    label: 'Guidelines',
    to: '/guidelines',
    toneClass: 'dashboard-action--slate'
  }
]

const RECOMMENDATION_COPY = {
  collaborative: 'These picks are based on students with similar enrollments.',
  popular: 'No overlap data yet, so this shows currently popular courses.',
  none: 'Add more courses to unlock smarter recommendations.'
}

export default function DashboardPage() {
  const [user, setUser] = useState(() => getStoredUser())
  const [loading, setLoading] = useState(true)
  const [recommendations, setRecommendations] = useState([])
  const [recommendationType, setRecommendationType] = useState('none')
  const [recommendationsLoading, setRecommendationsLoading] = useState(true)

  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')

    if (!token) {
      navigate('/login')
      return
    }

    let isMounted = true

    async function loadDashboard() {
      try {
        const meResponse = await fetch('http://localhost:4000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!meResponse.ok) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          navigate('/login')
          return
        }

        const meData = await meResponse.json()

        if (!isMounted) {
          return
        }

        setUser(meData)
        localStorage.setItem('user', JSON.stringify(meData))

        const recommendationResponse = await fetch(
          'http://localhost:4000/api/courses/recommendations',
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )

        if (!isMounted) {
          return
        }

        if (recommendationResponse.ok) {
          const recommendationData = await recommendationResponse.json()
          setRecommendations(
            Array.isArray(recommendationData.recommendations)
              ? recommendationData.recommendations
              : []
          )
          setRecommendationType(
            typeof recommendationData.type === 'string' ? recommendationData.type : 'none'
          )
        } else {
          setRecommendations([])
          setRecommendationType('none')
        }
      } catch {
        if (isMounted) {
          setRecommendations([])
          setRecommendationType('none')
        }
      } finally {
        if (isMounted) {
          setRecommendationsLoading(false)
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [navigate])

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/')
  }

  const courses = user?.enrollments || []
  const courseCount = courses.length
  const recommendationCopy =
    RECOMMENDATION_COPY[recommendationType] || RECOMMENDATION_COPY.none

  const joinedDateLabel = useMemo(() => {
    if (!user?.createdAt) {
      return 'Unknown'
    }

    const joinedDate = new Date(user.createdAt)

    if (Number.isNaN(joinedDate.getTime())) {
      return 'Unknown'
    }

    return joinedDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
  }, [user?.createdAt])

  if (loading) {
    return (
      <div className="dashboard-page">
        <Navbar user={user} onLogout={handleLogout} />
        <div className="dashboard-loading">
          <div className="dashboard-loading-content animate-fadeIn">
            <div className="dashboard-loading-icon">
              <img src={LogoDark} height="36" alt="StudyHub" />
            </div>
            <p>Loading your dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <Navbar user={user} onLogout={handleLogout} />

      <div className="dashboard-container">
        <section className="dashboard-banner animate-fadeIn">
          <div>
            <h1 className="dashboard-banner-title">
              Welcome back, {user?.username || 'Student'}.
            </h1>
            <p className="dashboard-banner-subtitle">
              {courseCount > 0
                ? `You are currently enrolled in ${courseCount} course${
                    courseCount > 1 ? 's' : ''
                  }.`
                : 'Add your courses to personalize your dashboard and recommendations.'}
            </p>
          </div>

          <Link to="/register" className="dashboard-banner-cta">
            {courseCount > 0 ? 'Manage Courses' : 'Add Courses'}
          </Link>
        </section>

        <section className="dashboard-section animate-fadeUp">
          <h2 className="dashboard-title">Quick Actions</h2>
          <div className="dashboard-actions-grid">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.label} to={action.to} className="dashboard-action-link">
                <article className={`dashboard-action-card ${action.toneClass}`}>
                  <div className="dashboard-action-icon" aria-hidden="true">
                    <i className={`${action.iconClass} dashboard-icon dashboard-icon-lg`} />
                  </div>
                  <p className="dashboard-action-label">{action.label}</p>
                </article>
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-section animate-fadeUp">
          <div className="dashboard-section-head">
            <h2 className="dashboard-title dashboard-title-no-margin">My Courses</h2>
            <Link to="/register" className="dashboard-text-link">
              Manage courses
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="dashboard-empty-state">
              <div className="dashboard-empty-icon" aria-hidden="true">
                <i className="fa-solid fa-graduation-cap dashboard-icon dashboard-icon-lg" />
              </div>
              <p>No courses found yet.</p>
              <Link to="/register" className="dashboard-primary-button">
                Select courses
              </Link>
            </div>
          ) : (
            <div className="dashboard-courses-grid">
              {courses.map((enrollment) => {
                const course = enrollment.course || {}
                const school = course.school || {}

                return (
                  <article key={enrollment.id} className="dashboard-course-card">
                    <p className="dashboard-course-school">{school.short || school.name || 'School'}</p>
                    <p className="dashboard-course-name">{course.name || 'Untitled course'}</p>
                    <p className="dashboard-course-code">
                      {course.code ? `Code: ${course.code}` : 'Code unavailable'}
                    </p>

                    <div className="dashboard-course-links">
                      <Link
                        to={`/study-sheets?courseId=${course.id}`}
                        className="dashboard-chip-link dashboard-chip-link--blue"
                      >
                        Study sheets
                      </Link>
                      <Link
                        to="/practice-tests"
                        className="dashboard-chip-link dashboard-chip-link--green"
                      >
                        Practice tests
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="dashboard-section animate-fadeUp">
          <div className="dashboard-section-head">
            <h2 className="dashboard-title dashboard-title-no-margin">Recommendations</h2>
            <span className="dashboard-pill">{recommendationType}</span>
          </div>

          <p className="dashboard-muted-note">{recommendationCopy}</p>

          {recommendationsLoading ? (
            <div className="dashboard-empty-state">
              <p>Loading recommendations...</p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="dashboard-empty-state">
              <div className="dashboard-empty-icon" aria-hidden="true">
                <i className="fa-solid fa-lightbulb dashboard-icon dashboard-icon-lg" />
              </div>
              <p>No recommendations available yet.</p>
            </div>
          ) : (
            <div className="dashboard-courses-grid">
              {recommendations.map((course) => (
                <article key={course.id} className="dashboard-course-card">
                  <p className="dashboard-course-school">
                    {course.school?.short || course.school?.name || 'School'}
                  </p>
                  <p className="dashboard-course-name">{course.name || 'Untitled course'}</p>
                  <p className="dashboard-course-code">
                    {course.code ? `Code: ${course.code}` : 'Code unavailable'}
                  </p>

                  <div className="dashboard-course-links">
                    <Link
                      to={`/study-sheets?courseId=${course.id}`}
                      className="dashboard-chip-link dashboard-chip-link--blue"
                    >
                      View sheets
                    </Link>
                    <span className="dashboard-chip-link dashboard-chip-link--green dashboard-chip-link-static">
                      Score {course.score || 0}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-account-card animate-fadeUp">
          <h3 className="dashboard-account-title">Account Overview</h3>

          <div className="dashboard-account-grid">
            <div>
              <p className="dashboard-label">Username</p>
              <p className="dashboard-value">{user?.username || 'Unknown'}</p>
            </div>
            <div>
              <p className="dashboard-label">Role</p>
              <p className="dashboard-value dashboard-value-capitalize">
                {user?.role || 'student'}
              </p>
            </div>
            <div>
              <p className="dashboard-label">Joined</p>
              <p className="dashboard-value">{joinedDateLabel}</p>
            </div>
            <div>
              <p className="dashboard-label">Enrolled Courses</p>
              <p className="dashboard-value">{courseCount}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function getStoredUser() {
  const rawUser = localStorage.getItem('user')

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

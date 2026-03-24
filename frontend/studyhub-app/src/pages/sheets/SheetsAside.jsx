/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsAside.jsx — Quick-view sidebar for the sheets page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'

export default function SheetsAside({
  sheetsTotal, catalogCount, enrollmentCount,
  popularCourses, recentCourses, activeCourseId, onCourseFilter,
}) {
  const handleCourseClick = (course) => {
    const isActive = String(course.id) === String(activeCourseId)
    const schoolId = course.schoolId || course.school?.id || ''
    onCourseFilter(isActive ? '' : course.id, isActive ? '' : schoolId)
  }

  return (
    <aside className="feed-aside sheets-page__aside">
      <section className="sh-card">
        <h2 className="sh-card-title">Quick view</h2>
        <p className="sh-card-helper">Live index context</p>
        <div className="sheets-page__aside-stats">
          <div>{sheetsTotal} sheets found</div>
          <div>{catalogCount} schools available</div>
          <div>{enrollmentCount} courses in your profile</div>
        </div>
        {enrollmentCount === 0 ? (
          <Link to="/settings?tab=courses" className="sh-btn sh-btn--primary sh-btn--sm" style={{ marginTop: 10 }}>
            Add your courses
          </Link>
        ) : null}
      </section>

      {recentCourses.length > 0 ? (
        <section className="sh-card">
          <h2 className="sh-card-title">Recent courses</h2>
          <p className="sh-card-helper">Jump back to a course you browsed</p>
          <div className="sheets-page__course-chips">
            {recentCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={`sh-chip sheets-page__course-chip ${String(course.id) === String(activeCourseId) ? 'sh-chip--active' : ''}`}
                onClick={() => handleCourseClick(course)}
              >
                {course.code}
                {course.schoolLabel ? <span className="sheets-page__course-chip-school">{course.schoolLabel}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {popularCourses.length > 0 ? (
        <section className="sh-card">
          <h2 className="sh-card-title">Popular courses</h2>
          <p className="sh-card-helper">Most active by sheet count</p>
          <div className="sheets-page__popular-list">
            {popularCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={`sheets-page__popular-row ${String(course.id) === String(activeCourseId) ? 'is-active' : ''}`}
                onClick={() => handleCourseClick(course)}
              >
                <span className="sheets-page__popular-code">{course.code}</span>
                <span className="sheets-page__popular-school">{course.school?.short || course.school?.name || ''}</span>
                <span className="sheets-page__popular-count">{course.sheetCount}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sh-card">
        <h2 className="sh-card-title">How to use</h2>
        <p className="sheets-page__aside-copy">
          Filter by school or course to find what you need. Star sheets you want to revisit, or fork one to build on it.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <Link to="/sheets/upload" className="sh-btn sh-btn--primary sh-btn--sm">
            Upload a sheet
          </Link>
          <Link to="/feed" className="sh-btn sh-btn--secondary sh-btn--sm">
            Back to feed
          </Link>
        </div>
      </section>
    </aside>
  )
}

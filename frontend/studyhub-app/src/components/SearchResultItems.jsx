import { IconSheets, IconUsers, IconSchool } from './Icons'
import { Highlight, styles } from './searchModalConstants'

export function SheetResults({ sheets, query, activeIndex, setActiveIndex, navigateToItem }) {
  if (sheets.length === 0) return null
  return (
    <div>
      <div style={styles.sectionLabel}>
        <IconSheets size={13} /> Sheets
      </div>
      {sheets.map((sheet, i) => {
        const flatIdx = i
        return (
          <div
            key={`s-${sheet.id}`}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'sheet', data: sheet })}
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <div style={styles.resultTitle}><Highlight text={sheet.title} query={query} /></div>
            <div style={styles.resultMeta}>
              {sheet.course?.code} &middot; by {sheet.author?.username}
              {sheet.stars > 0 && <span> &middot; {sheet.stars} stars</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CourseResults({ courses, sheetsCount, query, activeIndex, setActiveIndex, navigateToItem }) {
  if (courses.length === 0) return null
  return (
    <div>
      <div style={styles.sectionLabel}>
        <IconSchool size={13} /> Courses
      </div>
      {courses.map((course, i) => {
        const flatIdx = sheetsCount + i
        return (
          <div
            key={`c-${course.id}`}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'course', data: course })}
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <div style={styles.resultTitle}><Highlight text={`${course.code} — ${course.name}`} query={query} /></div>
            <div style={styles.resultMeta}>{course.school?.name}</div>
          </div>
        )
      })}
    </div>
  )
}

export function UserResults({ users, sheetsCount, coursesCount, query, activeIndex, setActiveIndex, navigateToItem }) {
  if (users.length === 0) return null
  return (
    <div>
      <div style={styles.sectionLabel}>
        <IconUsers size={13} /> Users
      </div>
      {users.map((user, i) => {
        const flatIdx = sheetsCount + coursesCount + i
        return (
          <div
            key={`u-${user.id}`}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? '#f1f5f9' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'user', data: user })}
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={styles.userAvatar}>
                {user.username?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={styles.resultTitle}><Highlight text={user.username} query={query} /></div>
                <div style={styles.resultMeta}>{user.role}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

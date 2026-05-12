import { IconSheets, IconNotes, IconUsers, IconSchool, IconClock } from '../Icons'
import UserAvatar from '../UserAvatar'
import { Highlight, TypeChip } from './searchModalComponents'
import { styles } from './searchModalConstants'

function IconGroups({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

/** Keyboard handler for interactive search result items */
function handleResultKeyDown(e, action) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action()
  }
}

/** Format an ISO timestamp as a short relative stamp. */
function shortTimeAgo(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 86400 * 365) return `${Math.floor(seconds / (86400 * 30))}mo ago`
  return `${Math.floor(seconds / (86400 * 365))}y ago`
}

function StampMeta({ value }) {
  const stamp = shortTimeAgo(value)
  if (!stamp) return null
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title={value ? new Date(value).toLocaleString() : undefined}
    >
      <IconClock size={11} /> {stamp}
    </span>
  )
}

export function SheetResults({ sheets, query, activeIndex, setActiveIndex, navigateToItem }) {
  if (sheets.length === 0) return null
  return (
    <div role="group" aria-label="Sheet results">
      <div style={styles.sectionLabel} aria-hidden="true">
        <IconSheets size={13} /> Sheets
      </div>
      {sheets.map((sheet, i) => {
        const flatIdx = i
        const label = `${sheet.title}${sheet.course?.code ? `, ${sheet.course.code}` : ''}${sheet.author?.username ? `, by ${sheet.author.username}` : ''}`
        const stamp = sheet.updatedAt || sheet.createdAt
        return (
          <div
            key={`s-${sheet.id}`}
            role="option"
            aria-selected={activeIndex === flatIdx}
            aria-label={label}
            tabIndex={-1}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'sheet', data: sheet })}
            onKeyDown={(e) =>
              handleResultKeyDown(e, () => navigateToItem({ type: 'sheet', data: sheet }))
            }
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <span style={styles.resultIcon} aria-hidden="true">
              <IconSheets size={14} />
            </span>
            <div style={styles.resultBody}>
              <div style={styles.resultTitle}>
                <span style={styles.resultTitleText}>
                  <Highlight text={sheet.title} query={query} />
                </span>
                <TypeChip label="Sheet" />
              </div>
              <div style={styles.resultMeta}>
                {sheet.course?.code && <span>{sheet.course.code}</span>}
                {sheet.author?.username && <span> &middot; by {sheet.author.username}</span>}
                {sheet.stars > 0 && <span> &middot; {sheet.stars} stars</span>}
                {stamp && (
                  <>
                    {' '}
                    &middot; <StampMeta value={stamp} />
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function NoteResults({
  notes,
  sheetsCount,
  query,
  activeIndex,
  setActiveIndex,
  navigateToItem,
}) {
  if (notes.length === 0) return null
  return (
    <div role="group" aria-label="Note results">
      <div style={styles.sectionLabel} aria-hidden="true">
        <IconNotes size={13} /> Notes
      </div>
      {notes.map((note, i) => {
        const flatIdx = sheetsCount + i
        const label = `${note.title}${note.course?.code ? `, ${note.course.code}` : ''}${note.author?.username ? `, by ${note.author.username}` : ''}`
        const stamp = note.updatedAt || note.createdAt
        return (
          <div
            key={`n-${note.id}`}
            role="option"
            aria-selected={activeIndex === flatIdx}
            aria-label={label}
            tabIndex={-1}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'note', data: note })}
            onKeyDown={(e) =>
              handleResultKeyDown(e, () => navigateToItem({ type: 'note', data: note }))
            }
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <span style={styles.resultIcon} aria-hidden="true">
              <IconNotes size={14} />
            </span>
            <div style={styles.resultBody}>
              <div style={styles.resultTitle}>
                <span style={styles.resultTitleText}>
                  <Highlight text={note.title} query={query} />
                </span>
                <TypeChip label="Note" />
              </div>
              <div style={styles.resultMeta}>
                {note.course?.code && <span>{note.course.code}</span>}
                {note.author?.username && <span> &middot; by {note.author.username}</span>}
                {stamp && (
                  <>
                    {' '}
                    &middot; <StampMeta value={stamp} />
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CourseResults({
  courses,
  sheetsCount,
  query,
  activeIndex,
  setActiveIndex,
  navigateToItem,
}) {
  if (courses.length === 0) return null
  return (
    <div role="group" aria-label="Course results">
      <div style={styles.sectionLabel} aria-hidden="true">
        <IconSchool size={13} /> Courses
      </div>
      {courses.map((course, i) => {
        const flatIdx = sheetsCount + i
        const label = `${course.code} ${course.name}${course.school?.name ? `, ${course.school.name}` : ''}`
        return (
          <div
            key={`c-${course.id}`}
            role="option"
            aria-selected={activeIndex === flatIdx}
            aria-label={label}
            tabIndex={-1}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'course', data: course })}
            onKeyDown={(e) =>
              handleResultKeyDown(e, () => navigateToItem({ type: 'course', data: course }))
            }
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <span style={styles.resultIcon} aria-hidden="true">
              <IconSchool size={14} />
            </span>
            <div style={styles.resultBody}>
              <div style={styles.resultTitle}>
                <span style={styles.resultTitleText}>
                  <Highlight text={`${course.code} — ${course.name}`} query={query} />
                </span>
                <TypeChip label="Course" />
              </div>
              <div style={styles.resultMeta}>{course.school?.name}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function UserResults({
  users,
  sheetsCount,
  coursesCount,
  query,
  activeIndex,
  setActiveIndex,
  navigateToItem,
}) {
  if (users.length === 0) return null
  return (
    <div role="group" aria-label="User results">
      <div style={styles.sectionLabel} aria-hidden="true">
        <IconUsers size={13} /> Users
      </div>
      {users.map((user, i) => {
        const flatIdx = sheetsCount + coursesCount + i
        const label = `${user.username}${user.role ? `, ${user.role}` : ''}`
        return (
          <div
            key={`u-${user.id}`}
            role="option"
            aria-selected={activeIndex === flatIdx}
            aria-label={label}
            tabIndex={-1}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'user', data: user })}
            onKeyDown={(e) =>
              handleResultKeyDown(e, () => navigateToItem({ type: 'user', data: user }))
            }
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <span style={{ flexShrink: 0 }} aria-hidden="true">
              <UserAvatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                role={user.role}
                size={28}
              />
            </span>
            <div style={styles.resultBody}>
              <div style={styles.resultTitle}>
                <span style={styles.resultTitleText}>
                  <Highlight text={user.username} query={query} />
                </span>
                <TypeChip label="User" />
              </div>
              <div style={styles.resultMeta}>{user.role || 'student'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GroupResults({
  groups,
  sheetsCount,
  coursesCount,
  usersCount,
  query,
  activeIndex,
  setActiveIndex,
  navigateToItem,
}) {
  if (groups.length === 0) return null
  return (
    <div role="group" aria-label="Group results">
      <div style={styles.sectionLabel} aria-hidden="true">
        <IconGroups size={13} /> Groups
      </div>
      {groups.map((group, i) => {
        const flatIdx = sheetsCount + coursesCount + usersCount + i
        const memberCount = group._count?.members ?? 0
        const label = `${group.name}, ${memberCount} member${memberCount !== 1 ? 's' : ''}${group.course?.code ? `, ${group.course.code}` : ''}`
        return (
          <div
            key={`g-${group.id}`}
            role="option"
            aria-selected={activeIndex === flatIdx}
            aria-label={label}
            tabIndex={-1}
            style={{
              ...styles.resultItem,
              background: activeIndex === flatIdx ? 'var(--sh-slate-100, #f1f5f9)' : 'transparent',
            }}
            onClick={() => navigateToItem({ type: 'group', data: group })}
            onKeyDown={(e) =>
              handleResultKeyDown(e, () => navigateToItem({ type: 'group', data: group }))
            }
            onMouseEnter={() => setActiveIndex(flatIdx)}
          >
            <span style={styles.resultIcon} aria-hidden="true">
              <IconGroups size={14} />
            </span>
            <div style={styles.resultBody}>
              <div style={styles.resultTitle}>
                <span style={styles.resultTitleText}>
                  <Highlight text={group.name} query={query} />
                </span>
                <TypeChip label="Group" />
              </div>
              <div style={styles.resultMeta}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
                {group.course?.code && <span> &middot; {group.course.code}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

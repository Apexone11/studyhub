/* ═══════════════════════════════════════════════════════════════════════════
 * GroupListFilters.jsx — Search and filter bar for group list
 *
 * Provides search input, "My Groups" toggle, and course filter select.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { styles } from './studyGroupsStyles'

export default function GroupListFilters({
  search, courseId, mineOnly, allCourses,
  onSearch, onToggleMine, onCourseFilter,
}) {
  return (
    <section style={styles.filterSection}>
      <input
        type="text"
        placeholder="Search study groups..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        style={styles.searchInput}
      />

      <div style={styles.filterRow}>
        <button
          onClick={onToggleMine}
          style={{
            ...styles.filterChip,
            ...(mineOnly ? styles.filterChipActive : {}),
          }}
        >
          My Groups
        </button>

        <select
          value={courseId}
          onChange={(e) => onCourseFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Courses</option>
          {allCourses?.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

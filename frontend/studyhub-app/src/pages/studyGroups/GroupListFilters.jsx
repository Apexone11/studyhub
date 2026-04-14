/* ═══════════════════════════════════════════════════════════════════════════
 * GroupListFilters.jsx — Search and filter bar for group list
 *
 * Provides search input, "My Groups" toggle, and course filter select.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { styles } from './studyGroupsStyles'

export default function GroupListFilters({
  search,
  schoolId,
  courseId,
  mineOnly,
  allSchools,
  allCourses,
  onSearch,
  onToggleMine,
  onSchoolFilter,
  onCourseFilter,
}) {
  const scopedCourses = schoolId
    ? allCourses?.filter((course) => String(course.schoolId) === String(schoolId))
    : allCourses

  return (
    <section data-tutorial="groups-filters" style={styles.filterSection}>
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
          value={schoolId}
          onChange={(e) => onSchoolFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Schools</option>
          {allSchools?.map((school) => (
            <option key={school.id} value={school.id}>
              {school.short} — {school.name}
            </option>
          ))}
        </select>

        <select
          value={courseId}
          onChange={(e) => onCourseFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Courses</option>
          {scopedCourses?.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} — {course.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

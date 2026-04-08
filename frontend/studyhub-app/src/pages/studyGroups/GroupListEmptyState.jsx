/* ═══════════════════════════════════════════════════════════════════════════
 * GroupListEmptyState.jsx — Empty state for group list
 *
 * Shows appropriate message when no groups are found based on filters applied.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { styles } from './studyGroupsStyles'

export default function GroupListEmptyState({ search, mineOnly, selectedCourse, onClearFilters }) {
  let message = 'No study groups found.'
  if (search) {
    message = `No groups match "${search}".`
  } else if (mineOnly) {
    message = 'You have not joined any study groups yet.'
  } else if (selectedCourse) {
    message = `No groups found for ${selectedCourse.name}.`
  }

  return (
    <section style={styles.emptyState}>
      <p style={styles.emptyStateMessage}>{message}</p>
      {(search || mineOnly || selectedCourse) && (
        <button onClick={onClearFilters} style={styles.emptyStateClearBtn}>
          Clear filters
        </button>
      )}
    </section>
  )
}

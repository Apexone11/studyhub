/* ═══════════════════════════════════════════════════════════════════════════
 * GroupCard.jsx — Individual group card in the list
 *
 * Displays group name, description, privacy, member count, and course.
 * Shows "Joined" label for member groups or "Join" button.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { getPrivacyLabel, truncateText } from './studyGroupsHelpers'
import { styles } from './studyGroupsStyles'

export default function GroupCard({ group, onJoin, onNavigateDetail }) {
  const isMember = group.isMember

  return (
    <div
      style={styles.card}
      onClick={onNavigateDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onNavigateDetail()
        }
      }}
    >
      <h3 style={styles.cardTitle}>{group.name}</h3>
      <p style={styles.cardDesc}>
        {truncateText(group.description || '', 100)}
      </p>

      <div style={styles.cardMeta}>
        <span style={styles.privacyBadgeSmall}>
          {getPrivacyLabel(group.privacy)}
        </span>
        <span style={styles.memberCountSmall}>
          {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
        </span>
        {group.courseName && (
          <span style={styles.courseTagSmall}>
            {group.courseName}
          </span>
        )}
      </div>

      <div style={styles.cardFooter}>
        {isMember ? (
          <span style={styles.joinedLabel}>Joined</span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onJoin()
            }}
            style={styles.joinBtnSmall}
            aria-label={`Join ${group.name} study group`}
          >
            Join
          </button>
        )}
      </div>
    </div>
  )
}

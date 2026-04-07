/* ═══════════════════════════════════════════════════════════════════════════
 * GroupCard.jsx — Individual group card in the list
 *
 * Displays group name, description, privacy, member count, and course.
 * Shows "Joined" label for member groups or "Join" button.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { getPrivacyLabel, truncateText } from './studyGroupsHelpers'
import { styles } from './studyGroupsStyles'

export default function GroupCard({ group, onJoin, onNavigateDetail }) {
  const { isMember } = group

  return (
    <div
      style={{
        ...styles.card,
        ...(isMember ? { borderLeft: '3px solid var(--sh-brand)' } : {}),
      }}
      onClick={onNavigateDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onNavigateDetail()
        }
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
        {/* Group avatar initial */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: group.avatarUrl
              ? 'transparent'
              : 'linear-gradient(135deg, var(--sh-brand), var(--sh-brand-accent))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {group.avatarUrl ? (
            <img
              src={group.avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>
              {group.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ ...styles.cardTitle, margin: 0 }}>{group.name}</h3>
          <p style={{ ...styles.cardDesc, margin: '4px 0 0' }}>
            {truncateText(group.description || '', 100)}
          </p>
        </div>
      </div>

      <div style={styles.cardMeta}>
        <span style={styles.privacyBadgeSmall}>{getPrivacyLabel(group.privacy)}</span>
        <span style={styles.memberCountSmall}>
          {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
        </span>
        {group.courseCode && <span style={styles.courseTagSmall}>{group.courseCode}</span>}
        {group.schoolShort && <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{group.schoolShort}</span>}
        {group.resourceCount > 0 && (
          <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            {group.resourceCount} resource{group.resourceCount === 1 ? '' : 's'}
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

/* ═══════════════════════════════════════════════════════════════════════════
 * GroupCard.jsx — Individual group card in the list
 *
 * Displays group name, description, privacy, member count, and course.
 * Shows "Joined" label for member groups or "Join" button.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { getPrivacyLabel, truncateText } from './studyGroupsHelpers'
import { resolveGroupImageUrl } from './studyGroupsHelpers'
import { styles } from './studyGroupsStyles'

export default function GroupCard({ group, onJoin, onNavigateDetail }) {
  const { isMember } = group
  const groupImageUrl = resolveGroupImageUrl(group.avatarUrl)
  const primaryMeta = group.courseCode || group.schoolShort || 'Open study space'

  return (
    <div
      style={{
        ...styles.card,
        ...(isMember
          ? { borderColor: 'var(--sh-brand-border)', boxShadow: '0 14px 28px rgba(37, 99, 235, 0.12)' }
          : {}),
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
      <div
        style={{
          position: 'relative',
          minHeight: 148,
          background: groupImageUrl
            ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.42))'
            : 'linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(124, 58, 237, 0.2))',
        }}
      >
        {groupImageUrl ? (
          <img
            src={groupImageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : null}

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 148,
            padding: '18px',
            background: groupImageUrl
              ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.62))'
              : 'linear-gradient(135deg, rgba(37, 99, 235, 0.98), rgba(124, 58, 237, 0.92))',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Study Group
            </div>
            <h3 style={{ ...styles.cardTitle, margin: 0, color: '#fff', fontSize: '1.08rem' }}>
              {group.name}
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 6 }}>
              {primaryMeta}
            </div>
          </div>

          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.24)',
              background: groupImageUrl ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 24px rgba(15, 23, 42, 0.18)',
            }}
          >
            {groupImageUrl ? (
              <img
                src={groupImageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                {group.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, padding: '18px 18px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={styles.privacyBadgeSmall}>{getPrivacyLabel(group.privacy)}</span>
          <span style={styles.memberCountSmall}>
            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
          </span>
        </div>

        <p style={{ ...styles.cardDesc, margin: 0, minHeight: 66 }}>
          {truncateText(
            group.description || 'Collaborate on sessions, resources, and discussion threads with your classmates.',
            135,
          )}
        </p>

        <div style={styles.cardMeta}>
          {group.courseCode ? <span style={styles.courseTagSmall}>{group.courseCode}</span> : null}
          {group.schoolShort ? <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>{group.schoolShort}</span> : null}
          {group.resourceCount > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              {group.resourceCount} resource{group.resourceCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {group.upcomingSessionCount > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              {group.upcomingSessionCount} upcoming session{group.upcomingSessionCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <div style={styles.cardFooter}>
        <span style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
          {isMember ? 'You are already in this group' : 'Open the group to see sessions, resources, and discussions'}
        </span>
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

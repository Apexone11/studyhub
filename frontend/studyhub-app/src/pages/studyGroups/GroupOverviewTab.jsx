import {
  formatRelativeTime,
  formatSessionTime,
  getSessionStatusLabel,
  truncateText,
} from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

export function GroupOverviewTab({ group, activities, activitiesLoading, upcomingSessions }) {
  if (!group) {
    return <div style={styles.loading}>Loading group information...</div>
  }

  const stats = [
    { label: 'Members', value: group.memberCount || 0, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { label: 'Resources', value: group.resourceCount || 0, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { label: 'Upcoming Sessions', value: group.upcomingSessionCount || 0, icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z' },
    { label: 'Discussions', value: group.discussionPostCount || 0, icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  ]

  const activityTypeLabels = {
    discussion: 'posted',
    resource: 'shared a resource',
    member_joined: 'joined the group',
  }

  return (
    <div style={styles.tabContainer}>
      {/* About section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>About this group</h2>
        <p style={{ fontSize: 'var(--type-base)', color: 'var(--sh-text)', lineHeight: '1.6' }}>
          {group.description || 'No description available.'}
        </p>
        {group.courseName && (
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ ...styles.badge, ...styles.badgeGreen }}>{group.courseName}</span>
          </div>
        )}
      </section>

      {/* Stats grid */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Stats</h2>
        <div style={styles.statsGrid}>
          {stats.map((stat, idx) => (
            <div key={idx} style={styles.statCard}>
              <div style={styles.statNumber}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming sessions preview */}
      {Array.isArray(upcomingSessions) && upcomingSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming Sessions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {upcomingSessions.map((s) => (
              <div key={s.id} style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--sh-soft)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--sh-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--type-sm)', fontWeight: 600, color: 'var(--sh-heading)' }}>{s.title}</div>
                  <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)', marginTop: 'var(--space-1)' }}>
                    {formatSessionTime(s.scheduledAt)}
                    {s.location ? ` -- ${s.location}` : ''}
                  </div>
                </div>
                <span style={{ ...styles.badge, ...styles.badgeGreen }}>{getSessionStatusLabel(s.status)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity feed */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Activity</h2>
        {activitiesLoading ? (
          <div style={styles.loading}>Loading activity...</div>
        ) : !activities || activities.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>No activity yet</div>
            <div style={styles.emptyText}>Activity will appear here as members post, share resources, and join.</div>
          </div>
        ) : (
          <div style={styles.recentActivityList}>
            {activities.map((activity, idx) => (
              <div key={idx} style={{
                ...styles.activityItem,
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                {activity.actor?.avatarUrl ? (
                  <img src={activity.actor.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--sh-brand-soft)', color: 'var(--sh-brand)',
                    display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                  }}>
                    {(activity.actor?.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--type-sm)' }}>
                    <strong style={{ color: 'var(--sh-heading)' }}>{activity.actor?.username || 'Unknown'}</strong>
                    {' '}{activityTypeLabels[activity.type] || activity.type}
                    {activity.title && activity.type !== 'member_joined' ? (
                      <> -- <span style={{ color: 'var(--sh-heading)' }}>{truncateText(activity.title, 40)}</span></>
                    ) : null}
                  </div>
                  <div style={styles.activityTime}>{formatRelativeTime(activity.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Created date */}
      <div style={{ textAlign: 'center', color: 'var(--sh-muted)', fontSize: 'var(--type-xs)', padding: 'var(--space-4)' }}>
        Created {formatRelativeTime(group.createdAt)}
      </div>
    </div>
  )
}

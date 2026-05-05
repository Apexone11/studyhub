import { Button, Message, MsgList, SectionCard, ToggleRow } from './settingsShared'
import { Skeleton } from '../../components/Skeleton'
import { usePreferences } from './settingsState'

/* Notification preferences modeled as a 2D grid (delivery channel × type),
 * matching GitHub / Linear / Notion. Each row is a topic; each column is a
 * delivery channel (Email or In-App). The flat key list still maps 1:1 to
 * the existing /api/settings/preferences contract — only the layout changed. */
const NOTIFICATION_TYPES = [
  {
    label: 'Mentions',
    description: 'When someone @-mentions you in a comment or post',
    channels: { email: 'emailMentions', inApp: 'inAppMentions' },
  },
  {
    label: 'Comments and replies',
    description: 'Comments on your work, replies to you',
    channels: { email: 'emailComments', inApp: 'inAppComments' },
  },
  {
    label: 'Sheets and contributions',
    description: 'Contributions to your sheets and upstream changes',
    channels: { email: 'emailContributions', inApp: 'inAppContributions' },
  },
  {
    label: 'Social activity',
    description: 'Follows, follow requests, stars, and forks',
    channels: { email: 'emailSocial', inApp: 'inAppSocial' },
  },
  {
    label: 'Study groups',
    description: 'Invites, approvals, sessions, and discussion posts',
    channels: { email: 'emailStudyGroups', inApp: 'inAppStudyGroups' },
  },
]

const EMAIL_NOTIFICATION_KEYS = [
  'emailDigest',
  'emailMentions',
  'emailComments',
  'emailContributions',
  'emailSocial',
  'emailStudyGroups',
]

const IN_APP_NOTIFICATION_KEYS = [
  'inAppNotifications',
  'inAppMentions',
  'inAppComments',
  'inAppSocial',
  'inAppContributions',
  'inAppStudyGroups',
]

const SAVE_KEYS = [...EMAIL_NOTIFICATION_KEYS, ...IN_APP_NOTIFICATION_KEYS]

/* Token-driven cell so the grid renders identically in light and dark. */
function GridCell({ checked, onChange, disabled, ariaLabel }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        padding: 8,
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ width: 18, height: 18, accentColor: 'var(--sh-brand)', cursor: 'inherit' }}
      />
    </label>
  )
}

export default function NotificationsTab() {
  const { prefs, loading, saving, msg, loadError, toggle, save, retry } = usePreferences()

  if (loading) {
    return (
      <SectionCard title="Notifications" subtitle="Loading your delivery preferences…">
        <div style={{ display: 'grid', gap: 10 }}>
          <Skeleton width="100%" height={48} borderRadius={10} />
          <Skeleton width="100%" height={48} borderRadius={10} />
          <Skeleton width="100%" height={48} borderRadius={10} />
        </div>
      </SectionCard>
    )
  }

  if (!prefs) {
    return (
      <SectionCard
        title="Notifications"
        subtitle="StudyHub could not load your notification preferences right now."
      >
        <MsgList msg={{ type: 'error', text: loadError || 'Could not load preferences.' }} />
        <Button secondary onClick={retry}>
          Retry
        </Button>
      </SectionCard>
    )
  }

  const inAppMaster = !!prefs.inAppNotifications

  return (
    <>
      <SectionCard
        title="Activity inbox"
        subtitle="Master switch for routine in-app alerts. When off, the bell menu still shows account-safety alerts."
      >
        <ToggleRow
          label="Show routine activity in the bell menu"
          description="Turn off to silence the unread badge for follows, comments, contributions, and study groups."
          checked={inAppMaster}
          onChange={() => toggle('inAppNotifications')}
        />
      </SectionCard>

      <SectionCard
        title="Weekly email digest"
        subtitle="A weekly summary of activity in your enrolled courses."
      >
        <ToggleRow
          label="Send weekly digest"
          description="One email per week with the top activity across your courses."
          checked={prefs.emailDigest}
          onChange={() => toggle('emailDigest')}
        />
      </SectionCard>

      <SectionCard
        title="Per-topic delivery"
        subtitle="Choose how each kind of notification reaches you. In-App goes to the bell menu; Email goes to your inbox."
      >
        {/* Real <table> so screen readers announce row+column context. */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'inherit',
            }}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--sh-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '8px 12px 8px 0',
                    borderBottom: '1px solid var(--sh-border)',
                  }}
                >
                  Topic
                </th>
                <th
                  scope="col"
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--sh-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '8px 0',
                    width: 96,
                    borderBottom: '1px solid var(--sh-border)',
                  }}
                >
                  In-App
                </th>
                <th
                  scope="col"
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--sh-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '8px 0',
                    width: 96,
                    borderBottom: '1px solid var(--sh-border)',
                  }}
                >
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((row) => {
                const inAppDisabled = !inAppMaster
                return (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      style={{
                        textAlign: 'left',
                        padding: '12px 12px 12px 0',
                        borderBottom: '1px solid var(--sh-soft)',
                        verticalAlign: 'top',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-text)' }}>
                        {row.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>
                        {row.description}
                      </div>
                    </th>
                    <td
                      style={{
                        borderBottom: '1px solid var(--sh-soft)',
                        verticalAlign: 'middle',
                      }}
                    >
                      <GridCell
                        checked={prefs[row.channels.inApp]}
                        onChange={() => toggle(row.channels.inApp)}
                        disabled={inAppDisabled}
                        ariaLabel={`${row.label} in-app notifications`}
                      />
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid var(--sh-soft)',
                        verticalAlign: 'middle',
                      }}
                    >
                      <GridCell
                        checked={prefs[row.channels.email]}
                        onChange={() => toggle(row.channels.email)}
                        ariaLabel={`${row.label} email notifications`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Essential Account Alerts"
        subtitle="These stay enabled so you do not miss account-critical issues."
      >
        <Message tone="info">
          Moderation actions, billing problems, legal acceptance reminders, and other account-safety
          alerts still appear even if you turn off routine activity notifications above.
        </Message>
      </SectionCard>

      <MsgList msg={msg} />
      <div role="status" aria-live="polite" style={{ position: 'absolute', left: -9999 }}>
        {saving ? 'Saving notification preferences…' : ''}
      </div>
      <Button disabled={saving} onClick={() => save(SAVE_KEYS, 'Notification preferences saved.')}>
        {saving ? 'Saving...' : 'Save Notification Preferences'}
      </Button>
    </>
  )
}

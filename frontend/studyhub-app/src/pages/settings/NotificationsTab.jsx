import { Button, Message, MsgList, SectionCard, ToggleRow } from './settingsShared'
import { usePreferences } from './settingsState'

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

export default function NotificationsTab() {
  const { prefs, loading, saving, msg, loadError, toggle, save, retry } = usePreferences()

  if (loading) {
    return (
      <SectionCard title="Notifications">
        <div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div>
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

  return (
    <>
      <SectionCard title="Email Notifications" subtitle="Control which emails StudyHub sends you.">
        <ToggleRow
          label="Weekly digest"
          description="A summary of activity in your enrolled courses"
          checked={prefs.emailDigest}
          onChange={() => toggle('emailDigest')}
        />
        <ToggleRow
          label="Mentions"
          description="When someone mentions you in a comment or post"
          checked={prefs.emailMentions}
          onChange={() => toggle('emailMentions')}
        />
        <ToggleRow
          label="Comments and replies"
          description="When someone comments on your posts, sheets, notes, or replies to you"
          checked={prefs.emailComments}
          onChange={() => toggle('emailComments')}
        />
        <ToggleRow
          label="Sheets and contributions"
          description="When someone contributes to your sheets or the source sheet you forked changes"
          checked={prefs.emailContributions}
          onChange={() => toggle('emailContributions')}
        />
        <ToggleRow
          label="Social activity"
          description="When someone follows you, sends a follow request, stars your sheet, or forks your work"
          checked={prefs.emailSocial}
          onChange={() => toggle('emailSocial')}
        />
        <ToggleRow
          label="Study groups"
          description="When you are invited, approved, or receive new session and discussion updates"
          checked={prefs.emailStudyGroups}
          onChange={() => toggle('emailStudyGroups')}
        />
      </SectionCard>

      <SectionCard
        title="In-App Notifications"
        subtitle="Control which routine alerts appear in the StudyHub inbox."
      >
        <ToggleRow
          label="Activity inbox"
          description="Show routine activity alerts in the bell menu and unread badge"
          checked={prefs.inAppNotifications}
          onChange={() => toggle('inAppNotifications')}
        />
        <ToggleRow
          label="Mentions"
          description="Mention alerts in comments and posts"
          checked={prefs.inAppMentions}
          onChange={() => toggle('inAppMentions')}
          disabled={!prefs.inAppNotifications}
        />
        <ToggleRow
          label="Comments and replies"
          description="Replies and comment activity across feed, sheets, and notes"
          checked={prefs.inAppComments}
          onChange={() => toggle('inAppComments')}
          disabled={!prefs.inAppNotifications}
        />
        <ToggleRow
          label="Social activity"
          description="Follows, stars, forks, and other profile activity"
          checked={prefs.inAppSocial}
          onChange={() => toggle('inAppSocial')}
          disabled={!prefs.inAppNotifications}
        />
        <ToggleRow
          label="Sheets and contributions"
          description="Contribution updates and upstream sheet changes"
          checked={prefs.inAppContributions}
          onChange={() => toggle('inAppContributions')}
          disabled={!prefs.inAppNotifications}
        />
        <ToggleRow
          label="Study groups"
          description="Invites, approvals, new sessions, and new discussion posts"
          checked={prefs.inAppStudyGroups}
          onChange={() => toggle('inAppStudyGroups')}
          disabled={!prefs.inAppNotifications}
        />
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
      <Button disabled={saving} onClick={() => save(SAVE_KEYS, 'Notification preferences saved.')}>
        {saving ? 'Saving...' : 'Save Notification Preferences'}
      </Button>
    </>
  )
}

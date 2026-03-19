import { Button, MsgList, SectionCard, ToggleRow } from './settingsShared'
import { usePreferences } from './settingsState'

export default function NotificationsTab() {
  const { prefs, loading, saving, msg, loadError, toggle, save, retry } = usePreferences()

  if (loading) {
    return <SectionCard title="Notifications"><div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div></SectionCard>
  }

  if (!prefs) {
    return (
      <SectionCard title="Notifications" subtitle="StudyHub could not load your notification preferences right now.">
        <MsgList msg={{ type: 'error', text: loadError || 'Could not load preferences.' }} />
        <Button secondary onClick={retry}>Retry</Button>
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
          label="Contributions"
          description="When someone contributes to your sheets or you receive a review"
          checked={prefs.emailContributions}
          onChange={() => toggle('emailContributions')}
        />
      </SectionCard>

      <SectionCard title="In-App Notifications" subtitle="Control the notification bell in the app.">
        <ToggleRow
          label="Show in-app notifications"
          description="Display notification badges and the notification panel"
          checked={prefs.inAppNotifications}
          onChange={() => toggle('inAppNotifications')}
        />
      </SectionCard>

      <MsgList msg={msg} />
      <Button disabled={saving} onClick={() => save(
        ['emailDigest', 'emailMentions', 'emailContributions', 'inAppNotifications'],
        'Notification preferences saved.',
      )}>
        {saving ? 'Saving...' : 'Save Notification Preferences'}
      </Button>
    </>
  )
}

import { useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, MsgList, SectionCard, ToggleRow } from './settingsShared'

export default function NotificationsTab() {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let active = true
    fetch(`${API}/api/settings/preferences`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((data) => { if (active) setPrefs(data) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function toggle(key) {
    setPrefs((c) => ({ ...c, [key]: !c[key] }))
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const response = await fetch(`${API}/api/settings/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailDigest: prefs.emailDigest,
          emailMentions: prefs.emailMentions,
          emailContributions: prefs.emailContributions,
          inAppNotifications: prefs.inAppNotifications,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMsg({ type: 'error', text: data.error || 'Could not save.' })
        return
      }
      setMsg({ type: 'success', text: 'Notification preferences saved.' })
    } catch {
      setMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) {
    return <SectionCard title="Notifications"><div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div></SectionCard>
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
      <Button disabled={saving} onClick={save}>
        {saving ? 'Saving...' : 'Save Notification Preferences'}
      </Button>
    </>
  )
}

import { useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, FormField, MsgList, SectionCard, Select, ToggleRow } from './settingsShared'

export default function PrivacyTab() {
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
          profileVisibility: prefs.profileVisibility,
          defaultDownloads: prefs.defaultDownloads,
          defaultContributions: prefs.defaultContributions,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMsg({ type: 'error', text: data.error || 'Could not save.' })
        return
      }
      setMsg({ type: 'success', text: 'Privacy preferences saved.' })
    } catch {
      setMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) {
    return <SectionCard title="Privacy"><div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div></SectionCard>
  }

  return (
    <>
      <SectionCard title="Profile Visibility" subtitle="Control who can see your profile page and activity.">
        <FormField label="Who can view your profile">
          <Select
            value={prefs.profileVisibility}
            onChange={(e) => setPrefs((c) => ({ ...c, profileVisibility: e.target.value }))}
          >
            <option value="public">Public (anyone)</option>
            <option value="enrolled">Enrolled only (classmates in your courses)</option>
            <option value="private">Private (only you)</option>
          </Select>
        </FormField>
      </SectionCard>

      <SectionCard title="Default Permissions" subtitle="Defaults for new sheets you upload. You can override per sheet.">
        <ToggleRow
          label="Allow downloads"
          description="Let others download your sheets by default"
          checked={prefs.defaultDownloads}
          onChange={() => toggle('defaultDownloads')}
        />
        <ToggleRow
          label="Allow contributions"
          description="Let others propose changes to your sheets by default"
          checked={prefs.defaultContributions}
          onChange={() => toggle('defaultContributions')}
        />
      </SectionCard>

      <MsgList msg={msg} />
      <Button disabled={saving} onClick={save}>
        {saving ? 'Saving...' : 'Save Privacy Preferences'}
      </Button>
    </>
  )
}

import { Button, FormField, MsgList, SectionCard, Select, ToggleRow, usePreferences } from './settingsShared'

export default function PrivacyTab() {
  const { prefs, setPrefs, loading, saving, msg, toggle, save } = usePreferences()

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
      <Button disabled={saving} onClick={() => save(
        ['profileVisibility', 'defaultDownloads', 'defaultContributions'],
        'Privacy preferences saved.',
      )}>
        {saving ? 'Saving...' : 'Save Privacy Preferences'}
      </Button>
    </>
  )
}

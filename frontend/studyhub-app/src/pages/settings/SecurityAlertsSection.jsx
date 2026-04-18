import { Button, Message, MsgList, SectionCard, ToggleRow } from './settingsShared'
import { usePreferences } from './settingsState'

const ALERT_KEYS = ['alertOnNewCountry', 'alertOnNewCity', 'blockAnonymousIp']

export default function SecurityAlertsSection() {
  const { prefs, loading, saving, msg, loadError, toggle, save, retry } = usePreferences()

  if (loading) {
    return (
      <SectionCard title="Security alerts" subtitle="Loading your preferences...">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      </SectionCard>
    )
  }

  if (!prefs) {
    return (
      <SectionCard
        title="Security alerts"
        subtitle="StudyHub could not load your security preferences right now."
      >
        <MsgList msg={{ type: 'error', text: loadError || 'Could not load preferences.' }} />
        <Button secondary onClick={retry}>
          Retry
        </Button>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Security alerts"
      subtitle="Control how StudyHub notifies you about unusual sign-in attempts."
    >
      <ToggleRow
        label="Email me on new country"
        description="When a sign-in happens from a country we haven't seen before on your account."
        checked={!!prefs.alertOnNewCountry}
        onChange={() => toggle('alertOnNewCountry')}
      />
      <ToggleRow
        label="Email me on new city"
        description="More sensitive — also fires when the city changes within the same country."
        checked={!!prefs.alertOnNewCity}
        onChange={() => toggle('alertOnNewCity')}
      />
      <ToggleRow
        label="Block anonymous / VPN sign-ins"
        description="Require step-up verification when the IP is flagged as VPN, proxy, or hosting provider."
        checked={!!prefs.blockAnonymousIp}
        onChange={() => toggle('blockAnonymousIp')}
      />
      <MsgList msg={msg} />
      {msg && msg.type === 'error' && (
        <Button onClick={() => save(ALERT_KEYS)} disabled={saving}>
          Retry save
        </Button>
      )}
      <div style={{ marginTop: 8 }}>
        <Button onClick={() => save(ALERT_KEYS)} disabled={saving}>
          {saving ? 'Saving...' : 'Save alert preferences'}
        </Button>
      </div>
    </SectionCard>
  )
}

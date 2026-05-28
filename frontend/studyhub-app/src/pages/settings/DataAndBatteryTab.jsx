/**
 * DataAndBatteryTab.jsx — Settings tab for Data Saver + Battery Saver.
 *
 * Wave-12.11. Pairs with backend dataSaverNegotiation.js + the
 * useDataSaver / useBatterySaver hooks. Single tab covers both
 * because the users who need one typically want the other — global
 * cellular users on older devices.
 *
 * Each toggle is a tri-state select: on / off / auto. `auto` honors:
 *   - Data Saver: Save-Data request header + navigator.connection.saveData.
 *   - Battery Saver: prefers-reduced-motion: reduce.
 *
 * Persistence flows through usePreferences() → PATCH /api/settings/
 * preferences. The server-side PREF_ENUM_KEYS allowlist
 * (settings.constants.js) gates the values so an attacker can't smuggle
 * arbitrary strings into the column.
 */
import { Skeleton } from '../../components/Skeleton'
import { setStoredDataSaverMode } from '../../lib/useDataSaver'
import { setStoredBatterySaverMode } from '../../lib/useBatterySaver'
import { Button, FormField, MsgList, SectionCard, Select } from './settingsShared'
import { usePreferences } from './settingsState'

export default function DataAndBatteryTab() {
  const { prefs, setPrefs, loading, saving, msg, loadError, save, retry } = usePreferences()

  if (loading) {
    return (
      <SectionCard title="Data &amp; Battery" subtitle="Loading your preferences...">
        <div style={{ display: 'grid', gap: 10 }} aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading data &amp; battery preferences...</span>
          <Skeleton width="40%" height={14} borderRadius={6} />
          <Skeleton width="100%" height={40} borderRadius={10} />
          <Skeleton width="40%" height={14} borderRadius={6} style={{ marginTop: 8 }} />
          <Skeleton width="100%" height={40} borderRadius={10} />
        </div>
      </SectionCard>
    )
  }

  if (!prefs) {
    return (
      <SectionCard
        title="Data &amp; Battery"
        subtitle="StudyHub could not load your preferences right now."
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
      <SectionCard
        title="Data Saver"
        subtitle="Reduces network traffic so StudyHub uses less of your mobile data plan."
      >
        <FormField label="Mode">
          <Select
            value={prefs.dataSaverMode || 'auto'}
            onChange={(e) => setPrefs((c) => ({ ...c, dataSaverMode: e.target.value }))}
          >
            <option value="auto">Auto (follow your browser / network)</option>
            <option value="on">On — always use lighter responses</option>
            <option value="off">Off — full-quality images and streaming</option>
          </Select>
        </FormField>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            fontSize: 12,
            color: 'var(--sh-subtext)',
            lineHeight: 1.6,
          }}
        >
          When on, StudyHub disables autoplay video, requests smaller image variants, raises
          background-refresh intervals, and asks Hub AI for the whole reply at once instead of
          streaming. <em>Auto</em> follows the Save-Data header your browser sends on metered
          connections.
        </div>
      </SectionCard>

      <SectionCard
        title="Battery Saver"
        subtitle="Reduces animations and background work to extend session length."
      >
        <FormField label="Mode">
          <Select
            value={prefs.batterySaverMode || 'auto'}
            onChange={(e) => setPrefs((c) => ({ ...c, batterySaverMode: e.target.value }))}
          >
            <option value="auto">Auto (follow your accessibility settings)</option>
            <option value="on">On — disable animations and entrance effects</option>
            <option value="off">Off — full animations</option>
          </Select>
        </FormField>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--sh-soft)',
            border: '1px solid var(--sh-border)',
            fontSize: 12,
            color: 'var(--sh-subtext)',
            lineHeight: 1.6,
          }}
        >
          When on, StudyHub disables entrance animations, hover lifts, and the AI bubble pulse.
          <em> Auto</em> turns on automatically when your OS has &quot;Reduce motion&quot; enabled.
        </div>
      </SectionCard>

      <MsgList msg={msg} />
      <Button
        disabled={saving}
        onClick={async () => {
          const ok = await save(
            ['dataSaverMode', 'batterySaverMode'],
            'Data &amp; battery preferences saved.',
          )
          // Wave-12.12 P2 fix — push the new values into the
          // useDataSaver / useBatterySaver hook caches so the change
          // takes effect immediately on the current page without a
          // reload. Without this the user saves "on", but the global
          // SaverModeInitializer only re-derives from `serverMode`
          // when the session payload refreshes, which usually requires
          // a navigation. The hooks ALSO read this localStorage key
          // for first-paint cache, so this seeds future page loads
          // before the session round-trip completes.
          if (ok) {
            setStoredDataSaverMode(prefs.dataSaverMode)
            setStoredBatterySaverMode(prefs.batterySaverMode)
          }
        }}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </>
  )
}

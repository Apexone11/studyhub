import { useEffect } from 'react'
import {
  applyFontSize,
  applyTheme,
  writeCachedAppearancePreferences,
  writeGlobalTheme,
} from '../../lib/appearance'
import { useSession } from '../../lib/session-context'
import { Button, FormField, MsgList, SectionCard, Select } from './settingsShared'
import { usePreferences } from './settingsState'

export default function AppearanceTab() {
  const { user } = useSession()
  const { prefs, setPrefs, loading, saving, msg, loadError, save, retry } = usePreferences()

  /* Apply theme and font size to the DOM in real-time as the user changes them */
  const currentTheme = prefs?.theme
  const currentFontSize = prefs?.fontSize

  useEffect(() => {
    if (currentTheme) applyTheme(currentTheme)
  }, [currentTheme])

  useEffect(() => {
    if (currentFontSize) applyFontSize(currentFontSize)
  }, [currentFontSize])

  if (loading) {
    return <SectionCard title="Appearance"><div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div></SectionCard>
  }

  if (!prefs) {
    return (
      <SectionCard title="Appearance" subtitle="StudyHub could not load your appearance preferences right now.">
        <MsgList msg={{ type: 'error', text: loadError || 'Could not load preferences.' }} />
        <Button secondary onClick={retry}>Retry</Button>
      </SectionCard>
    )
  }

  return (
    <>
      <SectionCard title="Theme" subtitle="Choose how StudyHub looks for you. System follows your OS setting.">
        <FormField label="Color theme">
          <Select
            value={prefs.theme}
            onChange={(e) => setPrefs((c) => ({ ...c, theme: e.target.value }))}
          >
            <option value="system">System (follow OS)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </FormField>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { value: 'light', label: 'Light', bg: '#ffffff', border: '#e2e8f0', text: '#0f172a' },
            { value: 'dark', label: 'Dark', bg: '#0f172a', border: '#334155', text: '#f1f5f9' },
            { value: 'system', label: 'System', bg: 'linear-gradient(135deg, #ffffff 50%, #0f172a 50%)', border: '#94a3b8', text: '#475569' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPrefs((c) => ({ ...c, theme: opt.value }))}
              style={{
                flex: 1,
                padding: '16px 12px',
                borderRadius: 12,
                border: `2px solid ${prefs.theme === opt.value ? '#3b82f6' : opt.border}`,
                background: opt.bg,
                color: opt.text,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Font Size" subtitle="Adjust the base text size across the app.">
        <FormField label="Text size">
          <Select
            value={prefs.fontSize}
            onChange={(e) => setPrefs((c) => ({ ...c, fontSize: e.target.value }))}
          >
            <option value="small">Small</option>
            <option value="medium">Medium (default)</option>
            <option value="large">Large</option>
          </Select>
        </FormField>

        <div style={{ padding: '14px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: prefs.fontSize === 'small' ? 13 : prefs.fontSize === 'large' ? 17 : 15 }}>
          This is a preview of your selected font size. Adjust to your preference.
        </div>
      </SectionCard>

      <MsgList msg={msg} />
      <Button disabled={saving} onClick={async () => {
        const saved = await save(['theme', 'fontSize'], 'Appearance preferences saved.')

        if (!saved) {
          return
        }

        writeCachedAppearancePreferences({ theme: prefs.theme, fontSize: prefs.fontSize }, user?.id)
        writeGlobalTheme(prefs.theme)
      }}>
        {saving ? 'Saving...' : 'Save Appearance Preferences'}
      </Button>
    </>
  )
}

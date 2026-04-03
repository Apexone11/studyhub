import { useEffect, useState } from 'react'
import {
  applyFontSize,
  applyTheme,
  writeCachedAppearancePreferences,
  writeGlobalTheme,
} from '../../lib/appearance'
import { useSession } from '../../lib/session-context'
import { Button, FormField, MsgList, SectionCard, Select, ToggleRow } from './settingsShared'
import { usePreferences } from './settingsState'

export default function AppearanceTab() {
  const { user } = useSession()
  const { prefs, setPrefs, loading, saving, msg, loadError, save, retry } = usePreferences()

  /* ── Tutorial toggle (localStorage-only, no backend call needed) ───── */
  const [tutorialsEnabled, setTutorialsEnabled] = useState(() => {
    try {
      return localStorage.getItem('studyhub_tutorials_disabled') !== '1'
    } catch {
      return true
    }
  })

  function handleTutorialToggle() {
    const next = !tutorialsEnabled
    setTutorialsEnabled(next)
    try {
      if (next) {
        localStorage.removeItem('studyhub_tutorials_disabled')
      } else {
        localStorage.setItem('studyhub_tutorials_disabled', '1')
      }
    } catch {
      // localStorage unavailable
    }
  }

  function resetAllTutorials() {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('tutorial_') && k.endsWith('_seen'))
      for (const key of keys) localStorage.removeItem(key)
      // Also re-enable tutorials if they were disabled
      localStorage.removeItem('studyhub_tutorials_disabled')
      setTutorialsEnabled(true)
    } catch {
      // localStorage unavailable
    }
  }

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
    return <SectionCard title="Appearance"><div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading preferences...</div></SectionCard>
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
            { value: 'light', label: 'Light', bg: 'var(--sh-surface)', border: 'var(--sh-border)', text: 'var(--sh-heading)' },
            { value: 'dark', label: 'Dark', bg: 'var(--sh-slate-900)', border: 'var(--sh-slate-700)', text: 'var(--sh-slate-50)' },
            { value: 'system', label: 'System', bg: 'linear-gradient(135deg, var(--sh-surface) 50%, var(--sh-slate-900) 50%)', border: 'var(--sh-slate-400)', text: 'var(--sh-slate-600)' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPrefs((c) => ({ ...c, theme: opt.value }))}
              style={{
                flex: 1,
                padding: '16px 12px',
                borderRadius: 12,
                border: `2px solid ${prefs.theme === opt.value ? 'var(--sh-brand)' : opt.border}`,
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

        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--sh-soft)', border: '1px solid var(--sh-border)', fontSize: prefs.fontSize === 'small' ? 13 : prefs.fontSize === 'large' ? 17 : 15 }}>
          This is a preview of your selected font size. Adjust to your preference.
        </div>
      </SectionCard>

      <SectionCard title="Tutorials" subtitle="Control whether page tutorials appear automatically when you visit new features.">
        <ToggleRow
          label="Show tutorials"
          description="When enabled, brief tutorial popups appear the first time you visit each page."
          checked={tutorialsEnabled}
          onChange={handleTutorialToggle}
        />
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={resetAllTutorials}
            style={{
              background: 'none',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sh-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reset all tutorials
          </button>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 6 }}>
            This will make all page tutorials appear again on your next visit.
          </div>
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

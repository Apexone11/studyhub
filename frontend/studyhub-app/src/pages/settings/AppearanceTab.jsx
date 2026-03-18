import { useEffect } from 'react'
import { Button, FormField, MsgList, SectionCard, Select, usePreferences } from './settingsShared'

function applyThemeToDOM(theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else if (theme === 'light') {
    root.removeAttribute('data-theme')
  } else {
    // system — check OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')
  }
}

function applyFontSizeToDOM(fontSize) {
  const root = document.documentElement
  const sizeMap = { small: '14px', medium: '16px', large: '18px' }
  root.style.fontSize = sizeMap[fontSize] || '16px'
}

export default function AppearanceTab() {
  const { prefs, setPrefs, loading, saving, msg, save } = usePreferences()

  /* Apply theme and font size to the DOM in real-time as the user changes them */
  const currentTheme = prefs?.theme
  const currentFontSize = prefs?.fontSize

  useEffect(() => {
    if (currentTheme) applyThemeToDOM(currentTheme)
  }, [currentTheme])

  useEffect(() => {
    if (currentFontSize) applyFontSizeToDOM(currentFontSize)
  }, [currentFontSize])

  if (loading || !prefs) {
    return <SectionCard title="Appearance"><div style={{ color: '#64748b', fontSize: 13 }}>Loading preferences...</div></SectionCard>
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
      <Button disabled={saving} onClick={() => {
        save(['theme', 'fontSize'], 'Appearance preferences saved.')
        try { localStorage.setItem('studyhub_prefs', JSON.stringify({ theme: prefs.theme, fontSize: prefs.fontSize })) } catch { /* ignore */ }
      }}>
        {saving ? 'Saving...' : 'Save Appearance Preferences'}
      </Button>
    </>
  )
}

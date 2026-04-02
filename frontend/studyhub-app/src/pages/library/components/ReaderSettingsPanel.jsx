import { useState } from 'react'
import { IconX } from '../../../components/Icons'
import '../BookReaderPage.css'

const THEME_OPTIONS = [
  { id: 'light', label: 'Light', bgColor: '#ffffff', textColor: '#1a1a2e' },
  { id: 'dark', label: 'Dark', bgColor: '#1a1a2e', textColor: '#e0e0e0' },
  { id: 'sepia', label: 'Sepia', bgColor: '#f4ecd8', textColor: '#5c4033' },
]

const FONT_FAMILIES = [
  { id: 'default', label: 'Default' },
  { id: 'serif', label: 'Serif' },
  { id: 'sans-serif', label: 'Sans Serif' },
]

export default function ReaderSettingsPanel({
  theme,
  setTheme,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
  onClose,
}) {
  const handleFontSizeIncrease = () => {
    setFontSize((prev) => Math.min(prev + 10, 200))
  }

  const handleFontSizeDecrease = () => {
    setFontSize((prev) => Math.max(prev - 10, 80))
  }

  const handleThemeChange = (themeId) => {
    setTheme(themeId)
  }

  const handleFontFamilyChange = (familyId) => {
    setFontFamily(familyId)
  }

  return (
    <div className="reader-settings-panel">
      {/* Header */}
      <div className="reader-settings__header">
        <h3>Reader Settings</h3>
        <button
          onClick={onClose}
          className="reader-settings__close-btn"
          aria-label="Close settings"
        >
          <IconX size={20} />
        </button>
      </div>

      {/* Theme Selection */}
      <div className="reader-settings__section">
        <label className="reader-settings__label">Theme</label>
        <div className="reader-settings__theme-group">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleThemeChange(option.id)}
              className={`reader-settings__theme-btn ${
                theme === option.id ? 'active' : ''
              }`}
              aria-label={`Select ${option.label} theme`}
              title={option.label}
            >
              <span
                className="reader-settings__theme-preview"
                style={{
                  backgroundColor: option.bgColor,
                  borderColor: option.textColor,
                }}
              />
              <span className="reader-settings__theme-label">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="reader-settings__section">
        <label className="reader-settings__label">Font Size: {fontSize}%</label>
        <div className="reader-settings__font-size-controls">
          <button
            onClick={handleFontSizeDecrease}
            className="reader-settings__font-btn reader-settings__font-btn--minus"
            aria-label="Decrease font size"
          >
            A
          </button>
          <div className="reader-settings__font-slider-container">
            <input
              type="range"
              min="80"
              max="200"
              step="10"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="reader-settings__font-slider"
              aria-label="Font size slider"
            />
          </div>
          <button
            onClick={handleFontSizeIncrease}
            className="reader-settings__font-btn reader-settings__font-btn--plus"
            aria-label="Increase font size"
          >
            A
          </button>
        </div>
      </div>

      {/* Font Family */}
      <div className="reader-settings__section">
        <label className="reader-settings__label">Font Family</label>
        <select
          value={fontFamily}
          onChange={(e) => handleFontFamilyChange(e.target.value)}
          className="reader-settings__font-family-select"
          aria-label="Font family selection"
        >
          {FONT_FAMILIES.map((family) => (
            <option key={family.id} value={family.id}>
              {family.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * SheetReaderControls.jsx — the "Aa" popover for sheet reading preferences.
 *
 * State/persistence helpers live in sheetReaderPrefs.js; this file only
 * renders. Preferences apply as CSS custom properties on the content
 * wrapper, so the sanitized sheet HTML itself is never touched.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  READER_LEADING,
  READER_SIZES,
  READER_WIDTHS,
  normalizeReaderPrefs,
  writeReaderPrefs,
} from './sheetReaderPrefs'

function segmentStyle(active) {
  return {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? 'var(--sh-brand)' : 'var(--sh-border)',
    background: active ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
    color: active ? 'var(--sh-brand)' : 'var(--sh-slate-600, #475569)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

function ControlRow({ label, options, value, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--sh-subtext)',
        }}
      >
        {label}
      </span>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
        {Object.entries(options).map(([key, option]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            style={segmentStyle(value === key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SheetReaderControls({ prefs, onChange, buttonStyle }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef(null)

  const update = useCallback(
    (patch) => {
      const next = normalizeReaderPrefs({ ...prefs, ...patch })
      writeReaderPrefs(next)
      onChange(next)
    },
    [onChange, prefs],
  )

  // Escape closes; a click outside dismisses. Both only while open.
  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Reading display options"
        title="Reading display options"
        style={buttonStyle}
      >
        Aa
      </button>
      {open && (
        <div
          id={panelId}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 20,
            display: 'grid',
            gap: 12,
            minWidth: 220,
            padding: 14,
            borderRadius: 12,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            boxShadow: 'var(--shadow-md, 0 10px 30px rgba(15, 23, 42, 0.12))',
          }}
        >
          <ControlRow
            label="Text size"
            options={READER_SIZES}
            value={prefs.size}
            onChange={(size) => update({ size })}
          />
          <ControlRow
            label="Reading width"
            options={READER_WIDTHS}
            value={prefs.width}
            onChange={(width) => update({ width })}
          />
          <ControlRow
            label="Line height"
            options={READER_LEADING}
            value={prefs.leading}
            onChange={(leading) => update({ leading })}
          />
        </div>
      )}
    </div>
  )
}

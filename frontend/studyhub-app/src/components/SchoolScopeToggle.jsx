/**
 * SchoolScopeToggle — small inline switch for course pickers + the
 * Settings personalization tab. Reads/writes the user's
 * `UserPreferences.scopeBySchool` preference via `useScopeBySchool`.
 *
 * Two display modes:
 *   - `mode="inline"`   (default) — compact pill switch for the picker.
 *   - `mode="setting"`  — full row with label + helper text for the
 *                         Settings tab.
 *
 * The component renders nothing when the user has no primary school
 * (the toggle is meaningless for self-learners) UNLESS `mode="setting"`
 * in which case we show it disabled with helper text explaining it
 * activates once they add a school.
 */
import { useScopeBySchool } from '../lib/useScopeBySchool'

export default function SchoolScopeToggle({
  mode = 'inline',
  schoolLabel = null,
  onChange = null,
}) {
  const { scoped, setScoped, primarySchoolId, isHydrating } = useScopeBySchool()

  // Inline mode: hide entirely when the user has no primary school.
  // Settings mode: show it disabled with helper copy.
  const disabled = primarySchoolId == null
  if (mode === 'inline' && disabled) return null

  function handleFlip() {
    if (disabled) return
    const next = !scoped
    setScoped(next)
    if (typeof onChange === 'function') onChange(next)
  }

  if (mode === 'setting') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--sh-heading)',
              marginBottom: 4,
            }}
          >
            Scope course pickers to my school
          </div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5 }}>
            When on, the course dropdowns in Notes, Sheets, and AI Sheet Setup show only your
            primary school&rsquo;s courses by default. You can still flip &ldquo;Show all
            schools&rdquo; inline on any picker.
            {disabled ? (
              <div style={{ marginTop: 6, color: 'var(--sh-warning-text)' }}>
                Pick a primary school on My Courses to activate this toggle.
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={scoped ? 'true' : 'false'}
          onClick={handleFlip}
          disabled={disabled || isHydrating}
          aria-label="Scope course pickers to my school"
          style={{
            position: 'relative',
            width: 44,
            height: 24,
            minWidth: 44,
            borderRadius: 999,
            border: 'none',
            cursor: disabled || isHydrating ? 'not-allowed' : 'pointer',
            background: scoped ? 'var(--sh-brand, #2563eb)' : 'var(--sh-soft, #e2e8f0)',
            opacity: disabled || isHydrating ? 0.5 : 1,
            transition: 'background 0.18s',
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 2,
              left: scoped ? 22 : 2,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.18s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}
          />
        </button>
      </div>
    )
  }

  // Inline pill
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-surface)',
        fontSize: 11,
        fontWeight: 700,
        color: scoped ? 'var(--sh-brand)' : 'var(--sh-muted)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={scoped}
        onChange={handleFlip}
        disabled={isHydrating}
        style={{ margin: 0, accentColor: 'var(--sh-brand)' }}
        aria-label={
          schoolLabel ? `Show only ${schoolLabel} courses` : 'Show only my school’s courses'
        }
      />
      <span>{scoped ? `Scope: ${schoolLabel || 'My school'}` : 'All schools'}</span>
    </label>
  )
}

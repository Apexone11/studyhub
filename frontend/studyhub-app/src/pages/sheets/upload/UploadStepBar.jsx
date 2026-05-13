/* ═══════════════════════════════════════════════════════════════════════════
 * UploadStepBar.jsx — Progressive-disclosure step indicator for the upload
 * sheet page. Four steps: 1) Course, 2) Content, 3) Preview, 4) Publish.
 *
 * The bar is purely informational — it reflects derived state from the form
 * (a step flips from "current" to "done" the moment its requirement is met)
 * and never gates editing. Users can edit any field at any time; the bar is
 * a wayfinding affordance, not a wizard.
 *
 * Visual states per step:
 *   - done   — numbered badge filled in brand colour with a check glyph
 *   - current — numbered badge filled in brand colour with the digit
 *   - upcoming — outlined badge with the digit in muted text
 *
 * No emoji in UI chrome. All colours via `var(--sh-*)` tokens. Connector
 * line between steps respects `prefers-reduced-motion` (no animation).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { IconCheck } from '../../../components/Icons'
import { FONT } from './uploadSheetConstants'

const STEP_LABELS = [
  { key: 'course', label: 'Pick course' },
  { key: 'content', label: 'Write content' },
  { key: 'preview', label: 'Preview' },
  { key: 'publish', label: 'Publish' },
]

export default function UploadStepBar({ steps }) {
  return (
    <ol
      aria-label="Upload progress"
      style={{
        listStyle: 'none',
        margin: 0,
        marginBottom: 12,
        padding: '12px 16px',
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexWrap: 'wrap',
        fontFamily: FONT,
      }}
    >
      {STEP_LABELS.map((step, idx) => {
        const state = steps[step.key] || 'upcoming'
        const isDone = state === 'done'
        const isCurrent = state === 'current'
        const badgeBg = isDone || isCurrent ? 'var(--sh-brand)' : 'transparent'
        const badgeBorder = isDone || isCurrent ? 'var(--sh-brand)' : 'var(--sh-slate-300)'
        const badgeColor = isDone || isCurrent ? '#fff' : 'var(--sh-slate-500)'
        const labelColor = isDone || isCurrent ? 'var(--sh-heading)' : 'var(--sh-slate-500)'
        const labelWeight = isCurrent ? 800 : isDone ? 700 : 600

        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: badgeBg,
                border: `1.5px solid ${badgeBorder}`,
                color: badgeColor,
                fontSize: 12,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isDone ? <IconCheck size={13} /> : idx + 1}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: labelWeight,
                color: labelColor,
                whiteSpace: 'nowrap',
              }}
            >
              {step.label}
            </span>
            {idx < STEP_LABELS.length - 1 ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 1.5,
                  margin: '0 10px',
                  background: isDone ? 'var(--sh-brand)' : 'var(--sh-slate-300)',
                  flexShrink: 0,
                }}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

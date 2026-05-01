/**
 * FocusTrapHarnessPage — dev-only Playwright a11y target.
 *
 * Mounts a single `FocusTrappedDialog` with three focusable elements
 * inside, no auth context, no localStorage dance. Lets the focus-trap
 * smoke spec assert Tab cycling stays inside the dialog without
 * fighting the legal-acceptance modal's signed-in user requirement.
 *
 * Gate: only mounted when `import.meta.env.DEV === true`. Production
 * bundles never ship this route — App.jsx wraps the import in the same
 * gate. If a stray prod request hits the path, the route falls through
 * to the 404 page.
 */
import { useState } from 'react'
import FocusTrappedDialog from '../../components/Modal/FocusTrappedDialog'

export default function FocusTrapHarnessPage() {
  const [open, setOpen] = useState(true)

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Focus-trap harness</h1>
      <p>This page exists only for the Playwright focus-trap smoke test.</p>
      <button type="button" id="harness-open" onClick={() => setOpen(true)}>
        Open dialog
      </button>

      <FocusTrappedDialog open={open} onClose={() => setOpen(false)} ariaLabelledBy="harness-title">
        <h2 id="harness-title" style={{ margin: 0 }}>
          Focus trap test dialog
        </h2>
        <p>Tab + Shift+Tab should cycle between the three buttons below.</p>
        <button type="button" data-autofocus="harness" id="harness-first">
          First
        </button>
        <button type="button" id="harness-second">
          Second
        </button>
        <button type="button" id="harness-third" onClick={() => setOpen(false)}>
          Close (third)
        </button>
      </FocusTrappedDialog>
    </div>
  )
}

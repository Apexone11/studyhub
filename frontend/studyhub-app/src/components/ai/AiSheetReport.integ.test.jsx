/**
 * AiSheetReport.integ.test.jsx — frontend integration test for the
 * full AI sheet permission flow.
 *
 * Scenario (single render, single user, two paths exercised):
 *
 *   Accept path:
 *     1. Render <AiSheetReport /> inside <AiPermissionProvider> with the
 *        real <AiPermissionDialog> as the bound Dialog component.
 *     2. User types an instruction → clicks "Draft edit".
 *     3. Backend (mock) returns a proposal.
 *     4. User clicks "Apply edit…" → real permission dialog opens.
 *     5. User clicks "Apply edit" inside the dialog.
 *     6. The applySheetEdit helper is called with the proposed content +
 *        a snapshot name.
 *
 *   Reject path (separate render):
 *     1. Same setup, drive to the dialog.
 *     2. Click "Discard" instead.
 *     3. applySheetEdit is NEVER called.
 *
 * What this guarantees end-to-end:
 *   - The bubble's "Apply edit…" button truly routes through the universal
 *     permission gate (not a fake confirm, not a window.confirm).
 *   - The dialog's Accept / Reject buttons drive the right side-effect.
 *   - The snapshot name is derived from the instruction and forwarded to
 *     the backend call.
 *   - Nothing leaks (no fetch) when the user discards.
 *
 * Backend is mocked at the aiSheetService layer — no real fetch calls.
 * The dialog is the REAL AiPermissionDialog (not a stub) so this test
 * exercises the same focus / portal / button wiring users see in prod.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── External dependency mocks ────────────────────────────────────────

const analyzeSheetMock = vi.fn()
const proposeSheetEditMock = vi.fn()
const applySheetEditMock = vi.fn()
const getStoredUserMock = vi.fn()
const showToastMock = vi.fn()

vi.mock('../../lib/aiSheetService', () => ({
  analyzeSheet: (...args) => analyzeSheetMock(...args),
  proposeSheetEdit: (...args) => proposeSheetEditMock(...args),
  applySheetEdit: (...args) => applySheetEditMock(...args),
}))

vi.mock('../../lib/session', () => ({
  getStoredUser: () => getStoredUserMock(),
}))

vi.mock('../../lib/toast', () => ({
  showToast: (...args) => showToastMock(...args),
}))

vi.mock('../Icons', () => ({
  IconSpark: () => <span data-testid="icon-spark" />,
}))

import AiSheetReport from './AiSheetReport'
import AiPermissionDialog from './AiPermissionDialog'
import { AiPermissionProvider } from '../../lib/useAiPermission'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  analyzeSheetMock.mockReset()
  proposeSheetEditMock.mockReset()
  applySheetEditMock.mockReset()
  getStoredUserMock.mockReset()
  showToastMock.mockReset()
  // Default to admin so the "Edit with AI…" button shows up regardless
  // of the per-test ownership fetch shape.
  getStoredUserMock.mockReturnValue({ id: 7, role: 'admin' })
  // Default ownership fetch: viewer is the owner (the route fetch checks
  // `sheet.userId === me.id`; admins are allowed regardless).
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ sheet: { userId: 7 } }),
  })
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

// ── helpers ──────────────────────────────────────────────────────────

function renderWithPermission(pathname = '/sheets/42') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AiPermissionProvider Dialog={AiPermissionDialog}>
        <AiSheetReport />
      </AiPermissionProvider>
    </MemoryRouter>,
  )
}

/**
 * Drive the bubble from initial render through to "permission dialog is
 * open and showing the proposal." Used by both Accept and Reject tests.
 */
async function driveToPermissionDialog() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /edit with ai/i })).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('button', { name: /edit with ai/i }))

  const textarea = screen.getByPlaceholderText(/tighten the conclusion/i)
  fireEvent.change(textarea, {
    target: { value: 'Polish the intro paragraph and add an example.' },
  })

  proposeSheetEditMock.mockResolvedValue({
    ok: true,
    data: {
      proposedContent: '# Refactored\n\nNew intro with example.',
      diffSummary: { newLength: 32, delta: 4 },
    },
  })

  fireEvent.click(screen.getByRole('button', { name: /draft edit/i }))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /apply edit…|apply edit/i })).toBeInTheDocument()
  })

  // Verify propose-edit hit the helper with the trimmed instruction.
  expect(proposeSheetEditMock).toHaveBeenCalledWith(
    42,
    'Polish the intro paragraph and add an example.',
  )

  // Click "Apply edit…" — this triggers requestPermission() which mounts
  // the AiPermissionDialog inside the provider.
  fireEvent.click(screen.getByRole('button', { name: /apply edit/i }))

  // The dialog renders into a portal on document.body. Wait for the
  // dialog's title (rendered by AiPermissionDialog) to appear.
  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: /apply ai edit/i })).toBeInTheDocument()
  })
}

// ── tests ────────────────────────────────────────────────────────────

describe('AiSheetReport — full permission flow integration', () => {
  it('ACCEPT path: instruction → draft → permission dialog → Apply → applySheetEdit fired', async () => {
    applySheetEditMock.mockResolvedValue({
      ok: true,
      data: { sheet: { id: 42, content: 'new' } },
    })

    renderWithPermission('/sheets/42')
    await driveToPermissionDialog()

    // Sanity: applySheetEdit has NOT been called yet — the gate is open.
    expect(applySheetEditMock).not.toHaveBeenCalled()

    // Click the Apply button inside the permission dialog. The dialog's
    // primary button uses applyLabel='Apply edit'.
    const dialog = screen.getByRole('dialog', { name: /apply ai edit/i })
    const applyBtn = within(dialog).getByRole('button', { name: /apply edit/i })

    await act(async () => {
      fireEvent.click(applyBtn)
    })

    // The chain fired: applySheetEdit called with the proposed content +
    // a snapshotName derived from the instruction.
    await waitFor(() => {
      expect(applySheetEditMock).toHaveBeenCalledTimes(1)
    })
    expect(applySheetEditMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        proposedContent: '# Refactored\n\nNew intro with example.',
        // Snapshot name defaults to the first 60 chars of the instruction.
        snapshotName: expect.stringContaining('Polish the intro paragraph'),
      }),
    )

    // Success toast surfaced.
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/applied/i), 'success')
    })
  })

  it('REJECT path: same flow, but Discard cancels — applySheetEdit is NOT called', async () => {
    renderWithPermission('/sheets/42')
    await driveToPermissionDialog()

    // Sanity: applySheetEdit not called yet.
    expect(applySheetEditMock).not.toHaveBeenCalled()

    // Click the Discard button inside the dialog. The dialog's secondary
    // button uses rejectLabel='Discard'.
    const dialog = screen.getByRole('dialog', { name: /apply ai edit/i })
    const discardBtn = within(dialog).getByRole('button', { name: /discard/i })

    await act(async () => {
      fireEvent.click(discardBtn)
    })

    // Critical invariant: NO backend call. The dialog tore down without
    // persisting anything.
    expect(applySheetEditMock).not.toHaveBeenCalled()

    // Dialog dismounted.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /apply ai edit/i })).not.toBeInTheDocument()
    })

    // User got an "edit discarded" info toast (the bubble explicitly
    // surfaces this so the user knows nothing happened).
    expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/discarded/i), 'info')
  })

  it('REJECT via Esc key — keyboard cancel also blocks applySheetEdit', async () => {
    // Defense-in-depth: the dialog binds Escape to onReject. A user who
    // hits Esc instead of clicking Discard must also cancel the write.
    renderWithPermission('/sheets/42')
    await driveToPermissionDialog()

    expect(applySheetEditMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(applySheetEditMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /apply ai edit/i })).not.toBeInTheDocument()
    })
  })
})

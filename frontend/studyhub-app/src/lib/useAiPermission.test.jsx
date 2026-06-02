/**
 * useAiPermission.test.jsx — coverage for the AI permission
 * Provider + hook contract.
 *
 * Verifies:
 *   - requestPermission() returns a Promise.
 *   - Promise resolves to true on accept.
 *   - Promise resolves to false on reject.
 *   - Sequential requests work (the previous one is replaced, not queued).
 *   - isPending is true while a request is awaiting a decision.
 *   - Hook outside the Provider falls back to window.confirm.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { AiPermissionProvider } from './useAiPermission'
import { useAiPermission } from './aiPermissionContext'

// Minimal Dialog stub that exposes accept/reject as imperative buttons we
// can click from the test, plus a marker for `request.title` so we can
// assert which payload is currently mounted.
function StubDialog({ request, onAccept, onReject }) {
  return (
    <div data-testid="stub-dialog">
      <div data-testid="dialog-title">{request.title}</div>
      <div data-testid="dialog-destructive">{String(request.destructive)}</div>
      <button data-testid="stub-accept" onClick={onAccept} type="button">
        accept
      </button>
      <button data-testid="stub-reject" onClick={onReject} type="button">
        reject
      </button>
    </div>
  )
}

// Probe component that calls the hook and exposes its API to the test via
// a ref-like callback. Rendering it inside a Provider gives us the real
// context value; rendering it outside exercises the fallback path.
function HookProbe({ onReady }) {
  const api = useAiPermission()
  onReady(api)
  return <div data-testid="probe" data-pending={String(api.isPending)} />
}

describe('useAiPermission + AiPermissionProvider', () => {
  beforeEach(() => {
    // Restore window.confirm between tests.
    if (window.confirm && 'mockRestore' in window.confirm) {
      window.confirm.mockRestore()
    }
  })

  it('requestPermission() returns a Promise', async () => {
    let api = null
    render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )
    const result = api.requestPermission({ title: 'x', summary: 'y' })
    expect(typeof result.then).toBe('function')
    // Cleanup: flush React's pending state update and resolve the
    // still-pending promise so it doesn't dangle past the test.
    await act(async () => {})
    const reject = document.querySelector('[data-testid="stub-reject"]')
    await act(async () => {
      reject.click()
    })
  })

  it('resolves to true when the user accepts', async () => {
    let api = null
    render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )

    let resolved = null
    const pending = api.requestPermission({ title: 'Accept me', summary: 'Click yes.' })
    pending.then((v) => {
      resolved = v
    })

    // Flush the setState that mounts the dialog.
    await act(async () => {})
    const accept = document.querySelector('[data-testid="stub-accept"]')
    expect(accept).toBeTruthy()
    await act(async () => {
      accept.click()
    })

    expect(resolved).toBe(true)
  })

  it('resolves to false when the user rejects', async () => {
    let api = null
    render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )

    let resolved = null
    const pending = api.requestPermission({ title: 'Reject me', summary: 'Click no.' })
    pending.then((v) => {
      resolved = v
    })

    await act(async () => {})
    const reject = document.querySelector('[data-testid="stub-reject"]')
    await act(async () => {
      reject.click()
    })

    expect(resolved).toBe(false)
  })

  it('sequential requests auto-reject the previous one (Sourcery + Codex fix)', async () => {
    // The old behavior left the prior promise pending forever — a
    // hang risk on rapid double-clicks or two components racing.
    // The Provider now auto-rejects (resolves false) the prior
    // request before opening the next one, so every caller gets a
    // deterministic boolean.
    let api = null
    render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )

    let firstResolved = 'unresolved'
    api.requestPermission({ title: 'First', summary: 'one' }).then((v) => {
      firstResolved = v
    })
    await act(async () => {})
    expect(document.querySelector('[data-testid="dialog-title"]').textContent).toBe('First')

    let secondResolved = 'unresolved'
    api.requestPermission({ title: 'Second', summary: 'two' }).then((v) => {
      secondResolved = v
    })
    // Microtask flush so the first promise's `.then` resolver runs.
    await act(async () => {})
    expect(document.querySelector('[data-testid="dialog-title"]').textContent).toBe('Second')
    // First request auto-rejected when the second one came in.
    expect(firstResolved).toBe(false)

    const accept = document.querySelector('[data-testid="stub-accept"]')
    await act(async () => {
      accept.click()
    })
    expect(secondResolved).toBe(true)
  })

  it('Loop V4: a superseded request resolves to false (auto-reject contract)', async () => {
    // It is not enough for the prior promise to settle eventually —
    // a caller awaiting it must see `false` so it can take its "no"
    // branch (toast "discarded", skip the fetch) without waiting for
    // the second decision. The load-bearing invariants:
    //   (a) any caller awaiting the FIRST promise unblocks with `false`,
    //   (b) the mounted dialog now belongs to the SECOND request — no
    //       stacking, no queue,
    //   (c) the second request's caller still gets a real answer when
    //       the user clicks Accept/Reject.
    let api = null
    render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )

    let first
    await act(async () => {
      first = api.requestPermission({ title: 'First-loopV4', summary: 's1' })
    })
    // Sanity: the first dialog is up.
    expect(document.querySelector('[data-testid="dialog-title"]').textContent).toBe('First-loopV4')

    // Fire a second request — should auto-reject the first.
    let second
    await act(async () => {
      second = api.requestPermission({ title: 'Second-loopV4', summary: 's2' })
    })

    // (a) Awaiting first directly yields false — never hangs. This is
    // what every caller depends on; if this regresses, rapid double-
    // clicks deadlock the UI forever.
    await expect(first).resolves.toBe(false)

    // (b) The dialog mounted now is for the second request.
    expect(document.querySelector('[data-testid="dialog-title"]').textContent).toBe('Second-loopV4')

    // (c) Cleanup: accept the second so the dangling promise resolves
    // to the user's actual choice.
    const accept = document.querySelector('[data-testid="stub-accept"]')
    await act(async () => {
      accept.click()
    })
    await expect(second).resolves.toBe(true)
  })

  it('isPending is true while awaiting a decision, false after close', async () => {
    let api = null
    const view = render(
      <AiPermissionProvider Dialog={StubDialog}>
        <HookProbe onReady={(a) => (api = a)} />
      </AiPermissionProvider>,
    )

    // Before any request: false.
    expect(view.container.querySelector('[data-testid="probe"]').dataset.pending).toBe('false')

    api.requestPermission({ title: 'Pending check', summary: 's' })
    await act(async () => {})
    expect(view.container.querySelector('[data-testid="probe"]').dataset.pending).toBe('true')

    // Reject and confirm it flips back.
    const reject = document.querySelector('[data-testid="stub-reject"]')
    await act(async () => {
      reject.click()
    })
    expect(view.container.querySelector('[data-testid="probe"]').dataset.pending).toBe('false')
  })

  it('hook outside the Provider falls back to window.confirm (returns true)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let api = null
    render(<HookProbe onReady={(a) => (api = a)} />)
    const result = await api.requestPermission({ summary: 'Outside provider.' })
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // The fallback message includes the summary.
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Outside provider/)
    expect(result).toBe(true)
    confirmSpy.mockRestore()
  })

  it('hook outside the Provider falls back to window.confirm (returns false on cancel)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    let api = null
    render(<HookProbe onReady={(a) => (api = a)} />)
    const result = await api.requestPermission({ summary: 'Cancel me.' })
    expect(result).toBe(false)
    confirmSpy.mockRestore()
  })
})

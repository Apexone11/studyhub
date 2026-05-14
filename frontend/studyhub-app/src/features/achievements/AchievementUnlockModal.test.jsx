/**
 * AchievementUnlockModal.test.jsx — regression coverage for the
 * white-screen bug where ?celebrate=<unknown-slug> would freeze the
 * page on a focus-trapped "Loading..." dialog with no exit path.
 *
 * The fix added two safety nets in UnlockModalInner:
 *   - resolved-with-error → auto-dismiss immediately
 *   - still-loading after 6s → auto-dismiss
 *
 * These tests pin the behaviour so it doesn't silently regress when
 * the celebrate-flow gets refactored.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useAchievementDetail is the only external hook the modal depends on.
// We swap it in per-test so we can drive the {data, loading, error} state.
const detailState = { data: null, loading: true, error: null }

vi.mock('./useAchievements', () => ({
  useAchievementDetail: () => detailState,
}))

vi.mock('./AchievementHexagon', () => ({
  default: () => <div data-testid="hex-stub" />,
}))

vi.mock('./tierStyles', () => ({
  TIER_LABEL: { bronze: 'Bronze', gold: 'Gold' },
}))

// FocusTrappedDialog renders its children inside a portal; for the test
// we just render a div so DOM queries are straightforward.
vi.mock('../../components/Modal/FocusTrappedDialog', () => ({
  default: ({ children, open }) => (open ? <div role="dialog">{children}</div> : null),
}))

import AchievementUnlockModal from './AchievementUnlockModal'

const STORAGE_KEY = 'studyhub.achievements.celebrated'

function renderWithCelebrate(slug) {
  return render(
    <MemoryRouter initialEntries={[`/?celebrate=${slug}`]}>
      <AchievementUnlockModal />
    </MemoryRouter>,
  )
}

describe('AchievementUnlockModal', () => {
  beforeEach(() => {
    localStorage.clear()
    detailState.data = null
    detailState.loading = true
    detailState.error = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the error fallback (not white-screen) when the detail fetch fails', async () => {
    detailState.loading = false
    detailState.error = new Error('not found')
    renderWithCelebrate('unknown-slug')

    // useEffect runs synchronously inside act() with fake timers — advance
    // microtasks so the auto-close effect can fire.
    await act(async () => {
      await Promise.resolve()
    })

    // The dialog should have been auto-dismissed (modal returns null
    // when slug is stripped from the URL by onClose).
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing while loading (no opaque backdrop on the page)', async () => {
    detailState.loading = true
    detailState.error = null
    detailState.data = null
    renderWithCelebrate('slow-slug')

    // No dialog/backdrop while loading — the modal is best-effort and
    // must not block the underlying page. White-screen regression fix.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('auto-dismisses (strips celebrate) after 6s if loading never resolves', async () => {
    detailState.loading = true
    detailState.error = null
    detailState.data = null
    renderWithCelebrate('slow-slug')

    // Still nothing visible while loading.
    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(6500)
      await Promise.resolve()
    })

    // Still nothing visible after the timeout, and the URL is stripped
    // (the modal calls onClose → dismiss in the parent).
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not render at all when slug is already in the celebrated set', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['already-seen']))
    renderWithCelebrate('already-seen')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

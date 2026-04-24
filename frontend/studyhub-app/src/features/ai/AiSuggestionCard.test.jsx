/**
 * AiSuggestionCard.test.jsx — Phase 3 component coverage.
 *
 * Pins the 5-state matrix + the security-relevant client behaviors:
 *   - flag-off renders nothing (regression for fail-closed contract).
 *   - dismiss + refresh hit the right endpoints with credentials.
 *   - 429 on refresh disables the button (UI-spam quota-burn guard).
 *   - dismiss is optimistic; a server error reconciles by re-showing.
 *
 * The MSW default in `src/test/server.js` returns `enabled: false`
 * for every flag, so the flag-off path is the implicit baseline —
 * tests that need the card to render must override the flag handler.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import { clearDesignV2FlagCache } from '../../lib/designV2Flags'
import AiSuggestionCard from './AiSuggestionCard'

const SUGGESTION = {
  id: 7,
  text: 'Review chapter 3 of Organic Chemistry.',
  ctaLabel: 'Open in Hub AI',
  ctaAction: 'open_chat',
  generatedAt: '2026-04-24T10:00:00Z',
}

function enableFlag() {
  server.use(
    http.get('http://localhost:4000/api/flags/evaluate/design_v2_ai_card', () =>
      HttpResponse.json({ enabled: true, reason: 'ENABLED' }),
    ),
  )
}

function renderCard() {
  // Cache is module-level on the flag hook — clear it so each test
  // starts with a fresh evaluation, otherwise the first test's flag
  // state leaks into all the others.
  clearDesignV2FlagCache()
  return render(
    <MemoryRouter>
      <AiSuggestionCard />
    </MemoryRouter>,
  )
}

describe('AiSuggestionCard', () => {
  it('renders nothing when design_v2_ai_card flag is off (fail-closed)', async () => {
    // No flag override → default MSW handler returns enabled: false.
    const { container } = renderCard()
    // Wait long enough for the flag fetch to resolve.
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('renders the loading skeleton while the suggestion fetch is in flight', async () => {
    enableFlag()
    server.use(http.get('http://localhost:4000/api/ai/suggestions', () => new Promise(() => {})))
    renderCard()
    const skeleton = await screen.findByRole('status')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the happy-path with suggestion text + CTA + dismiss + refresh', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestion-card')).toBeInTheDocument()
    })
    expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SUGGESTION.ctaLabel })).toBeInTheDocument()
    expect(screen.getByTestId('ai-suggestion-dismiss')).toBeInTheDocument()
    expect(screen.getByTestId('ai-suggestion-refresh')).toBeInTheDocument()
  })

  it('renders the empty state when the API returns suggestion: null', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: null, quotaExhausted: false }),
      ),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(/no suggestions right now/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/check back later/i)).toBeInTheDocument()
    // Dismiss is hidden in the empty state — nothing to dismiss.
    expect(screen.queryByTestId('ai-suggestion-dismiss')).not.toBeInTheDocument()
  })

  it('renders the quota-exhausted state when the API returns quotaExhausted: true', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: null, quotaExhausted: true }),
      ),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestion-quota')).toBeInTheDocument()
    })
    // Component uses a curly apostrophe in copy, so don't pin to the
    // straight `'` — match the stable substring instead.
    expect(screen.getByTestId('ai-suggestion-quota').textContent).toMatch(/AI budget/i)
  })

  it('renders the error state on a non-OK response', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(/couldn[’']t load right now/i)).toBeInTheDocument()
    })
    // Try-again button is the only action in the error state.
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('refresh button POSTs to /refresh and re-renders with the new suggestion', async () => {
    enableFlag()
    let refreshCalled = false
    let refreshCredentials = null
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
      http.post('http://localhost:4000/api/ai/suggestions/refresh', ({ request }) => {
        refreshCalled = true
        refreshCredentials = request.credentials
        return HttpResponse.json({
          suggestion: { ...SUGGESTION, id: 99, text: 'Brand new suggestion.' },
          quotaExhausted: false,
        })
      }),
    )
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestion-card')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ai-suggestion-refresh'))
    await waitFor(() => {
      expect(screen.getByText('Brand new suggestion.')).toBeInTheDocument()
    })
    expect(refreshCalled).toBe(true)
    // Cookie auth: every call must include credentials.
    expect(refreshCredentials).toBe('include')
  })

  it('disables the refresh button after a 429 from /refresh (rate-limit guard)', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
      http.post('http://localhost:4000/api/ai/suggestions/refresh', () =>
        HttpResponse.json({ error: 'rate limited' }, { status: 429 }),
      ),
    )
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestion-card')).toBeInTheDocument()
    })
    const btn = screen.getByTestId('ai-suggestion-refresh')
    await user.click(btn)
    await waitFor(() => {
      expect(screen.getByTestId('ai-suggestion-refresh')).toBeDisabled()
    })
  })

  it('dismiss optimistically hides the card and calls /:id/dismiss', async () => {
    enableFlag()
    let dismissedPath = ''
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
      http.post('http://localhost:4000/api/ai/suggestions/:id/dismiss', ({ params }) => {
        dismissedPath = `/api/ai/suggestions/${params.id}/dismiss`
        return HttpResponse.json({ ok: true })
      }),
    )
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ai-suggestion-dismiss'))
    // Optimistic: text disappears immediately, before the network round-trip.
    await waitFor(() => {
      expect(screen.queryByText(SUGGESTION.text)).not.toBeInTheDocument()
    })
    expect(dismissedPath).toBe(`/api/ai/suggestions/${SUGGESTION.id}/dismiss`)
  })

  it('reconciles the dismiss optimistic update when the server returns 500', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
      http.post('http://localhost:4000/api/ai/suggestions/:id/dismiss', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ai-suggestion-dismiss'))
    // After the server error the suggestion comes back.
    await waitFor(() => {
      expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument()
    })
  })

  it('keeps the empty state when dismiss returns 404 (already dismissed elsewhere)', async () => {
    enableFlag()
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', () =>
        HttpResponse.json({ suggestion: SUGGESTION, quotaExhausted: false }),
      ),
      http.post('http://localhost:4000/api/ai/suggestions/:id/dismiss', () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderCard()
    await waitFor(() => {
      expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ai-suggestion-dismiss'))
    // 404 = "another tab already dismissed it" — the optimistic empty
    // state is correct, do not reconcile.
    await waitFor(() => {
      expect(screen.queryByText(SUGGESTION.text)).not.toBeInTheDocument()
    })
    expect(screen.getByText(/no suggestions right now/i)).toBeInTheDocument()
  })

  it('sends credentials: include on the initial GET so cookie auth works', async () => {
    enableFlag()
    let seenCredentials = ''
    server.use(
      http.get('http://localhost:4000/api/ai/suggestions', ({ request }) => {
        seenCredentials = request.credentials
        return HttpResponse.json({ suggestion: null, quotaExhausted: false })
      }),
    )
    renderCard()
    await waitFor(() => {
      expect(seenCredentials).toBe('include')
    })
  })
})

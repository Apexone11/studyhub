import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GifSearchPanel from './GifSearchPanel'

vi.mock('../config', () => ({ TENOR_API_KEY: '' }))

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('GifSearchPanel', () => {
  it('does not call Tenor when no API key is configured', async () => {
    globalThis.fetch = vi.fn()

    render(<GifSearchPanel onSelect={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search for GIFs...'), {
      target: { value: 'calculus' },
    })

    await waitFor(() => {
      expect(screen.getByText('GIF search is unavailable')).toBeInTheDocument()
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

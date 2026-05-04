import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GifSearchPanel from './GifSearchPanel'

vi.mock('../config', () => ({ API: 'http://test.local' }))

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('GifSearchPanel', () => {
  it('shows "GIF search is unavailable" when the proxy returns 503', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'GIF search is not configured on this server.' }),
    })

    render(<GifSearchPanel onSelect={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search for GIFs...'), {
      target: { value: 'calculus' },
    })

    await waitFor(() => {
      expect(screen.getByText('GIF search is unavailable')).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gifs/search?q=calculus'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('renders results returned by the backend proxy', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'g1',
            preview: 'https://media.tenor.com/g1.gif',
            full: 'https://media.tenor.com/g1-full.gif',
            title: 'Yes',
          },
        ],
      }),
    })

    const onSelect = vi.fn()
    render(<GifSearchPanel onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search for GIFs...'), {
      target: { value: 'yes' },
    })

    await waitFor(() => {
      expect(screen.getByAltText('Yes')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByAltText('Yes').closest('button'))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g1', preview: expect.any(String) }),
    )
  })
})

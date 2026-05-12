import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BioEditor from './BioEditor'

vi.mock('../../config', () => ({ API: 'http://test.local' }))
vi.mock('../../lib/toast', () => ({ showToast: vi.fn() }))

const originalFetch = globalThis.fetch

describe('BioEditor', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('shows current bio in collapsed state', () => {
    render(<BioEditor initialBio="I study CS." onSaved={() => {}} />)
    expect(screen.getByTestId('bio-edit-trigger')).toHaveTextContent('I study CS.')
  })

  it('shows placeholder when bio is empty', () => {
    render(<BioEditor initialBio="" onSaved={() => {}} />)
    expect(screen.getByTestId('bio-edit-trigger')).toHaveTextContent(/Add a short bio/i)
  })

  it('enters edit mode on click and shows character counter', () => {
    render(<BioEditor initialBio="hi" onSaved={() => {}} />)
    fireEvent.click(screen.getByTestId('bio-edit-trigger'))
    expect(screen.getByTestId('bio-editor-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('bio-char-count')).toHaveTextContent('2/500')
  })

  it('cancels with Escape without saving', async () => {
    const onSaved = vi.fn()
    render(<BioEditor initialBio="original" onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('bio-edit-trigger'))
    const textarea = screen.getByTestId('bio-editor-textarea')
    fireEvent.change(textarea, { target: { value: 'changed' } })
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await screen.findByTestId('bio-edit-trigger')).toHaveTextContent('original')
  })

  it('hydrates from server response (A4) on save', async () => {
    const onSaved = vi.fn()
    // Server normalizes the trimmed bio
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { bio: 'trimmed by server' } }),
    })
    render(<BioEditor initialBio="" onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('bio-edit-trigger'))
    const textarea = screen.getByTestId('bio-editor-textarea')
    fireEvent.change(textarea, { target: { value: '  pending  ' } })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('trimmed by server'))
  })

  it('does NOT save when value is unchanged', async () => {
    const onSaved = vi.fn()
    render(<BioEditor initialBio="same" onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('bio-edit-trigger'))
    const textarea = screen.getByTestId('bio-editor-textarea')
    fireEvent.blur(textarea)
    await waitFor(() => expect(screen.queryByTestId('bio-editor-textarea')).not.toBeInTheDocument())
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

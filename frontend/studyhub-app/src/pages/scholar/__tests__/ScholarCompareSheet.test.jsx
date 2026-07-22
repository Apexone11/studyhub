/**
 * ScholarCompareSheet.test.jsx — compare-matrix unit coverage.
 *
 * Pins the sheet's public contract:
 *   - One column per selected paper id, in selection order.
 *   - Ids missing from the loaded result list get a stub column with a
 *     paper-page link instead of crashing.
 *   - Open-access row renders the read-now phrasing.
 *   - Close button fires onClose.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScholarCompareSheet from '../compare/ScholarCompareSheet'

const PAPERS = [
  {
    id: 'doi:10.1234/a',
    title: 'Paper A',
    venue: 'NeurIPS',
    publishedAt: '2021-06-01T00:00:00.000Z',
    citationCount: 1200,
    openAccess: true,
    source: 'semanticScholar',
    abstract: 'ABSTRACT First study of things.',
    authors: [{ name: 'Ada Lovelace' }],
  },
  {
    id: 'doi:10.1234/b',
    title: 'Paper B',
    citationCount: 3,
    openAccess: false,
    source: 'crossref',
    tldr: 'Second study, summarized.',
  },
]

function renderSheet(props = {}) {
  return render(
    <MemoryRouter>
      <ScholarCompareSheet
        paperIds={['doi:10.1234/a', 'doi:10.1234/b']}
        papers={PAPERS}
        onClose={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('ScholarCompareSheet', () => {
  it('renders one titled column per selected paper', () => {
    renderSheet()
    expect(screen.getByRole('link', { name: 'Paper A' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Paper B' })).toBeInTheDocument()
    expect(screen.getByText('Yes — free PDF')).toBeInTheDocument()
    expect(screen.getByText('Second study, summarized.')).toBeInTheDocument()
    // cleanAbstract strips the ABSTRACT lead-in in the summary row.
    expect(screen.getByText('First study of things.')).toBeInTheDocument()
  })

  it('renders a stub column for an id no longer in the results', () => {
    renderSheet({ paperIds: ['doi:10.1234/a', 'doi:10.1234/gone'] })
    expect(screen.getByText('No longer in these results')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open its paper page/i })).toBeInTheDocument()
  })

  it('fires onClose from the close button', async () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /close comparison/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

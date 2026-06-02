import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CourseEquivalents from './CourseEquivalents'

vi.mock('../config', () => ({ API: 'http://test.local' }))

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <CourseEquivalents courseId={42} {...props} />
    </MemoryRouter>,
  )
}

const sampleEquivalents = [
  {
    id: 7,
    code: 'MATH 152',
    name: 'Calculus II',
    school: { id: 2, name: 'State University' },
    topics: [{ topicTag: 'calculus', displayName: 'Calculus' }],
  },
  {
    id: 9,
    code: 'MAT 200',
    name: 'Integral Calculus',
    school: { id: 3, name: 'City College' },
    topics: [{ topicTag: 'calculus', displayName: 'Calculus' }],
  },
]

describe('CourseEquivalents', () => {
  it('renders equivalents with school name and linking topic', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ equivalents: sampleEquivalents }),
    })

    renderCard()

    await waitFor(() => {
      expect(screen.getByText('Equivalent at other schools')).toBeInTheDocument()
    })
    expect(screen.getByText('MATH 152')).toBeInTheDocument()
    expect(screen.getByText(/State University/)).toBeInTheDocument()
    expect(screen.getByText(/City College/)).toBeInTheDocument()
    // Linking topic surfaces alongside the school name (appears on each row).
    expect(screen.getAllByText(/Calculus/).length).toBeGreaterThan(0)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/courses/42/equivalents'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('links each equivalent to the sheets browse for that course', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ equivalents: [sampleEquivalents[0]] }),
    })

    renderCard()

    const link = await screen.findByRole('link', { name: /MATH 152/ })
    expect(link.getAttribute('href')).toBe('/sheets?courseId=7')
  })

  it('renders nothing when the list is empty (flag off / no aliases)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ equivalents: [] }),
    })

    const { container } = renderCard()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Equivalent at other schools')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the fetch returns a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
    })

    const { container } = renderCard()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Equivalent at other schools')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const { container } = renderCard()

    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('does not fetch and renders nothing when courseId is absent', async () => {
    globalThis.fetch = vi.fn()

    const { container } = render(
      <MemoryRouter>
        <CourseEquivalents courseId={null} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

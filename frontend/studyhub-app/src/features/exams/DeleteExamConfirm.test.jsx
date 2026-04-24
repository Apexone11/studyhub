/**
 * DeleteExamConfirm.test.jsx — Phase 2 Day 4 write-path coverage.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import DeleteExamConfirm from './DeleteExamConfirm'

const EXAM = {
  id: 42,
  title: 'Biology Midterm',
  examDate: '2026-05-05T14:00:00Z',
  course: { id: 101, code: 'BIOL201' },
}

describe('DeleteExamConfirm', () => {
  it('returns null when closed or when no exam is supplied', () => {
    const { container: closedEmpty } = render(
      <DeleteExamConfirm open={false} exam={EXAM} onClose={() => {}} onDeleted={() => {}} />,
    )
    expect(closedEmpty.firstChild).toBeNull()

    const { container: openNoExam } = render(
      <DeleteExamConfirm open exam={null} onClose={() => {}} onDeleted={() => {}} />,
    )
    expect(openNoExam.firstChild).toBeNull()
  })

  it('renders the destructive copy including the exam title', () => {
    render(<DeleteExamConfirm open exam={EXAM} onClose={() => {}} onDeleted={() => {}} />)
    expect(screen.getByRole('heading', { name: /delete this exam\?/i })).toBeInTheDocument()
    // Title appears inside the description copy.
    expect(screen.getByText(/biology midterm/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete exam$/i })).toBeInTheDocument()
  })

  it('calls DELETE /api/exams/:id then onDeleted + onClose on 204', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDeleted = vi.fn()
    let deletedPath = ''
    server.use(
      http.delete('http://localhost:4000/api/exams/:id', ({ params }) => {
        deletedPath = `/api/exams/${params.id}`
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<DeleteExamConfirm open exam={EXAM} onClose={onClose} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: /^delete exam$/i }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(onDeleted).toHaveBeenCalledWith(42)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(deletedPath).toBe('/api/exams/42')
  })

  it('surfaces the server error message on a 403 and does NOT call onDeleted', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDeleted = vi.fn()
    server.use(
      http.delete('http://localhost:4000/api/exams/:id', () =>
        HttpResponse.json({ error: 'You do not own this exam.' }, { status: 403 }),
      ),
    )

    render(<DeleteExamConfirm open exam={EXAM} onClose={onClose} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: /^delete exam$/i }))

    await waitFor(() => {
      expect(screen.getByText(/you do not own this exam/i)).toBeInTheDocument()
    })
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel button fires onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DeleteExamConfirm open exam={EXAM} onClose={onClose} onDeleted={() => {}} />)
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

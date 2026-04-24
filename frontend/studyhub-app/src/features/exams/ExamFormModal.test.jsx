/**
 * ExamFormModal.test.jsx — Phase 2 Day 4 write-path coverage.
 *
 * Form-level tests: the controlled-inputs wiring, validation, the
 * POST (add) vs PATCH (edit) branch, and the course-locked state on
 * edit. Server interactions go through the shared MSW test server.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import ExamFormModal from './ExamFormModal'

const SESSION_USER = {
  id: 42,
  username: 'tester',
  role: 'student',
  accountType: 'student',
  email: 'tester@studyhub.test',
  csrfToken: 'test-csrf',
  enrollments: [
    {
      id: 900,
      courseId: 101,
      course: { id: 101, code: 'BIOL201', name: 'Intro to Biology' },
    },
    {
      id: 901,
      courseId: 102,
      course: { id: 102, code: 'CMSC131', name: 'OOP I' },
    },
  ],
}

function renderWithSession(ui) {
  // Session bootstrap: MSW intercepts /api/auth/me so SessionProvider
  // resolves without hitting the real backend. The default catch-all
  // in `src/test/server.js` returns empty OK, so we explicitly mock
  // /api/auth/me here.
  server.use(http.get('http://localhost:4000/api/auth/me', () => HttpResponse.json(SESSION_USER)))
  return render(
    <MemoryRouter>
      <SessionProvider>{ui}</SessionProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExamFormModal — shared add / edit form', () => {
  it('returns null and renders nothing when open=false', () => {
    const { container } = renderWithSession(
      <ExamFormModal open={false} onClose={() => {}} onSaved={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the add-mode title + default values when no exam is supplied', async () => {
    renderWithSession(<ExamFormModal open onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add upcoming exam/i })).toBeInTheDocument()
    })
    // Two courses rendered as options from the session user's enrollments.
    expect(screen.getByText(/BIOL201/)).toBeInTheDocument()
    expect(screen.getByText(/CMSC131/)).toBeInTheDocument()
    // Preparedness slider starts at 0.
    expect(screen.getByLabelText(/preparedness percent/i)).toHaveValue('0')
    // Primary CTA says "Add exam".
    expect(screen.getByRole('button', { name: /^add exam$/i })).toBeInTheDocument()
  })

  it('renders edit-mode copy + pre-filled fields + locked Course select when exam is supplied', async () => {
    const exam = {
      id: 7,
      title: 'Biology Midterm',
      examDate: '2026-05-05T14:00:00Z',
      preparednessPercent: 62,
      location: 'ITE 231',
      notes: 'Chapters 1-6',
      course: { id: 101, code: 'BIOL201', name: 'Intro to Biology' },
    }
    renderWithSession(<ExamFormModal open exam={exam} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit exam/i })).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Biology Midterm')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ITE 231')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Chapters 1-6')).toBeInTheDocument()
    // Course dropdown is locked on edit (disabled).
    const courseSelect = screen.getByRole('combobox')
    expect(courseSelect).toBeDisabled()
    // Slider reflects the saved 62%.
    expect(screen.getByLabelText(/preparedness percent/i)).toHaveValue('62')
    // Primary CTA says "Save changes".
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('POSTs to /api/exams on add-submit and calls onSaved + onClose', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    let receivedBody = null
    server.use(
      http.post('http://localhost:4000/api/exams', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json(
          {
            exam: {
              id: 123,
              title: receivedBody.title,
              examDate: receivedBody.examDate,
              preparednessPercent: receivedBody.preparednessPercent,
              course: { id: receivedBody.courseId, code: 'BIOL201', name: 'Intro to Biology' },
            },
          },
          { status: 201 },
        )
      }),
    )

    renderWithSession(<ExamFormModal open onClose={onClose} onSaved={onSaved} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add upcoming exam/i })).toBeInTheDocument()
    })

    // Fill required fields.
    await user.type(screen.getByLabelText(/title/i), 'My new exam')
    // userEvent.type on date inputs is flaky across jsdom/user-event
    // combinations. fireEvent.change goes through React's synthetic
    // event system and reliably updates controlled state.
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-12-01' } })

    await user.click(screen.getByRole('button', { name: /^add exam$/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(receivedBody.title).toBe('My new exam')
    expect(receivedBody.courseId).toBe(101) // first enrollment's courseId
    expect(receivedBody.preparednessPercent).toBe(0)
    expect(typeof receivedBody.examDate).toBe('string')
  })

  it('PATCHes to /api/exams/:id on edit-submit and omits courseId from the body', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    let receivedBody = null
    let receivedPath = ''
    server.use(
      http.patch('http://localhost:4000/api/exams/:id', async ({ request, params }) => {
        receivedBody = await request.json()
        receivedPath = `/api/exams/${params.id}`
        return HttpResponse.json({
          exam: {
            id: Number(params.id),
            title: receivedBody.title,
            examDate: '2026-05-05T14:00:00Z',
            preparednessPercent: receivedBody.preparednessPercent ?? 50,
            course: { id: 101, code: 'BIOL201', name: 'Intro to Biology' },
          },
        })
      }),
    )

    const exam = {
      id: 7,
      title: 'Biology Midterm',
      examDate: '2026-05-05T14:00:00Z',
      preparednessPercent: 50,
      course: { id: 101, code: 'BIOL201', name: 'Intro to Biology' },
    }
    renderWithSession(<ExamFormModal open exam={exam} onClose={onClose} onSaved={onSaved} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit exam/i })).toBeInTheDocument()
    })

    // fireEvent.change over user.clear+type: controlled-input state
    // races between clear() and type() in this combination of React 19
    // + user-event + jsdom. fireEvent.change sets the value atomically
    // and updates React state in one shot. Look up by label, not by
    // displayValue, so we get the current <input> reference even after
    // the state changes.
    // Label text is "Title *" (Input renders a visually-hidden required
    // asterisk inside the label), so we match with a prefix regex.
    const titleInput = screen.getByLabelText(/title/i)
    fireEvent.change(titleInput, { target: { value: 'Biology Final' } })
    await waitFor(() => expect(titleInput).toHaveValue('Biology Final'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(receivedPath).toBe('/api/exams/7')
    expect(receivedBody.title).toBe('Biology Final')
    // courseId is NOT PATCHable — the form strips it from the body on
    // edit to match the backend's patchBodySchema.
    expect(receivedBody).not.toHaveProperty('courseId')
  })

  it('surfaces the server error message when the API rejects the submit', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('http://localhost:4000/api/exams', () =>
        HttpResponse.json({ error: 'Course is closed for new exams.' }, { status: 403 }),
      ),
    )

    renderWithSession(<ExamFormModal open onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add upcoming exam/i })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/title/i), 'x')
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-12-01' } })
    await user.click(screen.getByRole('button', { name: /^add exam$/i }))

    await waitFor(() => {
      expect(screen.getByText(/course is closed for new exams/i)).toBeInTheDocument()
    })
  })
})

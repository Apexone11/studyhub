import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { AppError, ERROR_CODES, handleRouteError } = require('../src/core/http/errors')

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
}

describe('handleRouteError', () => {
  it('uses the shared error envelope and preserves explicit error codes', () => {
    const res = createMockResponse()

    handleRouteError(res, new AppError('Verify first.', 403, ERROR_CODES.EMAIL_NOT_VERIFIED))

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Verify first.',
      code: ERROR_CODES.EMAIL_NOT_VERIFIED,
    })
  })

  it('maps uncoded server errors to INTERNAL and captures them', () => {
    const res = createMockResponse()
    const captureError = vi.fn()

    handleRouteError(res, new Error('Unexpected failure'), {
      captureError,
      route: '/api/test',
      method: 'POST',
    })

    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      route: '/api/test',
      method: 'POST',
    })
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unexpected failure',
      code: ERROR_CODES.INTERNAL,
    })
  })
})

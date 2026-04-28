/**
 * groupMediaService.test.js — Regression coverage for the XHR-backed
 * upload helper.
 *
 * The bug this guards against: `uploadGroupMedia` used a raw XMLHttpRequest
 * which bypassed the window.fetch shim that auto-injects X-CSRF-Token on
 * mutations. Result: every banner / discussion attachment / resource upload
 * 403'd with "Missing CSRF token." until a parallel fetch warmed the cache.
 *
 * The fix resolves the cached CSRF token (bootstrapping it via /api/auth/me
 * if absent) and sets it on the XHR alongside X-Requested-With and the
 * native bearer headers when running inside Capacitor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mocks must be hoisted before the import.
vi.mock('../../lib/session', () => ({
  getCachedCsrfToken: vi.fn(),
  setCachedCsrfToken: vi.fn(),
  getStoredUser: vi.fn(),
}))
vi.mock('../../lib/mobile/detectMobile', () => ({
  isNativePlatform: vi.fn(() => false),
}))
vi.mock('../../lib/mobile/nativeToken', () => ({
  getNativeToken: vi.fn(() => ''),
}))

import { uploadGroupMedia } from './groupMediaService'
import { getCachedCsrfToken, setCachedCsrfToken, getStoredUser } from '../../lib/session'
import { isNativePlatform } from '../../lib/mobile/detectMobile'
import { getNativeToken } from '../../lib/mobile/nativeToken'

class FakeXhr {
  constructor() {
    this.headers = {}
    this.status = 0
    this.responseText = ''
    this.upload = { addEventListener: vi.fn() }
    this._listeners = {}
    this.withCredentials = false
    this.aborted = false
  }
  open(method, url, async) {
    this.method = method
    this.url = url
    this.async = async
  }
  setRequestHeader(name, value) {
    this.headers[name] = value
  }
  addEventListener(event, handler) {
    this._listeners[event] = handler
  }
  send(body) {
    this.body = body
    FakeXhr.lastInstance = this
  }
  abort() {
    this.aborted = true
    this._listeners.abort?.()
  }
  _fireLoad(status, responseText) {
    this.status = status
    this.responseText = responseText
    this._listeners.load?.()
  }
}

describe('uploadGroupMedia (CSRF + auth header injection)', () => {
  let fetchSpy

  beforeEach(() => {
    vi.clearAllMocks()
    FakeXhr.lastInstance = null
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    isNativePlatform.mockReturnValue(false)
    getNativeToken.mockReturnValue('')
  })

  it('sends X-CSRF-Token from the cached session token', async () => {
    getCachedCsrfToken.mockReturnValue('cached-csrf-abc')
    getStoredUser.mockReturnValue({ id: 1 })

    const file = new File(['x'], 'banner.png', { type: 'image/png' })
    const promise = uploadGroupMedia(42, file)

    // Wait a microtask so the helper's `await resolveCsrfToken` resolves
    // and the XHR is constructed.
    await Promise.resolve()
    await Promise.resolve()

    const xhr = FakeXhr.lastInstance
    expect(xhr).toBeTruthy()
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toContain('/api/study-groups/42/resources/upload')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.headers['X-CSRF-Token']).toBe('cached-csrf-abc')
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')
    // Native headers should be absent when not in Capacitor.
    expect(xhr.headers['X-Client']).toBeUndefined()
    expect(xhr.headers.Authorization).toBeUndefined()

    xhr._fireLoad(201, JSON.stringify({ url: '/uploads/group-media/x.png' }))
    const result = await promise
    expect(result.url).toBe('/uploads/group-media/x.png')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('bootstraps the CSRF token via /api/auth/me when none is cached', async () => {
    getCachedCsrfToken.mockReturnValue('')
    getStoredUser.mockReturnValue({ id: 7 })
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ csrfToken: 'fresh-csrf-xyz' }),
    })

    const file = new File(['x'], 'banner.jpg', { type: 'image/jpeg' })
    const promise = uploadGroupMedia(99, file)

    // Wait until the helper has constructed the XHR after the bootstrap
    // fetch + .json() promise chain settles.
    await vi.waitFor(() => {
      expect(FakeXhr.lastInstance).toBeTruthy()
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(setCachedCsrfToken).toHaveBeenCalledWith('fresh-csrf-xyz')

    const xhr = FakeXhr.lastInstance
    expect(xhr.headers['X-CSRF-Token']).toBe('fresh-csrf-xyz')

    xhr._fireLoad(201, JSON.stringify({ url: '/uploads/group-media/y.jpg' }))
    await promise
  })

  it('skips CSRF resolution when the user is not signed in', async () => {
    getCachedCsrfToken.mockReturnValue('')
    getStoredUser.mockReturnValue(null)

    const file = new File(['x'], 'banner.gif', { type: 'image/gif' })
    const promise = uploadGroupMedia(11, file)

    await Promise.resolve()
    await Promise.resolve()

    expect(fetchSpy).not.toHaveBeenCalled()
    const xhr = FakeXhr.lastInstance
    expect(xhr.headers['X-CSRF-Token']).toBeUndefined()
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')

    xhr._fireLoad(401, JSON.stringify({ error: 'Auth required.' }))
    await expect(promise).rejects.toThrow(/Auth required/)
  })

  it('attaches X-Client + Authorization on the native (Capacitor) platform', async () => {
    getCachedCsrfToken.mockReturnValue('cached-csrf-abc')
    getStoredUser.mockReturnValue({ id: 1 })
    isNativePlatform.mockReturnValue(true)
    getNativeToken.mockReturnValue('native-bearer-jwt')

    const file = new File(['x'], 'banner.webp', { type: 'image/webp' })
    const promise = uploadGroupMedia(5, file)

    await Promise.resolve()
    await Promise.resolve()

    const xhr = FakeXhr.lastInstance
    expect(xhr.headers['X-Client']).toBe('mobile')
    expect(xhr.headers.Authorization).toBe('Bearer native-bearer-jwt')

    xhr._fireLoad(201, JSON.stringify({ url: '/uploads/group-media/z.webp' }))
    await promise
  })

  it('surfaces 429 quota errors with the structured snapshot', async () => {
    getCachedCsrfToken.mockReturnValue('cached-csrf-abc')
    getStoredUser.mockReturnValue({ id: 1 })

    const file = new File(['x'], 'banner.png', { type: 'image/png' })
    const promise = uploadGroupMedia(42, file)

    await Promise.resolve()
    await Promise.resolve()

    const xhr = FakeXhr.lastInstance
    xhr._fireLoad(
      429,
      JSON.stringify({ error: 'Quota.', quota: 5, used: 5, plan: 'free', resetsAt: 'soon' }),
    )

    await expect(promise).rejects.toMatchObject({
      status: 429,
      quota: { quota: 5, used: 5, plan: 'free', resetsAt: 'soon' },
    })
  })
})

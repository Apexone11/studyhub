// src/mobile/components/Toast.test.jsx

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { useToast } from '../hooks/useToast'

function Harness({ onReady }) {
  const api = useToast()
  // Surface the api to the test via a ref-prop callback.
  if (typeof onReady === 'function') onReady(api)
  return null
}

describe('Toast', () => {
  it('surfaces messages through the host and dismisses after duration', async () => {
    vi.useFakeTimers()
    let api = null
    render(
      <ToastProvider>
        <Harness
          onReady={(a) => {
            api = a
          }}
        />
      </ToastProvider>,
    )
    act(() => {
      api.show({ message: 'Saved', kind: 'success', duration: 1000 })
    })
    expect(screen.getByText('Saved')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.queryByText('Saved')).toBeNull()
    vi.useRealTimers()
  })

  it('imperatively dismisses a toast before its timer fires', () => {
    vi.useFakeTimers()
    let api = null
    render(
      <ToastProvider>
        <Harness
          onReady={(a) => {
            api = a
          }}
        />
      </ToastProvider>,
    )
    let id = null
    act(() => {
      id = api.show({ message: 'Gone', duration: 9999 })
    })
    expect(screen.getByText('Gone')).toBeTruthy()
    act(() => {
      api.dismiss(id)
    })
    expect(screen.queryByText('Gone')).toBeNull()
    vi.useRealTimers()
  })

  it('provides a no-op fallback when used outside the provider', () => {
    let api = null
    render(
      <Harness
        onReady={(a) => {
          api = a
        }}
      />,
    )
    expect(typeof api.show).toBe('function')
    expect(api.show({ message: 'x' })).toBe('')
  })

  it('dispatches an alert role for warn/error toasts', () => {
    let api = null
    render(
      <ToastProvider>
        <Harness
          onReady={(a) => {
            api = a
          }}
        />
      </ToastProvider>,
    )
    act(() => {
      api.show({ message: 'Boom', kind: 'error' })
    })
    const alert = screen.getByText('Boom')
    expect(alert.getAttribute('role')).toBe('alert')
    // cleanup — swipe up to dismiss
    fireEvent.touchStart(alert, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(alert, { touches: [{ clientY: 40 }] })
    fireEvent.touchEnd(alert, { changedTouches: [{ clientY: 40 }] })
  })
})

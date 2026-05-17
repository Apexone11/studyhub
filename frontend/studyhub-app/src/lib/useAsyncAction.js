/**
 * useAsyncAction — wraps an async function with pending/error state so
 * callers don't reinvent `useState(false)` + try/catch + finally on
 * every save button. Pairs naturally with PendingButton.
 *
 * Usage:
 *   const { run, pending, error, reset } = useAsyncAction(async (payload) => {
 *     const res = await fetch(...)
 *     if (!res.ok) throw new Error('Save failed')
 *     return res.json()
 *   })
 *
 *   <PendingButton pending={pending} onClick={() => run(formValue)}>Save</PendingButton>
 *   {error ? <div role="alert">{error.message}</div> : null}
 *
 * Behavior:
 *   - `run()` returns a promise resolving to the wrapped fn's return value,
 *     or rejecting with the thrown error. Callers can `await run()` and
 *     handle the result if they need to chain (navigate after save, etc).
 *   - `pending` flips to true while the call is in flight; clears in
 *     finally so it always resets even on error.
 *   - `error` exposes the thrown Error (not just the message) so callers
 *     can branch on `error.cause` / `error.code` if the wrapped fn sets
 *     them.
 *   - `reset()` clears `error` and `data` — useful before retrying.
 *   - Concurrent calls: a second `run()` while the first is pending is
 *     a no-op (returns the in-flight promise). Prevents double-submit
 *     when the user double-clicks.
 *   - Stale-set guard: state setters skip if the component unmounted
 *     between fn start and finish, so we don't trip React's "can't
 *     update an unmounted component" warning.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsyncAction(fn) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const mountedRef = useRef(true)
  const inFlightRef = useRef(null)

  // Keep the latest fn reference in a ref so the `run` callback's
  // identity stays stable across renders (important when callers pass
  // arrow functions inline).
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback((...args) => {
    if (inFlightRef.current) return inFlightRef.current
    if (mountedRef.current) {
      setPending(true)
      setError(null)
    }
    const promise = (async () => {
      try {
        const result = await fnRef.current(...args)
        if (mountedRef.current) {
          setData(result)
          setError(null)
        }
        return result
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
        throw err
      } finally {
        inFlightRef.current = null
        if (mountedRef.current) setPending(false)
      }
    })()
    inFlightRef.current = promise
    return promise
  }, [])

  const reset = useCallback(() => {
    if (!mountedRef.current) return
    setError(null)
    setData(null)
  }, [])

  return { run, pending, error, data, reset }
}

export default useAsyncAction

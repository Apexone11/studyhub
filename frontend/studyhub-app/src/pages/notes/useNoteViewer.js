import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API } from '../../config'
import { usePageTiming } from '../../lib/usePageTiming'

export function useNoteViewer() {
  const { id } = useParams()
  const [state, setState] = useState({ note: null, loading: true, error: null, fetchedId: id })
  const timing = usePageTiming('note')

  // When id changes, reset state in a single batch
  const needsReset = state.fetchedId !== id
  const current = needsReset ? { note: null, loading: true, error: null, fetchedId: id } : state
  if (needsReset) setState(current)

  useEffect(() => {
    let active = true

    timing.markFetchStart()
    fetch(`${API}/api/notes/${id}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : 'error')
        return res.json()
      })
      .then((data) => {
        timing.markFetchEnd()
        if (active) setState((prev) => ({ ...prev, note: data, loading: false }))
      })
      .catch((err) => {
        if (active) setState((prev) => ({ ...prev, error: err.message === 'not_found' ? 'not_found' : 'error', loading: false }))
      })

    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Report timing when note content arrives
  useEffect(() => {
    if (!current.loading && current.note) timing.markContentVisible()
  }, [current.loading, current.note, timing])

  return { note: current.note, loading: current.loading, error: current.error }
}

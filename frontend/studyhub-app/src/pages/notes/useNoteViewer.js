import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API } from '../../config'

export function useNoteViewer() {
  const { id } = useParams()
  const [state, setState] = useState({ note: null, loading: true, error: null, fetchedId: id })

  // When id changes, reset state in a single batch
  const needsReset = state.fetchedId !== id
  const current = needsReset ? { note: null, loading: true, error: null, fetchedId: id } : state
  if (needsReset) setState(current)

  useEffect(() => {
    let active = true

    fetch(`${API}/api/notes/${id}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : 'error')
        return res.json()
      })
      .then((data) => {
        if (active) setState((prev) => ({ ...prev, note: data, loading: false }))
      })
      .catch((err) => {
        if (active) setState((prev) => ({ ...prev, error: err.message === 'not_found' ? 'not_found' : 'error', loading: false }))
      })

    return () => { active = false }
  }, [id])

  return { note: current.note, loading: current.loading, error: current.error }
}

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'studyhub.continuity.studyStatus'

const STUDY_STATUSES = [
  { value: 'to-review', label: 'To review', color: 'var(--sh-warning)' },
  { value: 'studying', label: 'Studying', color: 'var(--sh-brand)' },
  { value: 'done', label: 'Done', color: 'var(--sh-success)' },
]

function readStatuses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeStatuses(statuses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses))
  } catch { /* quota exceeded or private browsing */ }
}

/**
 * Get or set a study-status marker for a single sheet.
 * Returns: { status, setStatus, STUDY_STATUSES }
 */
export function useStudyStatus(sheetId) {
  const [statuses, setStatuses] = useState(readStatuses)

  const entry = sheetId ? statuses[sheetId] || null : null

  const setStatus = useCallback((status, sheet) => {
    if (!sheetId) return
    setStatuses((prev) => {
      const next = { ...prev }
      if (!status) {
        delete next[sheetId]
      } else {
        next[sheetId] = {
          status,
          title: sheet?.title || prev[sheetId]?.title || '',
          courseCode: sheet?.course?.code || prev[sheetId]?.courseCode || null,
          updatedAt: new Date().toISOString(),
        }
      }
      writeStatuses(next)
      return next
    })
  }, [sheetId])

  // Cross-tab sync via visibilitychange
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setStatuses(readStatuses())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return { studyStatus: entry?.status || null, setStudyStatus: setStatus, STUDY_STATUSES }
}

/**
 * Read all study statuses — for dashboard display.
 * Returns: { statuses: { [id]: { status, title, courseCode, updatedAt } }, counts, studyList }
 */
export function useAllStudyStatuses() {
  const [statuses, setStatuses] = useState(readStatuses)

  const refresh = useCallback(() => setStatuses(readStatuses()), [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  const entries = Object.entries(statuses).map(([id, entry]) => ({ id: Number(id), ...entry }))
  const toReview = entries.filter((e) => e.status === 'to-review')
  const studying = entries.filter((e) => e.status === 'studying')
  const done = entries.filter((e) => e.status === 'done')

  return {
    statuses,
    counts: { toReview: toReview.length, studying: studying.length, done: done.length },
    toReview,
    studying,
    done,
    refreshStatuses: refresh,
    STUDY_STATUSES,
  }
}

export { STUDY_STATUSES }

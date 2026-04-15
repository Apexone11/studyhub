import { describe, it, expect } from 'vitest'
import { initialState, reducer } from './notePersistenceReducer.js'

describe('notePersistenceReducer', () => {
  it('starts in idle status with zeroed counters', () => {
    expect(initialState.status).toBe('idle')
    expect(initialState.lastSavedAt).toBeNull()
    expect(initialState.lastServerRevision).toBe(0)
    expect(initialState.lastSaveError).toBeNull()
    expect(initialState.pendingConflict).toBeNull()
    expect(initialState.bytesContent).toBe(0)
  })

  it('EDITOR_CHANGE moves idle -> dirty', () => {
    const next = reducer(initialState, { type: 'EDITOR_CHANGE' })
    expect(next.status).toBe('dirty')
  })

  it('EDITOR_CHANGE updates bytesContent if provided', () => {
    const next = reducer(initialState, { type: 'EDITOR_CHANGE', bytesContent: 4096 })
    expect(next.bytesContent).toBe(4096)
  })

  it('EDITOR_CHANGE preserves conflict status', () => {
    const conflictState = {
      ...initialState,
      status: 'conflict',
      pendingConflict: { current: {}, yours: {} },
    }
    const next = reducer(conflictState, { type: 'EDITOR_CHANGE' })
    expect(next.status).toBe('conflict')
  })

  it('SAVE_START -> saving and clears prior error', () => {
    const errored = { ...initialState, status: 'error', lastSaveError: { code: 500, message: 'x' } }
    const next = reducer(errored, { type: 'SAVE_START' })
    expect(next.status).toBe('saving')
    expect(next.lastSaveError).toBeNull()
  })

  it('SAVE_SUCCESS -> saved with revision + savedAt', () => {
    const ts = new Date('2026-04-15T00:00:00Z')
    const next = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_SUCCESS',
        revision: 7,
        savedAt: ts,
      },
    )
    expect(next.status).toBe('saved')
    expect(next.lastServerRevision).toBe(7)
    expect(next.lastSavedAt).toEqual(ts)
  })

  it('SAVE_FAILURE non-network -> error with reason', () => {
    const next = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_FAILURE',
        error: { code: 500, message: 'boom' },
      },
    )
    expect(next.status).toBe('error')
    expect(next.lastSaveError.code).toBe(500)
  })

  it('SAVE_FAILURE with networkError flag -> offline', () => {
    const next = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_FAILURE',
        error: { code: 'NET', message: 'no net' },
        networkError: true,
      },
    )
    expect(next.status).toBe('offline')
  })

  it('CONFLICT_DETECTED -> conflict carrying current/yours payload', () => {
    const next = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'CONFLICT_DETECTED',
        current: { revision: 9 },
        yours: { title: 'mine' },
      },
    )
    expect(next.status).toBe('conflict')
    expect(next.pendingConflict.current.revision).toBe(9)
    expect(next.pendingConflict.yours.title).toBe('mine')
  })

  it('CONFLICT_RESOLVED clears pendingConflict, returns to dirty', () => {
    const next = reducer(
      { ...initialState, status: 'conflict', pendingConflict: { current: {}, yours: {} } },
      { type: 'CONFLICT_RESOLVED' },
    )
    expect(next.status).toBe('dirty')
    expect(next.pendingConflict).toBeNull()
  })

  it('SERVER_REVISION_ADVANCED bumps lastServerRevision without changing status', () => {
    const dirty = { ...initialState, status: 'dirty', lastServerRevision: 3 }
    const next = reducer(dirty, { type: 'SERVER_REVISION_ADVANCED', revision: 5 })
    expect(next.status).toBe('dirty')
    expect(next.lastServerRevision).toBe(5)
  })

  it('RESET_TO_SAVED transitions to saved and clears conflict + error', () => {
    const conflicted = {
      ...initialState,
      status: 'conflict',
      pendingConflict: { current: {}, yours: {} },
      lastSaveError: { code: 1 },
    }
    const ts = new Date()
    const next = reducer(conflicted, { type: 'RESET_TO_SAVED', revision: 11, savedAt: ts })
    expect(next.status).toBe('saved')
    expect(next.lastServerRevision).toBe(11)
    expect(next.lastSavedAt).toEqual(ts)
    expect(next.pendingConflict).toBeNull()
  })

  it('unknown action returns the same state reference', () => {
    expect(reducer(initialState, { type: 'NOPE' })).toBe(initialState)
  })
})

export const initialState = {
  status: 'idle',
  lastSavedAt: null,
  lastServerRevision: 0,
  lastSaveError: null,
  pendingConflict: null,
  bytesContent: 0,
}

export function reducer(state, action) {
  switch (action.type) {
    case 'EDITOR_CHANGE':
      return {
        ...state,
        status: state.status === 'conflict' ? 'conflict' : 'dirty',
        bytesContent: action.bytesContent ?? state.bytesContent,
      }
    case 'SAVE_START':
      return { ...state, status: 'saving', lastSaveError: null }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        status: 'saved',
        lastSavedAt: action.savedAt,
        lastServerRevision: action.revision,
        lastSaveError: null,
      }
    case 'SAVE_FAILURE':
      return {
        ...state,
        status: action.networkError ? 'offline' : 'error',
        lastSaveError: action.error,
      }
    case 'CONFLICT_DETECTED':
      return {
        ...state,
        status: 'conflict',
        pendingConflict: { current: action.current, yours: action.yours },
      }
    case 'CONFLICT_RESOLVED':
      return { ...state, status: 'dirty', pendingConflict: null }
    case 'SERVER_REVISION_ADVANCED':
      return { ...state, lastServerRevision: action.revision }
    case 'RESET_TO_SAVED':
      return {
        ...state,
        status: 'saved',
        lastServerRevision: action.revision,
        lastSavedAt: action.savedAt,
        pendingConflict: null,
        lastSaveError: null,
      }
    default:
      return state
  }
}

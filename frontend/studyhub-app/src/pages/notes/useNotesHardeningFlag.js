/**
 * Notes hardening v2 feature gate.
 *
 * TODO(Task 21): replace this with the proper feature-flag hook
 * (e.g. useFeatureFlag('flag_notes_hardening_v2')). For now we use a
 * localStorage override + dev-mode default so we can iterate locally
 * before the flag plumbing is finished.
 */
export function isNotesHardeningEnabled() {
  if (typeof window === 'undefined') return false
  const ls = window.localStorage?.getItem('flag_notes_hardening_v2')
  if (ls === '1' || ls === 'true') return true
  if (ls === '0' || ls === 'false') return false
  return Boolean(import.meta?.env?.DEV)
}

export function useNotesHardeningEnabled() {
  return isNotesHardeningEnabled()
}

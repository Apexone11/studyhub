// src/mobile/hooks/useHaptics.js
// Thin hook over lib/haptics — returns memoized bound refs that fire haptics
// on the native bridge (no-op on web and when the @capacitor/haptics dep is
// not present).

import { useMemo } from 'react'
import haptics from '../lib/haptics'

export function useHaptics() {
  return useMemo(
    () => ({
      tap: haptics.tap,
      success: haptics.success,
      warn: haptics.warn,
      select: haptics.select,
    }),
    [],
  )
}

export default useHaptics

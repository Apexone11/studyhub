// src/mobile/lib/mobileDesignFlags.js
// Mobile Design Refresh v3 — phase rollout flags.
// Pure compile-time flags. No server dependency — the mobile app ships
// these flipped as each phase lands.
//
// See docs/internal/mobile-design-refresh-v3-spec.md §8.

const MOBILE_BUILD = import.meta.env.MODE === 'mobile'

export const MOBILE_DESIGN_V3 = {
  enabled: MOBILE_BUILD,
  phase1Foundation: true,
  phase2Primitives: true,
  phase3Shell: true,
  phase4AuthLanding: true,
  phase5Onboarding: true,
  phase6HomeMessages: true,
  phase7AiProfileContent: true,
  phase8SearchCleanup: true,
}

export function isV3Enabled(phase) {
  if (!MOBILE_DESIGN_V3.enabled) return false
  if (!phase) return true
  return Boolean(MOBILE_DESIGN_V3[phase])
}

export default MOBILE_DESIGN_V3

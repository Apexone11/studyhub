export const UPLOAD_TUTORIAL_KEY = 'studyhub.upload.tutorial.v1'

export function canEditHtmlWorkingCopy() {
  return true
}

export function canSubmitHtmlReview({
  scanStatus,
  scanAcknowledged,
  tier,
  title,
  courseId,
  description,
  html,
}) {
  const effectiveTier = typeof tier === 'number' ? tier : 0

  // Tier 0: always submittable (auto-publishes)
  // Tier 1: requires acknowledgement
  // Tier 2: always submittable (routes to pending_review)
  // Tier 3: never submittable (quarantined)
  let scanOk = false
  if (effectiveTier === 3) {
    scanOk = false
  } else if (effectiveTier === 0 || String(scanStatus || '').toLowerCase() === 'passed') {
    scanOk = true
  } else if (effectiveTier === 1) {
    scanOk = Boolean(scanAcknowledged)
  } else {
    // Tier 2 or unknown — always submittable
    scanOk = true
  }

  return (
    scanOk &&
    String(title || '').trim().length > 0 &&
    Number.isInteger(Number.parseInt(courseId, 10)) &&
    String(description || '').trim().length > 0 &&
    String(html || '').trim().length > 0
  )
}

export function reduceScanState(previousState, patch = {}) {
  const next = {
    status: patch.status || previousState.status || 'queued',
    tier: typeof patch.tier === 'number' ? patch.tier : (previousState.tier || 0),
    findings: Array.isArray(patch.findings) ? patch.findings : (previousState.findings || []),
    updatedAt: patch.updatedAt || previousState.updatedAt || null,
    acknowledgedAt: patch.acknowledgedAt || previousState.acknowledgedAt || null,
    hasOriginalVersion: typeof patch.hasOriginalVersion === 'boolean'
      ? patch.hasOriginalVersion
      : Boolean(previousState.hasOriginalVersion),
    hasWorkingVersion: typeof patch.hasWorkingVersion === 'boolean'
      ? patch.hasWorkingVersion
      : Boolean(previousState.hasWorkingVersion),
    originalSourceName: patch.originalSourceName || previousState.originalSourceName || null,
  }

  return next
}

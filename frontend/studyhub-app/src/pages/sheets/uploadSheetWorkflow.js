export const UPLOAD_TUTORIAL_KEY = 'studyhub.upload.tutorial.v1'

export function canEditHtmlWorkingCopy({ hasOriginalVersion }) {
  return Boolean(hasOriginalVersion)
}

export function canSubmitHtmlReview({
  hasOriginalVersion,
  scanStatus,
  title,
  courseId,
  description,
  html,
}) {
  return (
    Boolean(hasOriginalVersion) &&
    String(scanStatus || '').toLowerCase() === 'passed' &&
    String(title || '').trim().length > 0 &&
    Number.isInteger(Number.parseInt(courseId, 10)) &&
    String(description || '').trim().length > 0 &&
    String(html || '').trim().length > 0
  )
}

export function reduceScanState(previousState, patch = {}) {
  const next = {
    status: patch.status || previousState.status || 'queued',
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
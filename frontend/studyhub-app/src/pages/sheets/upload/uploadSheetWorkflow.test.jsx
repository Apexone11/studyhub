// uploadSheetWorkflow.test locks down the HTML review workflow rules next to the sheet workflow helper.
import { describe, expect, it } from 'vitest'
import {
  UPLOAD_TUTORIAL_KEY,
  canEditHtmlWorkingCopy,
  canSubmitHtmlReview,
  reduceScanState,
} from './uploadSheetWorkflow'

describe('uploadSheetWorkflow', () => {
  it('always allows editing (original version check removed)', () => {
    expect(canEditHtmlWorkingCopy()).toBe(true)
    expect(canEditHtmlWorkingCopy({ hasOriginalVersion: false })).toBe(true)
    expect(canEditHtmlWorkingCopy({ hasOriginalVersion: true })).toBe(true)
  })

  it('requires metadata and respects tier-based scan rules', () => {
    // Tier 0 (default): always submittable regardless of scan status
    expect(
      canSubmitHtmlReview({
        scanStatus: 'passed',
        title: 'My HTML sheet',
        courseId: '101',
        description: 'ready to publish',
        html: '<main><h1>Ready</h1></main>',
      }),
    ).toBe(true)

    expect(
      canSubmitHtmlReview({
        scanStatus: 'failed',
        tier: 0,
        title: 'My HTML sheet',
        courseId: '101',
        description: 'ready to publish',
        html: '<main><h1>Ready</h1></main>',
      }),
    ).toBe(true)

    // Tier 3: never submittable (quarantined)
    expect(
      canSubmitHtmlReview({
        scanStatus: 'passed',
        tier: 3,
        title: 'My HTML sheet',
        courseId: '101',
        description: 'ready to publish',
        html: '<main><h1>Ready</h1></main>',
      }),
    ).toBe(false)

    // Missing required metadata rejects
    expect(
      canSubmitHtmlReview({
        scanStatus: 'passed',
        title: '',
        courseId: '101',
        description: 'ready to publish',
        html: '<main><h1>Ready</h1></main>',
      }),
    ).toBe(false)
  })

  it('merges scan-state patches predictably for polling UI', () => {
    const initial = {
      status: 'queued',
      findings: [],
      updatedAt: null,
      acknowledgedAt: null,
      hasOriginalVersion: false,
      hasWorkingVersion: false,
      originalSourceName: null,
    }

    const running = reduceScanState(initial, {
      status: 'running',
      hasOriginalVersion: true,
      originalSourceName: 'first-import.html',
    })

    expect(running.status).toBe('running')
    expect(running.hasOriginalVersion).toBe(true)
    expect(running.originalSourceName).toBe('first-import.html')

    const failed = reduceScanState(running, {
      status: 'failed',
      findings: [{ message: 'Scanner unavailable.' }],
    })

    expect(failed.status).toBe('failed')
    expect(failed.findings).toHaveLength(1)
  })

  it('exposes a stable tutorial local-storage key', () => {
    expect(UPLOAD_TUTORIAL_KEY).toBe('studyhub.upload.tutorial.v1')
  })
})

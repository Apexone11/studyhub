// uploadSheetWorkflow.test locks down the HTML review workflow rules next to the sheet workflow helper.
import { describe, expect, it } from 'vitest'
import {
  UPLOAD_TUTORIAL_KEY,
  canEditHtmlWorkingCopy,
  canSubmitHtmlReview,
  reduceScanState,
} from './uploadSheetWorkflow'

describe('uploadSheetWorkflow', () => {
  it('enforces strict html import before edit', () => {
    expect(canEditHtmlWorkingCopy({ hasOriginalVersion: false })).toBe(false)
    expect(canEditHtmlWorkingCopy({ hasOriginalVersion: true })).toBe(true)
  })

  it('requires passed scan and required metadata before submit', () => {
    expect(canSubmitHtmlReview({
      hasOriginalVersion: true,
      scanStatus: 'passed',
      title: 'My HTML sheet',
      courseId: '101',
      description: 'ready to publish',
      html: '<main><h1>Ready</h1></main>',
    })).toBe(true)

    expect(canSubmitHtmlReview({
      hasOriginalVersion: true,
      scanStatus: 'failed',
      title: 'My HTML sheet',
      courseId: '101',
      description: 'ready to publish',
      html: '<main><h1>Ready</h1></main>',
    })).toBe(false)

    expect(canSubmitHtmlReview({
      hasOriginalVersion: false,
      scanStatus: 'passed',
      title: 'My HTML sheet',
      courseId: '101',
      description: 'ready to publish',
      html: '<main><h1>Ready</h1></main>',
    })).toBe(false)
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

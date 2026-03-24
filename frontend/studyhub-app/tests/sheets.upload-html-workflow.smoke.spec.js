import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test('html upload with flagged content requires scan acknowledgement before publish @smoke', async ({ page }) => {
  await disableTutorials(page)
  await mockAuthenticatedApp(page)

  await page.route('**/api/sheets/drafts/latest', async (route) => {
    await route.fulfill({ status: 200, json: { draft: null } })
  })

  let scanPollCount = 0

  await page.route('**/api/sheets/drafts/import-html', async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        message: 'HTML file imported into draft workflow.',
        draft: {
          id: 777,
          title: 'Imported draft',
          courseId: 101,
          description: 'Imported description',
          content: '<main><h1>Imported</h1><script>console.log("interactive")</script></main>',
          contentFormat: 'html',
          status: 'draft',
          allowDownloads: true,
          hasAttachment: false,
          htmlWorkflow: {
            scanStatus: 'queued',
            tier: 0,
            scanFindings: [],
            scanUpdatedAt: null,
            scanAcknowledgedAt: null,
            hasOriginalVersion: true,
            hasWorkingVersion: true,
            originalSourceName: 'imported.html',
          },
        },
        scan: {
          status: 'queued',
          tier: 0,
          findings: [],
          hasOriginalVersion: true,
          hasWorkingVersion: true,
          originalSourceName: 'imported.html',
        },
      },
    })
  })

  await page.route('**/api/sheets/drafts/777/scan-status', async (route) => {
    scanPollCount += 1
    if (scanPollCount < 2) {
      await route.fulfill({ status: 200, json: { status: 'running', tier: 0, findings: [], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'imported.html' } })
      return
    }
    // Scan completes as flagged (tier 1) — script detected
    await route.fulfill({
      status: 200,
      json: {
        status: 'flagged',
        tier: 1,
        findings: [{ source: 'suspicious-tag', severity: 'medium', message: 'HTML contains flagged tags: script.' }],
        hasOriginalVersion: true,
        hasWorkingVersion: true,
        originalSourceName: 'imported.html',
      },
    })
  })

  await page.route('**/api/sheets/drafts/777/scan-status/acknowledge', async (route) => {
    await route.fulfill({ status: 200, json: { message: 'acknowledged' } })
  })

  await page.route('**/api/sheets/drafts/autosave', async (route) => {
    await route.fulfill({ status: 200, json: { draft: { id: 777, status: 'draft' } } })
  })

  await page.route('**/api/sheets/777/working-html', async (route) => {
    await route.fulfill({ status: 200, json: { draft: { id: 777, status: 'draft' }, scan: { status: 'flagged', tier: 1, findings: [{ source: 'suspicious-tag', severity: 'medium', message: 'HTML contains flagged tags: script.' }], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'imported.html' } } })
  })

  await page.route('**/api/sheets/777/submit-review', async (route) => {
    await route.fulfill({ status: 200, json: { id: 777, status: 'published' } })
  })

  await page.route('**/api/sheets/777', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 777,
        title: 'Imported draft',
        description: 'Imported description',
        content: '<main><h1>Imported</h1><script>console.log("interactive")</script></main>',
        contentFormat: 'html',
        status: 'published',
        userId: 42,
        stars: 0,
        downloads: 0,
        forks: 0,
        commentCount: 0,
        reactions: { likes: 0, dislikes: 0, userReaction: null },
        course: { id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I', school: { id: 1, name: 'University of Maryland', short: 'UMD' } },
        author: { id: 42, username: 'regression_admin' },
        incomingContributions: [],
        outgoingContributions: [],
        hasAttachment: false,
        allowDownloads: true,
      },
    })
  })

  await page.route('**/api/sheets/777/comments?*', async (route) => {
    await route.fulfill({ status: 200, json: { comments: [], total: 0 } })
  })

  await page.goto('/sheets/upload')

  // HTML import section should be visible
  await expect(page.getByText('HTML IMPORT')).toBeVisible()

  // Fill required fields
  await page.getByPlaceholder('e.g. "CMSC131 Final Exam Cheatsheet"').fill('Imported draft')
  await page.locator('select').first().selectOption('101')
  await page.getByPlaceholder('Brief summary of what this sheet covers…').fill('Imported description')

  // Import HTML file with script content
  await page.setInputFiles('input[type=file][accept=".html,.htm,text/html"]', {
    name: 'imported.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<main><h1>Imported</h1><script>console.log("interactive")</script></main>'),
  })

  // Wait for scan modal to auto-open (tier 1 triggers modal)
  await expect(page.getByText('HTML Security Scan')).toBeVisible({ timeout: 10000 })

  // Tier 1: acknowledgement checkbox must be checked before dismiss
  const ackCheckbox = page.getByRole('checkbox', { name: /I understand this sheet contains flagged HTML features/i })
  await ackCheckbox.check()
  await page.getByRole('button', { name: 'Acknowledge and dismiss' }).click()

  // After acknowledgement, publish button should be enabled with tier 1 label
  const submitButton = page.getByRole('button', { name: /Publish with Warnings/i })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()
  await expect(page).toHaveURL(/\/sheets\/777$/)
})

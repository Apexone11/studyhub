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

test('strict html upload flow blocks submit before import and allows submit after passing scan @smoke', async ({ page }) => {
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
          content: '<main><h1>Imported</h1></main>',
          contentFormat: 'html',
          status: 'draft',
          allowDownloads: true,
          hasAttachment: false,
          htmlWorkflow: {
            scanStatus: 'queued',
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
      await route.fulfill({ status: 200, json: { status: 'running', findings: [], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'imported.html' } })
      return
    }
    await route.fulfill({ status: 200, json: { status: 'passed', findings: [], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'imported.html' } })
  })

  await page.route('**/api/sheets/drafts/777/scan-status/acknowledge', async (route) => {
    await route.fulfill({ status: 200, json: { message: 'acknowledged' } })
  })

  await page.route('**/api/sheets/777/working-html', async (route) => {
    await route.fulfill({ status: 200, json: { draft: { id: 777, status: 'draft' }, scan: { status: 'passed', findings: [], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'imported.html' } } })
  })

  await page.route('**/api/sheets/777/submit-review', async (route) => {
    await route.fulfill({ status: 200, json: { id: 777, status: 'pending_review' } })
  })

  await page.route('**/api/sheets/777', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 777,
        title: 'Imported draft',
        description: 'Imported description',
        content: '<main><h1>Imported</h1></main>',
        contentFormat: 'html',
        status: 'pending_review',
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
  await expect(page.getByText('Import HTML first. Direct posting is disabled in strict beta workflow.')).toBeVisible()

  const submitButton = page.getByRole('button', { name: 'Submit For Review' })
  await expect(submitButton).toBeDisabled()

  await page.getByPlaceholder('e.g. "CMSC131 Final Exam Cheatsheet"').fill('Imported draft')
  await page.locator('select').first().selectOption('101')
  await page.getByPlaceholder('Brief summary of what this sheet covers…').fill('Imported description')

  await page.setInputFiles('input[type=file][accept=".html,.htm,text/html"]', {
    name: 'imported.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<main><h1>Imported</h1></main>'),
  })

  await expect(page.getByText('Scan:')).toContainText('Scan:')
  await page.getByRole('checkbox', { name: /unsafe HTML is blocked/i }).check()
  await page.getByRole('button', { name: 'Acknowledge and dismiss' }).click()

  await expect(submitButton).toBeEnabled()
  await submitButton.click()
  await expect(page).toHaveURL(/\/sheets\/777$/)
})

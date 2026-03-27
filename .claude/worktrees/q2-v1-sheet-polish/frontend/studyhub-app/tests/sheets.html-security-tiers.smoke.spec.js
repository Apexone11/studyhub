import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

// Block service workers so Playwright route interception works for API mocks
test.use({ serviceWorkers: 'block' })

/* ── helpers ─────────────────────────────────────────────────────────── */

async function setupPage(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('tutorial_upload_seen', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

function mockUploadRoutes(page, { tier, scanStatus, findings, riskSummary, tierExplanation, findingsByCategory }) {
  let scanPollCount = 0

  return Promise.all([
    page.route('**/api/sheets/drafts/latest', async (route) => {
      await route.fulfill({ status: 200, json: { draft: null } })
    }),
    page.route('**/api/sheets/drafts/import-html', async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          message: 'HTML file imported into draft workflow.',
          draft: {
            id: 888, title: 'Test Sheet', courseId: 101,
            description: 'Test description',
            content: '<main><h1>Test</h1></main>',
            contentFormat: 'html', status: 'draft',
            allowDownloads: true, hasAttachment: false,
            htmlWorkflow: {
              scanStatus: 'queued', tier: 0, scanFindings: [],
              riskSummary: '', tierExplanation: '', findingsByCategory: {},
              scanUpdatedAt: null, scanAcknowledgedAt: null,
              hasOriginalVersion: true, hasWorkingVersion: true,
              originalSourceName: 'test.html',
            },
          },
          scan: {
            status: 'queued', tier: 0, findings: [],
            hasOriginalVersion: true, hasWorkingVersion: true,
            originalSourceName: 'test.html',
          },
        },
      })
    }),
    page.route('**/api/sheets/drafts/888/scan-status', async (route) => {
      scanPollCount += 1
      if (scanPollCount < 2) {
        await route.fulfill({ status: 200, json: { status: 'running', tier: 0, findings: [], hasOriginalVersion: true, hasWorkingVersion: true, originalSourceName: 'test.html' } })
        return
      }
      await route.fulfill({
        status: 200,
        json: {
          status: scanStatus, tier, findings,
          riskSummary, tierExplanation, findingsByCategory,
          hasOriginalVersion: true, hasWorkingVersion: true,
          originalSourceName: 'test.html',
        },
      })
    }),
    page.route('**/api/sheets/drafts/888/scan-status/acknowledge', async (route) => {
      await route.fulfill({ status: 200, json: { message: 'acknowledged' } })
    }),
    page.route('**/api/sheets/drafts/autosave', async (route) => {
      await route.fulfill({ status: 200, json: { draft: { id: 888, status: 'draft' } } })
    }),
    page.route('**/api/sheets/drafts/888/working-html', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          draft: { id: 888, status: 'draft' },
          scan: {
            status: scanStatus, tier, findings,
            riskSummary, tierExplanation, findingsByCategory,
            hasOriginalVersion: true, hasWorkingVersion: true,
            originalSourceName: 'test.html',
          },
        },
      })
    }),
  ])
}

async function triggerHtmlImport(page) {
  await page.goto('/sheets/upload')
  await expect(page.getByText('HTML IMPORT')).toBeVisible()

  await page.getByPlaceholder('e.g. "CMSC131 Final Exam Cheatsheet"').fill('Test Sheet')
  await page.locator('select').first().selectOption('101')
  await page.getByPlaceholder('Brief summary of what this sheet covers…').fill('Test description')

  await page.setInputFiles('input[type=file][accept=".html,.htm,text/html"]', {
    name: 'test.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<main><h1>Test</h1></main>'),
  })
}

/* ════════════════════════════════════════════════════════════════════════
 * Tier 2 — High Risk: pending_review, "Understood" button, no publish
 * ════════════════════════════════════════════════════════════════════════ */

test('tier 2 high-risk upload shows grouped findings and blocks publishing @smoke', async ({ page }) => {
  await setupPage(page)
  await mockAuthenticatedApp(page)

  const findings = [
    { source: 'js-risk', category: 'js-risk', severity: 'high', message: 'Dynamic code execution detected: eval() usage.' },
    { source: 'inline-handler', category: 'inline-handler', severity: 'medium', message: 'Inline event handler found: onclick.' },
  ]
  const findingsByCategory = {
    'js-risk': {
      label: 'Risky JavaScript',
      maxSeverity: 'high',
      findings: [{ message: 'Dynamic code execution detected: eval() usage.' }],
    },
    'inline-handler': {
      label: 'Inline Event Handlers',
      maxSeverity: 'medium',
      findings: [{ message: 'Inline event handler found: onclick.' }],
    },
  }

  await mockUploadRoutes(page, {
    tier: 2,
    scanStatus: 'failed',
    findings,
    riskSummary: 'Contains risky JavaScript and inline event handlers.',
    tierExplanation: 'High risk — your content includes patterns associated with active security threats. It will be held for manual admin review before publication.',
    findingsByCategory,
  })

  await triggerHtmlImport(page)

  // Scan modal opens with tier 2 findings
  await expect(page.getByText('HTML Security Scan')).toBeVisible({ timeout: 10000 })

  // Risk summary visible
  await expect(page.getByText('Contains risky JavaScript and inline event handlers.')).toBeVisible()

  // Grouped findings visible (exact: true avoids matching substring in risk summary)
  await expect(page.getByText('Risky JavaScript', { exact: true })).toBeVisible()
  await expect(page.getByText('Inline Event Handlers', { exact: true })).toBeVisible()
  await expect(page.getByText('Dynamic code execution detected: eval() usage.')).toBeVisible()

  // Tier explanation visible
  await expect(page.getByText(/held for manual admin review/)).toBeVisible()

  // Tier 2: "Understood" button (not acknowledge checkbox)
  const understoodBtn = page.getByRole('button', { name: 'Understood' })
  await expect(understoodBtn).toBeVisible()
  await understoodBtn.click()

  // After dismissal, publish button should show "Submit for Review" (not "Publish")
  await expect(page.getByRole('button', { name: /Submit for Review/i })).toBeVisible()
})

/* ════════════════════════════════════════════════════════════════════════
 * Tier 3 — Quarantined: no publish, clear quarantine messaging
 * ════════════════════════════════════════════════════════════════════════ */

test('tier 3 quarantined upload shows critical findings and prevents publishing @smoke', async ({ page }) => {
  await setupPage(page)
  await mockAuthenticatedApp(page)

  const findings = [
    { source: 'credential-capture', category: 'credential-capture', severity: 'critical', message: 'Form with password field submitting to external domain.' },
    { source: 'exfiltration', category: 'exfiltration', severity: 'high', message: 'Possible data exfiltration via fetch to external domain.' },
  ]
  const findingsByCategory = {
    'credential-capture': {
      label: 'Credential Capture',
      maxSeverity: 'critical',
      findings: [{ message: 'Form with password field submitting to external domain.' }],
    },
    'exfiltration': {
      label: 'Data Exfiltration',
      maxSeverity: 'high',
      findings: [{ message: 'Possible data exfiltration via fetch to external domain.' }],
    },
  }

  await mockUploadRoutes(page, {
    tier: 3,
    scanStatus: 'quarantined',
    findings,
    riskSummary: 'Contains credential capture and data exfiltration.',
    tierExplanation: 'Quarantined — this content has been automatically isolated due to critical security indicators. An administrator must review it. You cannot publish or preview this content.',
    findingsByCategory,
  })

  await triggerHtmlImport(page)

  // Scan modal opens with quarantine
  await expect(page.getByText('HTML Security Scan')).toBeVisible({ timeout: 10000 })

  // Critical findings visible (exact: true avoids matching substring in risk summary)
  await expect(page.getByText('Credential Capture', { exact: true })).toBeVisible()
  await expect(page.getByText('Data Exfiltration', { exact: true })).toBeVisible()

  // Tier 3: only Close button, no acknowledge or understood
  const closeBtn = page.getByRole('button', { name: 'Close' })
  await expect(closeBtn).toBeVisible()
  await closeBtn.click()

  // Quarantined button is visible but disabled — no publish or submit action available
  const quarantineBtn = page.getByRole('button', { name: /Quarantined/i })
  await expect(quarantineBtn).toBeVisible()
  await expect(quarantineBtn).toBeDisabled()
})

/* ════════════════════════════════════════════════════════════════════════
 * HtmlScanModal — Grouped findings with categories display correctly
 * ════════════════════════════════════════════════════════════════════════ */

test('scan modal shows category-grouped findings sorted by severity @smoke', async ({ page }) => {
  await setupPage(page)
  await mockAuthenticatedApp(page)

  const findings = [
    { source: 'obfuscation', category: 'obfuscation', severity: 'high', message: 'Base64-encoded script block detected.' },
    { source: 'suspicious-tag', category: 'suspicious-tag', severity: 'medium', message: 'HTML contains flagged tags: script.' },
    { source: 'redirect', category: 'redirect', severity: 'medium', message: 'Meta refresh redirect to external URL.' },
  ]
  const findingsByCategory = {
    'obfuscation': {
      label: 'Code Obfuscation',
      maxSeverity: 'high',
      findings: [{ message: 'Base64-encoded script block detected.' }],
    },
    'suspicious-tag': {
      label: 'Suspicious Tags',
      maxSeverity: 'medium',
      findings: [{ message: 'HTML contains flagged tags: script.' }],
    },
    'redirect': {
      label: 'Page Redirects',
      maxSeverity: 'medium',
      findings: [{ message: 'Meta refresh redirect to external URL.' }],
    },
  }

  await mockUploadRoutes(page, {
    tier: 2,
    scanStatus: 'failed',
    findings,
    riskSummary: 'Contains code obfuscation, suspicious tags, and page redirects.',
    tierExplanation: 'High risk — your content includes patterns associated with active security threats. It will be held for manual admin review before publication.',
    findingsByCategory,
  })

  await triggerHtmlImport(page)

  await expect(page.getByText('HTML Security Scan')).toBeVisible({ timeout: 10000 })

  // All category labels visible (exact: true avoids matching substring in risk summary)
  await expect(page.getByText('Code Obfuscation', { exact: true })).toBeVisible()
  await expect(page.getByText('Suspicious Tags', { exact: true })).toBeVisible()
  await expect(page.getByText('Page Redirects', { exact: true })).toBeVisible()

  // Individual finding messages visible
  await expect(page.getByText('Base64-encoded script block detected.')).toBeVisible()
  await expect(page.getByText('HTML contains flagged tags: script.')).toBeVisible()
  await expect(page.getByText('Meta refresh redirect to external URL.')).toBeVisible()

  // Risk summary visible
  await expect(page.getByText(/Contains code obfuscation/)).toBeVisible()
})

/* ════════════════════════════════════════════════════════════════════════
 * Admin review queue — badges, review panel, grouped findings, templates
 * ════════════════════════════════════════════════════════════════════════ */

test('admin review queue shows tier badges and review panel with grouped findings @smoke', async ({ page }) => {
  await setupPage(page)

  const reviewSheet = {
    id: 999,
    title: 'Suspicious Study Sheet',
    description: 'Contains flagged content for review.',
    contentFormat: 'html',
    status: 'pending_review',
    htmlScanStatus: 'failed',
    htmlRiskTier: 2,
    htmlScanFindings: [
      { source: 'js-risk', category: 'js-risk', severity: 'high', message: 'eval() detected in inline script.' },
      { source: 'obfuscation', category: 'obfuscation', severity: 'high', message: 'Base64-encoded content detected.' },
    ],
    htmlScanAcknowledgedAt: null,
    course: { id: 101, code: 'CMSC131' },
    author: { id: 77, username: 'flagged_user' },
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
  }

  // Register review routes BEFORE mockAuthenticatedApp so they get lower priority,
  // but use unroute+reroute pattern — actually register AFTER so they have higher priority (LIFO).
  await mockAuthenticatedApp(page)

  // Override admin sheet reviews endpoint (registered AFTER mockAuthenticatedApp = higher priority)
  await page.route('**/api/admin/sheets/review?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        sheets: [reviewSheet],
        total: 1,
        page: 1,
      },
    })
  })

  // Review detail endpoint with grouped findings
  await page.route('**/api/admin/sheets/999/review-detail', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 999,
        title: 'Suspicious Study Sheet',
        description: 'Contains flagged content for review.',
        contentFormat: 'html',
        status: 'pending_review',
        htmlScanStatus: 'failed',
        htmlRiskTier: 2,
        htmlScanFindings: reviewSheet.htmlScanFindings,
        htmlScanAcknowledgedAt: null,
        sanitizedHtml: '<h1>Suspicious Study Sheet</h1><p>Content here</p>',
        rawHtml: '<h1>Suspicious Study Sheet</h1><script>eval("test")</script>',
        validationIssues: [],
        course: { id: 101, code: 'CMSC131' },
        author: { id: 77, username: 'flagged_user' },
        riskSummary: 'Contains risky JavaScript and code obfuscation.',
        tierExplanation: 'High risk — content includes patterns associated with active security threats.',
        findingsByCategory: {
          'js-risk': {
            label: 'Risky JavaScript',
            maxSeverity: 'high',
            findings: [{ message: 'eval() detected in inline script.' }],
          },
          'obfuscation': {
            label: 'Code Obfuscation',
            maxSeverity: 'high',
            findings: [{ message: 'Base64-encoded content detected.' }],
          },
        },
        liveRiskSummaryText: 'Contains risky JavaScript and code obfuscation.',
        liveTierExplanation: 'High risk — content includes patterns associated with active security threats.',
        liveFindingsByCategory: {},
        liveRiskTier: 2,
        createdAt: '2026-03-23T10:00:00.000Z',
        updatedAt: '2026-03-23T10:05:00.000Z',
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
      },
    })
  })

  // Review action endpoint
  await page.route('**/api/admin/sheets/999/review', async (route) => {
    await route.fulfill({
      status: 200,
      json: { id: 999, status: 'rejected', reviewedBy: { id: 42, username: 'regression_admin' } },
    })
  })

  await page.goto('/admin')

  // Navigate to Sheet Reviews tab
  const reviewsTab = page.getByRole('button', { name: /Sheet Reviews/i })
  await expect(reviewsTab).toBeVisible()
  await reviewsTab.click()

  // Wait for review data to load, then check queue card badges
  await expect(page.getByText('1 sheet in queue')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('High Risk', { exact: true })).toBeVisible()
  await expect(page.getByText('2 findings')).toBeVisible()
  await expect(page.getByText('scan: failed')).toBeVisible()

  // Open review panel
  const reviewHtmlBtn = page.getByRole('button', { name: 'Review HTML' })
  await expect(reviewHtmlBtn).toBeVisible()
  await reviewHtmlBtn.click()

  // Review panel should show risk summary and tier info
  await expect(page.getByText('Review: Suspicious Study Sheet')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/Contains risky JavaScript and code obfuscation/)).toBeVisible()

  // Navigate to findings tab
  const findingsTab = page.getByRole('button', { name: /Findings/ })
  await findingsTab.click()

  // Grouped findings visible in panel (exact: true avoids matching substring in risk summary)
  await expect(page.getByText('Risky JavaScript', { exact: true })).toBeVisible()
  await expect(page.getByText('Code Obfuscation', { exact: true })).toBeVisible()

  // Reason templates should be visible in action bar
  await expect(page.getByText('Allowed advanced HTML; safe preview only.')).toBeVisible()
  await expect(page.getByText('Content is clean, no security issues found.')).toBeVisible()

  // Click a reason template then reject
  await page.getByText('Pending due to obfuscated script behavior.').click()
  const rejectBtn = page.getByRole('button', { name: 'Reject', exact: true })
  await rejectBtn.click({ force: true })
})

/* ════════════════════════════════════════════════════════════════════════
 * SheetViewerPage — risk summary shown for flagged HTML sheets
 * ════════════════════════════════════════════════════════════════════════ */

test('sheet viewer shows risk summary for flagged HTML sheet @smoke', async ({ page }) => {
  await setupPage(page)
  await mockAuthenticatedApp(page, {
    sheet: {
      id: 501,
      title: 'Flagged HTML Sheet',
      description: 'Contains flagged content.',
      content: '<h1>Flagged Sheet</h1>',
      contentFormat: 'html',
      status: 'published',
      userId: 42,
      stars: 5,
      downloads: 10,
      forks: 0,
      commentCount: 0,
      reactions: { likes: 2, dislikes: 0, userReaction: null },
      course: { id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I', school: { id: 1, name: 'University of Maryland', short: 'UMD' } },
      author: { id: 42, username: 'regression_admin' },
      incomingContributions: [],
      outgoingContributions: [],
      hasAttachment: false,
      allowDownloads: true,
      htmlWorkflow: {
        scanStatus: 'flagged',
        riskTier: 1,
        previewMode: 'safe',
        ackRequired: false,
        scanFindings: [{ source: 'suspicious-tag', severity: 'medium', message: 'HTML contains flagged tags: script.' }],
        riskSummary: 'Contains suspicious tags.',
        tierExplanation: 'Flagged — your content includes elements that could be risky.',
        findingsByCategory: {
          'suspicious-tag': {
            label: 'Suspicious Tags',
            maxSeverity: 'medium',
            findings: [{ message: 'HTML contains flagged tags: script.' }],
          },
        },
      },
    },
  })

  await page.route('**/api/sheets/501/runtime-html', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        html: '<h1>Flagged Sheet</h1>',
        previewMode: 'safe',
        riskSummary: 'Contains suspicious tags.',
        tierExplanation: 'Flagged — your content includes elements that could be risky.',
      },
    })
  })

  await page.goto('/sheets/501')

  // Sheet title visible (use heading role to avoid strict mode violation)
  await expect(page.getByRole('heading', { name: 'Flagged HTML Sheet' })).toBeVisible({ timeout: 5000 })

  // Safe preview tier badge
  await expect(page.getByText('Safe Preview')).toBeVisible()

  // Risk summary text displayed near tier badge
  await expect(page.getByText('Contains suspicious tags.')).toBeVisible()
})

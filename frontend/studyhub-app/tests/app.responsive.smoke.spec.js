// app.responsive.smoke.spec.js verifies the routed app shell across desktop, tablet, and mobile layouts.
import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, compact: false },
  { name: 'tablet', width: 1024, height: 768, compact: true },
  { name: 'mobile', width: 390, height: 844, compact: true },
]

const SMALL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Xq5kAAAAASUVORK5CYII='

const SAMPLE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 18 Tf 40 60 Td (StudyHub Preview) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000056 00000 n 
0000000113 00000 n 
0000000239 00000 n 
0000000333 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
403
%%EOF`

async function expectNoClientCrash(page, pageErrors) {
  await expect(page.getByText('This page crashed.')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/login$/)
  expect(pageErrors, pageErrors.map((error) => error.message).join('\n')).toEqual([])
}

async function expectVisibleWithinViewport(page, locator) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()

  const box = await locator.boundingBox()
  const viewport = page.viewportSize()

  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
}

async function assertSidebarMode(page, compact, { navigateToSheets = false } = {}) {
  if (compact) {
    const openNavigation = page.getByRole('button', { name: 'Open navigation' })
    await expectVisibleWithinViewport(page, openNavigation)
    await openNavigation.click()
    await expect(page.getByRole('dialog', { name: 'Sidebar navigation' })).toBeVisible()

    if (navigateToSheets) {
      await page.getByRole('dialog', { name: 'Sidebar navigation' }).getByRole('link', { name: 'Study Sheets' }).click()
      await expect(page).toHaveURL(/\/sheets$/)
    } else {
      await page.getByRole('button', { name: 'Close' }).click({ force: true })
    }
    return
  }

  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
  const sheetsLink = page.getByRole('link', { name: 'Study Sheets' })
  await expect(sheetsLink).toHaveCount(1)
  if (navigateToSheets) {
    await sheetsLink.click()
    await expect(page).toHaveURL(/\/sheets$/)
  }
}

async function mockAttachmentRoutes(page, sheetId) {
  await page.route('**/api/feed/posts/930/attachment/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(SMALL_PNG_BASE64, 'base64'),
    })
  })

  await page.route('**/api/feed/posts/930/attachment', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="flow-preview.png"',
      },
      body: 'original-file-binary',
    })
  })

  await page.route(`**/api/sheets/${sheetId}/attachment/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: SAMPLE_PDF,
    })
  })

  await page.route(`**/api/sheets/${sheetId}/attachment`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="sheet-preview-${sheetId}.pdf"`,
      },
      body: SAMPLE_PDF,
    })
  })
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} app responsive smoke`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test(`covers the main authenticated routes without layout regressions @smoke`, async ({ page }) => {
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error))

      const sheetId = 501
      await mockAuthenticatedApp(page, {
        sheet: {
          id: sheetId,
          hasAttachment: true,
          attachmentName: 'sheet-preview.pdf',
          attachmentType: 'pdf',
          allowDownloads: true,
        },
        notes: [
          {
            id: 801,
            title: 'Responsive pass note',
            content: '# Responsive pass\n\n- Check tablet drawer\n- Check mobile actions',
            private: true,
            courseId: 101,
            course: { id: 101, code: 'CMSC131' },
            updatedAt: '2026-03-16T12:18:00.000Z',
          },
        ],
        feedItems: [
          {
            id: 930,
            feedKey: 'post-930',
            type: 'post',
            createdAt: '2026-03-16T12:00:00.000Z',
            content: 'Post with full preview flow',
            preview: 'Post with full preview flow',
            author: { id: 42, username: 'regression_admin' },
            course: { id: 101, code: 'CMSC131' },
            commentCount: 0,
            reactions: { likes: 0, dislikes: 0, userReaction: null },
            hasAttachment: true,
            attachmentName: 'flow-preview.png',
            attachmentType: 'image',
            allowDownloads: true,
            linkPath: '/feed?post=930',
          },
          {
            id: sheetId,
            feedKey: `sheet-${sheetId}`,
            type: 'sheet',
            title: 'Algorithms Midterm Review',
            description: 'A concise set of notes for the first algorithms midterm.',
            preview: 'A concise set of notes for the first algorithms midterm.',
            createdAt: '2026-03-16T11:55:00.000Z',
            author: { id: 42, username: 'regression_admin' },
            course: { id: 101, code: 'CMSC131' },
            stars: 12,
            downloads: 34,
            forks: 3,
            starred: false,
            commentCount: 1,
            reactions: { likes: 4, dislikes: 0, userReaction: null },
            hasAttachment: true,
            attachmentName: 'sheet-preview.pdf',
            attachmentType: 'pdf',
            allowDownloads: true,
            linkPath: `/sheets/${sheetId}`,
          },
        ],
      })
      await mockAttachmentRoutes(page, sheetId)

      await page.goto('/feed')
      await expectVisibleWithinViewport(page, page.getByRole('button', { name: 'Post to Feed' }))
      await assertSidebarMode(page, viewport.compact, { navigateToSheets: true })
      await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
      await expectVisibleWithinViewport(page, page.getByRole('link', { name: 'Upload sheet' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/feed')
      const postCard = page.locator('article').filter({ hasText: 'Post with full preview flow' })
      await expect(postCard.getByRole('link', { name: 'Full preview' })).toHaveAttribute('href', '/preview/feed-post/930')
      await expect(postCard.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', /\/api\/feed\/posts\/930\/attachment$/)
      await expectVisibleWithinViewport(page, postCard.getByRole('link', { name: 'Download original' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto(`/sheets/${sheetId}`)
      await expect(page.getByRole('heading', { name: 'Algorithms Midterm Review' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Full preview' })).toHaveAttribute('href', `/preview/sheet/${sheetId}`)
      await expect(page.getByRole('link', { name: 'Download attachment' })).toHaveAttribute('href', new RegExp(`/api/sheets/${sheetId}/attachment$`))
      await expectVisibleWithinViewport(page, page.getByRole('link', { name: 'Download attachment' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/dashboard')
      await expect(page.getByText('Welcome back, regression_admin.')).toBeVisible()
      await expectVisibleWithinViewport(page, page.getByRole('button', { name: 'Sign Out' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/notes')
      await expect(page.getByRole('heading', { name: 'My Notes' })).toBeVisible()
      await expectVisibleWithinViewport(page, page.getByRole('button', { name: 'New Note' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/announcements')
      await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible()
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/settings')
      await expect(page.getByText('Settings').first()).toBeVisible()
      await expectVisibleWithinViewport(page, page.getByRole('button', { name: 'Sign Out' }))
      await expectNoClientCrash(page, pageErrors)

      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'Admin Overview' })).toBeVisible()
      if (viewport.compact) {
        await assertSidebarMode(page, true)
      }
      await expectNoClientCrash(page, pageErrors)
    })

    test(`keeps the session active when dashboard returns 403 @smoke`, async ({ page }) => {
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error))

      await mockAuthenticatedApp(page)
      await page.route('**/api/dashboard/summary', async (route) => {
        await route.fulfill({
          status: 403,
          json: {
            error: 'You do not have permission to view your dashboard.',
            code: 'FORBIDDEN',
          },
        })
      })

      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByText('You do not have permission to view your dashboard.')).toBeVisible()

      if (viewport.compact) {
        await page.getByRole('button', { name: 'Open navigation' }).click()
        await page.getByRole('dialog', { name: 'Sidebar navigation' }).getByRole('link', { name: 'Feed', exact: true }).click()
      } else {
        await page.getByRole('link', { name: 'Feed', exact: true }).click()
      }

      await expect(page).toHaveURL(/\/feed$/)
      await expect(page.getByText('Share an update')).toBeVisible()
      await expectNoClientCrash(page, pageErrors)
    })
  })
}

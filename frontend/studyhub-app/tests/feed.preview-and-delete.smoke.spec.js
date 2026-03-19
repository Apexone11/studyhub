import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

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

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test('owner sees delete menu, non-owner does not @smoke', async ({ page }) => {
  await disableTutorials(page)
  const ownerUserId = 510
  const ownerPost = {
    id: 910,
    feedKey: 'post-910',
    type: 'post',
    createdAt: '2026-03-16T12:00:00.000Z',
    content: 'Owner post with attachment preview',
    preview: 'Owner post with attachment preview',
    author: { id: ownerUserId, username: 'owner_student' },
    course: { id: 101, code: 'CMSC131' },
    commentCount: 0,
    reactions: { likes: 0, dislikes: 0, userReaction: null },
    hasAttachment: true,
    attachmentName: 'preview-image.png',
    attachmentType: 'image',
    allowDownloads: true,
    linkPath: '/feed?post=910',
  }

  await mockAuthenticatedApp(page, {
    user: {
      id: ownerUserId,
      username: 'owner_student',
      role: 'student',
      email: 'owner_student@studyhub.test',
    },
    feedItems: [ownerPost],
  })

  await page.route('**/api/feed/posts/910/attachment/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(SMALL_PNG_BASE64, 'base64'),
    })
  })

  await page.goto('/feed')

  const ownerActions = page.getByRole('button', { name: 'Post actions' })
  await expect(ownerActions).toHaveCount(1)
  await ownerActions.click()
  await expect(page.getByRole('button', { name: 'Delete post' })).toBeVisible()

  const nonOwnerPost = {
    ...ownerPost,
    id: 911,
    feedKey: 'post-911',
    author: { id: 999, username: 'another_student' },
    linkPath: '/feed?post=911',
  }

  await mockAuthenticatedApp(page, {
    user: {
      id: ownerUserId,
      username: 'owner_student',
      role: 'student',
      email: 'owner_student@studyhub.test',
    },
    feedItems: [nonOwnerPost],
  })

  await page.route('**/api/feed/posts/911/attachment/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(SMALL_PNG_BASE64, 'base64'),
    })
  })

  await page.goto('/feed')
  await expect(page.getByRole('button', { name: 'Post actions' })).toHaveCount(0)
})

test('preview endpoints render for image and pdf @smoke', async ({ page }) => {
  await disableTutorials(page)
  const userId = 610
  const feedItems = [
    {
      id: 920,
      feedKey: 'post-920',
      type: 'post',
      createdAt: '2026-03-16T12:00:00.000Z',
      content: 'Image preview post',
      preview: 'Image preview post',
      author: { id: userId, username: 'preview_owner' },
      course: { id: 101, code: 'CMSC131' },
      commentCount: 0,
      reactions: { likes: 0, dislikes: 0, userReaction: null },
      hasAttachment: true,
      attachmentName: 'inline-image.png',
      attachmentType: 'image',
      allowDownloads: true,
      linkPath: '/feed?post=920',
    },
    {
      id: 501,
      feedKey: 'sheet-501',
      type: 'sheet',
      createdAt: '2026-03-16T11:55:00.000Z',
      title: 'Algorithms Midterm Review',
      description: 'A concise set of notes for the first algorithms midterm.',
      preview: 'A concise set of notes for the first algorithms midterm.',
      author: { id: userId, username: 'preview_owner' },
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
      linkPath: '/sheets/501',
    },
  ]

  await mockAuthenticatedApp(page, {
    user: {
      id: userId,
      username: 'preview_owner',
      role: 'student',
      email: 'preview_owner@studyhub.test',
    },
    feedItems,
  })

  let imagePreviewHits = 0
  let pdfPreviewHits = 0

  await page.route('**/api/feed/posts/920/attachment/preview', async (route) => {
    imagePreviewHits += 1
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(SMALL_PNG_BASE64, 'base64'),
    })
  })

  await page.route('**/api/sheets/501/attachment/preview', async (route) => {
    pdfPreviewHits += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: SAMPLE_PDF,
    })
  })

  await page.goto('/feed')

  await expect(page.locator(`img[src*="/api/feed/posts/920/attachment/preview"]`)).toBeVisible()
  await expect(page.locator(`iframe[src*="/api/sheets/501/attachment/preview"]`)).toBeVisible()
  await expect.poll(() => imagePreviewHits).toBeGreaterThan(0)
  await expect.poll(() => pdfPreviewHits).toBeGreaterThan(0)
})

test('full preview route keeps original download endpoint unchanged @smoke', async ({ page }) => {
  await disableTutorials(page)
  const userId = 711
  const feedItems = [
    {
      id: 930,
      feedKey: 'post-930',
      type: 'post',
      createdAt: '2026-03-16T12:00:00.000Z',
      content: 'Post with full preview flow',
      preview: 'Post with full preview flow',
      author: { id: userId, username: 'preview_owner' },
      course: { id: 101, code: 'CMSC131' },
      commentCount: 0,
      reactions: { likes: 0, dislikes: 0, userReaction: null },
      hasAttachment: true,
      attachmentName: 'flow-preview.png',
      attachmentType: 'image',
      allowDownloads: true,
      linkPath: '/feed?post=930',
    },
  ]

  await mockAuthenticatedApp(page, {
    user: {
      id: userId,
      username: 'preview_owner',
      role: 'student',
      email: 'preview_owner@studyhub.test',
    },
    feedItems,
  })

  await page.route('**/api/feed/posts/930', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 930,
        type: 'post',
        content: 'Post with full preview flow',
        hasAttachment: true,
        attachmentName: 'flow-preview.png',
        attachmentType: 'image',
        allowDownloads: true,
      },
    })
  })

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

  await page.goto('/feed')
  await page.getByRole('link', { name: 'Full preview' }).first().click()
  await expect(page).toHaveURL(/\/preview\/feed-post\/930$/)
  await expect(page.locator('img[src*="/api/feed/posts/930/attachment/preview"]')).toBeVisible()

  const downloadLink = page.getByRole('link', { name: 'Download original' })
  await expect(downloadLink).toHaveAttribute('href', /\/api\/feed\/posts\/930\/attachment$/)
  await expect(downloadLink).not.toHaveAttribute('href', /\/attachment\/preview$/)
})

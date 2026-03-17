import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

test('html preview keeps iframe sandbox isolation @smoke', async ({ page }) => {
  await mockAuthenticatedApp(page)

  await page.route('**/api/sheets/501/html-preview', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: 501,
        title: 'Sandbox test',
        status: 'draft',
        updatedAt: '2026-03-16T12:00:00.000Z',
        html: '<main><h1>Sandbox test</h1><script>window.top.location="https://evil.example"</script></main>',
      },
    })
  })

  await page.goto('/sheets/preview/html/501')
  await expect(page.getByRole('heading', { name: 'Sandbox HTML Preview' })).toBeVisible()

  const iframe = page.locator('iframe[title="html-sheet-preview-501"]')
  await expect(iframe).toBeVisible()

  const sandboxValue = await iframe.getAttribute('sandbox')
  expect(sandboxValue).toContain('allow-scripts')
  expect(sandboxValue).toContain('allow-forms')
  expect(sandboxValue).toContain('allow-modals')
  expect(sandboxValue).toContain('allow-pointer-lock')
  expect(sandboxValue).toContain('allow-popups')
  expect(sandboxValue).not.toContain('allow-same-origin')
  expect(sandboxValue).not.toContain('allow-top-navigation')
  expect(sandboxValue).not.toContain('allow-top-navigation-by-user-activation')
})

test('html preview shows blocked security verdicts @smoke', async ({ page }) => {
  await mockAuthenticatedApp(page)

  await page.route('**/api/sheets/501/html-preview', async (route) => {
    await route.fulfill({
      status: 400,
      json: {
        error: 'HTML preview blocked by security checks.',
        issues: ['HTML includes a blocked tag. Remove script/iframe/object/embed/meta/base tags.'],
      },
    })
  })

  await page.goto('/sheets/preview/html/501')
  await expect(page.getByText('HTML preview blocked by security checks.')).toBeVisible()
})

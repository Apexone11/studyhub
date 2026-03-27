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

async function assertHealthyNavigation(page, pageErrors) {
  await expect(page.getByText('This page crashed.')).toHaveCount(0)
  expect(pageErrors, pageErrors.map((error) => error.message).join('\n')).toEqual([])
}

test('feed, sheets, dashboard, and admin routes recover cleanly across navigation @smoke', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockAuthenticatedApp(page)
  await page.goto('/feed')

  await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible()
  await page.getByRole('link', { name: 'Study Sheets' }).click()
  await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
  await page.getByRole('link', { name: 'Algorithms Midterm Review' }).click()
  await expect(page.getByRole('heading', { name: 'Algorithms Midterm Review' })).toBeVisible()
  await page.getByRole('button', { name: /^Back$/ }).click()
  await expect(page).toHaveURL(/\/sheets$/)
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByText('Welcome back, regression_admin.')).toBeVisible()
  await page.getByRole('link', { name: 'Admin Panel' }).click()
  await expect(page.getByRole('heading', { name: 'Admin Overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Users' }).click()
  await expect(page.getByRole('cell', { name: 'regression_admin', exact: true })).toBeVisible()

  await assertHealthyNavigation(page, pageErrors)
})

test('repeated navigation does not white-screen or poison the SPA @regression', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await disableTutorials(page)
  await mockAuthenticatedApp(page)
  await page.goto('/feed')

  for (let iteration = 0; iteration < 2; iteration += 1) {
    await page.getByRole('link', { name: 'Study Sheets' }).click()
    await expect(page.getByRole('heading', { name: 'Study Sheets' })).toBeVisible()
    await page.getByRole('link', { name: 'Algorithms Midterm Review' }).click()
    await expect(page.getByRole('heading', { name: 'Algorithms Midterm Review' })).toBeVisible()
    await page.getByRole('button', { name: /^Back$/ }).click()
    await expect(page).toHaveURL(/\/sheets$/)
    await page.getByRole('link', { name: 'Feed', exact: true }).click()
    await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible()
    await page.getByRole('link', { name: 'Profile' }).click()
    await expect(page.getByText('Welcome back, regression_admin.')).toBeVisible()
    await page.getByRole('link', { name: 'Admin Panel' }).click()
    await expect(page.getByRole('heading', { name: 'Admin Overview' })).toBeVisible()
    await page.getByRole('link', { name: 'Feed', exact: true }).click()
    await expect(page.getByPlaceholder(/Share an update/i)).toBeVisible()
  }

  await assertHealthyNavigation(page, pageErrors)
})
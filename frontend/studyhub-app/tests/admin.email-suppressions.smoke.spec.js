import { expect, test } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi'

function parseSuppressionId(url) {
  const match = url.pathname.match(/\/api\/admin\/email-suppressions\/(\d+)\/(audit|unsuppress)$/)
  if (!match) return null
  return Number(match[1])
}

test('admin suppression tab supports list, audit timeline, and unsuppress flow @smoke', async ({ page }) => {
  await mockAuthenticatedApp(page)

  const suppressions = [
    {
      id: 71,
      email: 'suppressed_user@studyhub.test',
      active: true,
      reason: 'email_bounced',
      provider: 'resend',
      sourceEventType: 'email.bounced',
      sourceEventId: 'svix:msg_abc',
      sourceMessageId: 'email_123',
      updatedAt: '2026-03-17T20:05:00.000Z',
      lastSuppressedAt: '2026-03-17T20:05:00.000Z',
    },
  ]

  const suppressionAudits = new Map([
    [
      71,
      [
        {
          id: 401,
          action: 'auto-suppress',
          reason: 'Automatic suppression from email.bounced.',
          createdAt: '2026-03-17T20:05:00.000Z',
          performedBy: null,
        },
      ],
    ],
  ])

  await page.route('**/api/admin/email-suppressions?*', async (route) => {
    const url = new URL(route.request().url())
    const status = (url.searchParams.get('status') || 'active').toLowerCase()
    const query = (url.searchParams.get('q') || '').trim().toLowerCase()

    let records = suppressions.slice()
    if (status === 'active') records = records.filter((record) => record.active)
    if (status === 'inactive') records = records.filter((record) => !record.active)
    if (query) records = records.filter((record) => record.email.toLowerCase().includes(query))

    await route.fulfill({
      status: 200,
      json: {
        suppressions: records,
        total: records.length,
        page: 1,
        pages: 1,
        status,
        query,
      },
    })
  })

  await page.route('**/api/admin/email-suppressions/*/audit?*', async (route) => {
    const url = new URL(route.request().url())
    const suppressionId = parseSuppressionId(url)
    const suppression = suppressions.find((record) => record.id === suppressionId)

    if (!suppression) {
      await route.fulfill({ status: 404, json: { error: 'Suppression record not found.' } })
      return
    }

    const entries = suppressionAudits.get(suppressionId) || []
    await route.fulfill({
      status: 200,
      json: {
        suppression: {
          id: suppression.id,
          email: suppression.email,
          active: suppression.active,
        },
        entries,
        total: entries.length,
        page: 1,
        pages: 1,
      },
    })
  })

  await page.route('**/api/admin/email-suppressions/*/unsuppress', async (route) => {
    const url = new URL(route.request().url())
    const suppressionId = parseSuppressionId(url)
    const body = route.request().postDataJSON() || {}
    const reason = String(body.reason || '').trim()

    const suppression = suppressions.find((record) => record.id === suppressionId)
    if (!suppression) {
      await route.fulfill({ status: 404, json: { error: 'Suppression record not found.' } })
      return
    }

    if (reason.length < 8) {
      await route.fulfill({
        status: 400,
        json: { error: 'Provide an unsuppress reason with at least 8 characters.' },
      })
      return
    }

    if (!suppression.active) {
      await route.fulfill({ status: 400, json: { error: 'Suppression is already inactive.' } })
      return
    }

    suppression.active = false
    suppression.updatedAt = '2026-03-17T21:00:00.000Z'

    const nextAudit = {
      id: 402,
      action: 'manual-unsuppress',
      reason,
      createdAt: '2026-03-17T21:00:00.000Z',
      performedBy: {
        id: 42,
        username: 'regression_admin',
      },
    }

    const existingAudits = suppressionAudits.get(suppressionId) || []
    suppressionAudits.set(suppressionId, [nextAudit, ...existingAudits])

    await route.fulfill({
      status: 200,
      json: {
        message: 'Recipient unsuppressed successfully.',
        suppression,
      },
    })
  })

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin Overview' })).toBeVisible()

  await page.getByRole('button', { name: 'Email Suppressions' }).click()

  await expect(page.getByText('suppressed_user@studyhub.test')).toBeVisible()
  await expect(page.getByText('Email bounced')).toBeVisible()

  await page.getByRole('button', { name: 'View audit for suppressed_user@studyhub.test' }).click()
  await expect(page.getByText('Audit timeline')).toBeVisible()
  await expect(page.getByText('Automatic suppression from email.bounced.')).toBeVisible()

  await page
    .getByLabel('Unsuppress reason for suppressed_user@studyhub.test')
    .fill('Mailbox recovered and confirmed by support.')
  await page.getByRole('button', { name: 'Unsuppress suppressed_user@studyhub.test' }).click()

  await expect(page.getByText('Recipient unsuppressed successfully.')).toBeVisible()
  await expect(page.getByText('No suppression records for this filter.')).toBeVisible()

  const statusSelect = page
    .locator('select')
    .filter({ has: page.locator('option[value="inactive"]') })
    .first()
  await statusSelect.selectOption('inactive')

  await expect(page.getByRole('cell', { name: 'suppressed_user@studyhub.test', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'View audit for suppressed_user@studyhub.test' }).click()
  await expect(page.getByText('Mailbox recovered and confirmed by support.')).toBeVisible()
  await expect(page.getByText('Actor: regression_admin')).toBeVisible()
})

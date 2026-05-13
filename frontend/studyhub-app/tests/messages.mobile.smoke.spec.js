/**
 * messages.mobile.smoke.spec.js — Mobile (<768px) smoke for Loop M6.
 *
 * Covers the single-pane mobile messaging UX:
 *   1. /messages on a 375x812 viewport shows the conversation list
 *      WITHOUT a thread panel visible side-by-side.
 *   2. Tapping a conversation switches to a full-screen thread view
 *      with a Back button and writes `?conv=<id>` to the URL.
 *   3. Tapping Back returns to the list view and clears `?conv` from
 *      the URL — matches native iOS/Android Messages convention.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser } from './helpers/mockStudyHubApi'

const PHONE_VIEWPORT = { width: 375, height: 812 } // iPhone 14 baseline

const testUser = {
  id: 42,
  username: 'msg_mobile_user',
  role: 'student',
  email: 'msg_mobile@studyhub.test',
}

function createMockConversation(overrides = {}) {
  return {
    id: 1,
    type: 'dm',
    name: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T15:00:00.000Z',
    participants: [
      { id: 42, username: 'msg_mobile_user', avatarUrl: null },
      { id: 50, username: 'classmate_one', avatarUrl: null },
    ],
    lastMessage: {
      id: 100,
      content: 'Mobile thread test message',
      senderId: 50,
      createdAt: '2026-05-12T15:00:00.000Z',
    },
    unreadCount: 0,
    ...overrides,
  }
}

function createMockMessage(overrides = {}) {
  return {
    id: 100,
    content: 'Mobile thread test message',
    senderId: 50,
    sender: { id: 50, username: 'classmate_one', avatarUrl: null },
    conversationId: 1,
    createdAt: '2026-05-12T15:00:00.000Z',
    updatedAt: '2026-05-12T15:00:00.000Z',
    deletedAt: null,
    attachments: [],
    reactions: [],
    replyTo: null,
    poll: null,
    ...overrides,
  }
}

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_messages_seen', '1')
    window.localStorage.setItem('tutorial_feed_seen', '1')
  })
}

async function mockMessagingApi(page, { conversations, messages } = {}) {
  const user = createSessionUser(testUser)
  const convs = conversations || [createMockConversation()]
  const msgs = messages || [createMockMessage()]

  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, json: {} })
    } else {
      await route.fulfill({ status: 200, json: { ok: true } })
    }
  })

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, json: user })
  })

  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })

  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          name: 'University of Maryland',
          short: 'UMD',
          courses: user.enrollments.map((e) => e.course),
        },
      ],
    })
  })

  await page.route('**/api/messages/conversations', async (route) => {
    await route.fulfill({ status: 200, json: convs })
  })

  await page.route(/\/api\/messages\/conversations\/\d+\/messages/, async (route) => {
    await route.fulfill({ status: 200, json: msgs })
  })

  await page.route(/\/api\/messages\/conversations\/\d+$/, async (route) => {
    const url = route.request().url()
    const convId = parseInt(url.match(/conversations\/(\d+)$/)?.[1], 10)
    const conv = convs.find((c) => c.id === convId) || convs[0]
    await route.fulfill({ status: 200, json: conv })
  })

  await page.route('**/api/messages/online', async (route) => {
    await route.fulfill({ status: 200, json: [user.id] })
  })

  await page.route('**/api/messages/requests', async (route) => {
    await route.fulfill({ status: 200, json: { requests: [], totalPending: 0 } })
  })

  await page.route('**/api/messages/archived', async (route) => {
    await route.fulfill({ status: 200, json: [] })
  })

  return { user, conversations: convs, messages: msgs }
}

test.describe('Messages — mobile single-pane navigation (Loop M6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
  })

  test('mobile viewport shows ONLY the conversation list, not a side-by-side thread', async ({
    page,
  }) => {
    await disableTutorials(page)
    await mockMessagingApi(page)

    await page.goto('/messages')
    await expect(page).toHaveURL(/\/messages/)

    // Conversation entry is visible.
    await expect(page.getByText('classmate_one')).toBeVisible()

    // No thread log/composer is mounted alongside the list — the page is
    // single-pane on phone. The composer is only rendered when a
    // conversation is active, so the textarea must not exist yet.
    await expect(page.getByRole('log', { name: 'Message thread' })).toHaveCount(0)
    await expect(page.getByPlaceholder('Type a message...')).toHaveCount(0)
  })

  test('tapping a conversation opens a full-screen thread with a Back button and ?conv= URL', async ({
    page,
  }) => {
    await disableTutorials(page)
    await mockMessagingApi(page)

    await page.goto('/messages')
    await page.getByText('classmate_one').click()

    // Thread log + composer appear.
    await expect(page.getByRole('log', { name: 'Message thread' })).toBeVisible()
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible()

    // Back button (mobile-only) is visible and 44×44 minimum.
    const backBtn = page.getByTestId('messages-back-button')
    await expect(backBtn).toBeVisible()
    const box = await backBtn.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    // The active conversation id mirrors into the URL.
    await page.waitForURL((url) => url.searchParams.get('conv') === '1', { timeout: 5000 })

    // Conversation list is no longer in the DOM — single-pane.
    await expect(page.getByRole('button', { name: /Start new conversation/i })).toHaveCount(0)
  })

  test('Back button returns to the list and strips ?conv from the URL', async ({ page }) => {
    await disableTutorials(page)
    await mockMessagingApi(page)

    // Land directly on a thread via ?conv to exercise URL → state hydration.
    await page.goto('/messages?conv=1')

    // Thread loaded.
    await expect(page.getByRole('log', { name: 'Message thread' })).toBeVisible()

    // Tap Back.
    await page.getByTestId('messages-back-button').click()

    // We're back on the list, the thread DOM has unmounted, and `?conv` is gone.
    await expect(page.getByText('classmate_one')).toBeVisible()
    await expect(page.getByRole('log', { name: 'Message thread' })).toHaveCount(0)
    await page.waitForURL((url) => !url.searchParams.has('conv'), { timeout: 5000 })
  })
})

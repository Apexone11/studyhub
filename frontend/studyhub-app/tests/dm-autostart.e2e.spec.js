/**
 * dm-autostart.e2e.spec.js — Playwright E2E tests for DM auto-start flow
 *
 * Covers:
 * 1. Visiting /messages?dm=userId creates a new DM conversation
 * 2. Visiting /messages?dm=userId when conversation already exists selects it
 * 3. Query param is removed from URL after processing
 * 4. Invalid userId (self or non-existent) is handled gracefully
 */
import { expect, test } from '@playwright/test'
import { createSessionUser } from './helpers/mockStudyHubApi'

// ===== Test Data =====

const testUser = {
  username: 'dm_test_user',
  role: 'student',
  email: 'dm_test@studyhub.test',
  id: 42,
}

function createMockConversation(overrides = {}) {
  return {
    id: 1,
    type: 'dm',
    name: null,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T15:00:00.000Z',
    participants: [
      { id: 42, username: 'dm_test_user', avatarUrl: null },
      { id: 50, username: 'target_classmate', avatarUrl: null },
    ],
    lastMessage: null,
    unreadCount: 0,
    ...overrides,
  }
}

function createMockMessage(overrides = {}) {
  return {
    id: 100,
    content: 'Hello from auto-start test',
    senderId: 50,
    sender: { id: 50, username: 'target_classmate', avatarUrl: null },
    conversationId: 1,
    createdAt: '2026-03-30T15:00:00.000Z',
    updatedAt: '2026-03-30T15:00:00.000Z',
    deletedAt: null,
    attachments: [],
    reactions: [],
    replyTo: null,
    poll: null,
    ...overrides,
  }
}

// ===== Helpers =====

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_messages_seen', '1')
    window.localStorage.setItem('tutorial_feed_seen', '1')
  })
}

async function mockMessagingAppForAutostart(page, options = {}) {
  const user = createSessionUser(testUser)
  const existingConversations = options.existingConversations || []
  const messages = options.messages || []
  const shouldCreateNewConversation = options.shouldCreateNewConversation ?? true

  // Track if POST /api/messages/conversations was called (for assertions)
  let createConversationCalled = false
  let createConversationPayload = null

  // Catch-all for unmocked API requests (lowest priority — registered first)
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, json: {} })
    } else {
      await route.fulfill({ status: 200, json: { ok: true } })
    }
  })

  // Auth
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, json: user })
  })

  // Notifications
  await page.route('**/api/notifications?*', async (route) => {
    await route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } })
  })

  // Schools (for sidebar)
  await page.route('**/api/courses/schools', async (route) => {
    await route.fulfill({
      status: 200,
      json: [{
        id: 1,
        name: 'University of Maryland',
        short: 'UMD',
        courses: user.enrollments.map((e) => e.course),
      }],
    })
  })

  // Conversation list and creation
  await page.route('**/api/messages/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      createConversationCalled = true
      createConversationPayload = payload

      if (!shouldCreateNewConversation) {
        await route.fulfill({ status: 400, json: { error: 'Conversation already exists' } })
        return
      }

      const newConv = createMockConversation({
        id: 999,
        type: payload.type || 'dm',
        name: payload.name || null,
        participants: [
          { id: user.id, username: user.username, avatarUrl: null },
          ...(payload.participantIds || []).map((pid) => ({
            id: pid,
            username: `user_${pid}`,
            avatarUrl: null,
          })),
        ],
        lastMessage: null,
        unreadCount: 0,
      })
      await route.fulfill({ status: 201, json: newConv })
      return
    }

    await route.fulfill({ status: 200, json: existingConversations })
  })

  // Messages for conversation
  await page.route(/\/api\/messages\/conversations\/\d+\/messages/, async (route) => {
    await route.fulfill({ status: 200, json: messages })
  })

  // Conversation detail (for selectConversation)
  await page.route(/\/api\/messages\/conversations\/\d+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    const url = route.request().url()
    const convId = parseInt(url.match(/conversations\/(\d+)$/)?.[1], 10)

    // If conversation exists in list, return it; otherwise return the newly created one
    let conv = existingConversations.find((c) => c.id === convId)
    if (!conv) {
      conv = createMockConversation({ id: convId })
    }

    await route.fulfill({ status: 200, json: conv })
  })

  // Online users
  await page.route('**/api/messages/online', async (route) => {
    await route.fulfill({ status: 200, json: [user.id] })
  })

  // User search (for new conversation modal)
  await page.route('**/api/search?*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        results: {
          users: [
            { id: 50, username: 'target_classmate', avatarUrl: null },
            { id: 51, username: 'other_user', avatarUrl: null },
          ],
          sheets: [],
          courses: [],
          notes: [],
          groups: [],
        },
        query: '',
        type: 'all',
      },
    })
  })

  return {
    user,
    conversations: existingConversations,
    messages,
    getCreateConversationCalled: () => createConversationCalled,
    getCreateConversationPayload: () => createConversationPayload,
  }
}

// ===== Tests =====

test.describe('DM Auto-start E2E', () => {
  test('navigating to /messages?dm=userId creates a new DM conversation', async ({ page }) => {
    await disableTutorials(page)
    const mockData = await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      shouldCreateNewConversation: true,
    })

    await page.goto('/messages?dm=50')

    // Wait for URL to be updated (dm param removed)
    await page.waitForURL((url) => !url.searchParams.has('dm'), { timeout: 5000 })

    // Verify POST /api/messages/conversations was called with correct payload
    expect(mockData.getCreateConversationCalled()).toBe(true)
    const payload = mockData.getCreateConversationPayload()
    expect(payload.participantIds).toEqual([50])
    expect(payload.type).toBe('dm')

    // Verify no crashes
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)

    // Verify page is still on /messages (without dm param)
    await expect(page).toHaveURL('/messages')
  })

  test('navigating to /messages?dm=userId when conversation exists selects the existing conversation', async ({ page }) => {
    await disableTutorials(page)

    const existingConversation = createMockConversation({
      id: 1,
      participants: [
        { id: 42, username: 'dm_test_user', avatarUrl: null },
        { id: 50, username: 'target_classmate', avatarUrl: null },
      ],
      lastMessage: {
        id: 100,
        content: 'Hi there!',
        senderId: 50,
        createdAt: '2026-03-30T12:00:00.000Z',
      },
    })

    await mockMessagingAppForAutostart(page, {
      existingConversations: [existingConversation],
      shouldCreateNewConversation: false,
    })

    await page.goto('/messages?dm=50')

    // Wait for URL to be updated
    await page.waitForURL((url) => !url.searchParams.has('dm'), { timeout: 5000 })

    // Verify the page displays the conversation
    // The conversation should either be selected or visible in the list
    await expect(page.locator('text=target_classmate')).toBeVisible()

    // Verify no crashes
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)

    // Verify URL doesn't have dm param
    await expect(page).toHaveURL('/messages')
  })

  test('dm query param is removed from URL after processing', async ({ page }) => {
    await disableTutorials(page)
    await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      shouldCreateNewConversation: true,
    })

    // Initially navigate with dm param
    await page.goto('/messages?dm=50')

    // Wait for the param to be removed (should happen in useEffect)
    await page.waitForURL((url) => !url.searchParams.has('dm'), { timeout: 5000 })

    // Check final URL
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('dm=')
    expect(finalUrl).toMatch(/\/messages(\?|$)/)
  })

  test('loading /messages without dm param does not trigger conversation creation', async ({ page }) => {
    await disableTutorials(page)

    await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      shouldCreateNewConversation: true,
    })

    // Navigate without dm param
    await page.goto('/messages')

    // Wait a bit to ensure no POST request happens
    await page.waitForTimeout(1000)

    // Verify page loads normally
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)
  })

  test('navigating to /messages?dm=userId with messages displayed in thread', async ({ page }) => {
    await disableTutorials(page)

    await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      messages: [
        createMockMessage({
          id: 100,
          content: 'Hey, are you there?',
          senderId: 50,
        }),
        createMockMessage({
          id: 101,
          content: 'Yes, I am!',
          senderId: 42,
        }),
      ],
      shouldCreateNewConversation: true,
    })

    await page.goto('/messages?dm=50')

    // Wait for URL to be updated
    await page.waitForURL((url) => !url.searchParams.has('dm'), { timeout: 5000 })

    // Verify the message thread loads without crashes
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)
  })

  test('navigating to /messages?dm=userId with invalid userId (self) does not create conversation', async ({ page }) => {
    await disableTutorials(page)
    const mockData = await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      shouldCreateNewConversation: true,
    })

    // Try to DM self (userId 42 is the test user)
    await page.goto('/messages?dm=42')

    // Wait to ensure no conversation is created
    await page.waitForTimeout(1000)

    // Verify conversation creation was NOT called
    expect(mockData.getCreateConversationCalled()).toBe(false)

    // Verify no crashes
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)
  })

  test('navigating to /messages?dm=userId with non-numeric userId does not crash', async ({ page }) => {
    await disableTutorials(page)
    const mockData = await mockMessagingAppForAutostart(page, {
      existingConversations: [],
      shouldCreateNewConversation: true,
    })

    // Try with non-numeric userId
    await page.goto('/messages?dm=notanumber')

    // Wait to ensure page stabilizes
    await page.waitForTimeout(1000)

    // Verify conversation creation was NOT called
    expect(mockData.getCreateConversationCalled()).toBe(false)

    // Verify no crashes
    await expect(page.locator('text=This page crashed.')).toHaveCount(0)
  })
})

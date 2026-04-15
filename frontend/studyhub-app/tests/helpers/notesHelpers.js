/**
 * notesHelpers.js — shared helpers for Notes hardening v2 E2E tests.
 *
 * These helpers target a live backend (beta stack or local dev) because the
 * hardening persistence pipeline (autosave debounce, IndexedDB draft, safety
 * flush via sendBeacon, version history) can only be meaningfully exercised
 * against a real Express + Prisma API. They mirror the style established in
 * tests/search.privacy.beta-live.spec.js (direct API login via
 * page.request.post).
 */

const API_BASE_URL = process.env.BETA_API_URL || 'http://localhost:4000'
const FRONTEND_BASE_URL = process.env.BETA_FRONTEND_URL || 'http://127.0.0.1:4173'
const STUDENT_USERNAME = process.env.BETA_STUDENT1_USERNAME || 'beta_student1'
const STUDENT_PASSWORD = process.env.BETA_STUDENT1_PASSWORD || 'BetaStudent123!'

export const notesTestConfig = {
  API_BASE_URL,
  FRONTEND_BASE_URL,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
}

/**
 * Authenticate a Playwright page as the seeded beta student.
 * Uses page.request so cookies are shared with subsequent page.goto navigations.
 */
export async function loginAsBetaStudent(page) {
  const response = await page.request.post(`${API_BASE_URL}/api/auth/login`, {
    headers: { 'content-type': 'application/json' },
    data: { username: STUDENT_USERNAME, password: STUDENT_PASSWORD },
    failOnStatusCode: false,
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(
      `loginAsBetaStudent failed: ${response.status()} ${body}. ` +
        `Set BETA_STUDENT1_USERNAME / BETA_STUDENT1_PASSWORD and ensure the ` +
        `backend at ${API_BASE_URL} is running with seeded beta users.`,
    )
  }

  const payload = await response.json()
  return payload.user
}

/**
 * Create a note via the backend API and return its id.
 * Mirrors the POST /api/notes contract.
 */
export async function createNote(page, title, content = '') {
  const response = await page.request.post(`${API_BASE_URL}/api/notes`, {
    headers: { 'content-type': 'application/json' },
    data: { title, content },
    failOnStatusCode: false,
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`createNote failed: ${response.status()} ${body}`)
  }

  const json = await response.json()
  const id = json.note?.id ?? json.id
  if (!id) {
    throw new Error(`createNote returned no id: ${JSON.stringify(json)}`)
  }
  return id
}

/**
 * Enable the Notes Hardening v2 flag by writing to localStorage before any
 * page script runs. Must be called via context.addInitScript / page.addInitScript
 * BEFORE the first navigation so the editor sees the flag on mount.
 */
export function enableHardeningFlagScript() {
  return () => {
    try {
      window.localStorage.setItem('flag_notes_hardening_v2', '1')
      window.localStorage.setItem('tutorial_notes_seen', '1')
    } catch {
      /* localStorage may be unavailable in some contexts */
    }
  }
}

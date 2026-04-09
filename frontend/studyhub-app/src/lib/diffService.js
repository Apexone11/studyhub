/**
 * Thin fetch wrappers for the contribution diff + hunk-level comments API.
 *
 * Backend routes (see backend/src/modules/sheets/sheets.contributions.controller.js):
 *   GET    /api/sheets/contributions/:id/diff
 *   GET    /api/sheets/contributions/:id/comments
 *   POST   /api/sheets/contributions/:id/comments
 *   DELETE /api/sheets/contributions/:id/comments/:commentId
 *
 * All requests send `credentials: 'include'` so the JWT session cookie travels
 * with them. Callers catch thrown errors and route them through showToast.
 */
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from './http'

async function request(url, options = {}) {
  const response = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: authHeaders(),
    ...options,
  })
  const data = await readJsonSafely(response, {})
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Request failed.'))
  }
  return data
}

export async function fetchContributionDiff(contributionId) {
  return request(`/api/sheets/contributions/${contributionId}/diff`)
}

export async function fetchContributionComments(contributionId) {
  return request(`/api/sheets/contributions/${contributionId}/comments`)
}

export async function postContributionComment(contributionId, payload) {
  return request(`/api/sheets/contributions/${contributionId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteContributionComment(contributionId, commentId) {
  return request(`/api/sheets/contributions/${contributionId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}

/**
 * Top contributors and fork tree — used by the analytics widget and viewer
 * sidebar. Both are public (optionalAuth on the backend) so no auth headers
 * are strictly required, but we include credentials so the user's session
 * can unlock private sheets they own.
 */
export async function fetchSheetContributors(sheetId) {
  return request(`/api/sheets/${sheetId}/contributors`)
}

export async function fetchSheetForkTree(sheetId) {
  return request(`/api/sheets/${sheetId}/fork-tree`)
}

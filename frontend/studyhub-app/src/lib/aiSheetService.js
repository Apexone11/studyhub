/**
 * aiSheetService.js — frontend client for /api/ai/sheets/* and /api/ai/notes/*
 *
 * Thin wrapper that handles the credentials + error-envelope shape so
 * callers can `await analyzeSheet(id)` and get `{ ok, data, error }`.
 */
import { API } from '../config'

async function postJson(path, body = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`
      return { ok: false, error: message, status: res.status }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error.', status: 0 }
  }
}

// ── Sheet endpoints ────────────────────────────────────────────────

export function analyzeSheet(sheetId) {
  return postJson(`/api/ai/sheets/${sheetId}/analyze`)
}

export function proposeSheetEdit(sheetId, instruction) {
  return postJson(`/api/ai/sheets/${sheetId}/propose-edit`, { instruction })
}

export function applySheetEdit(sheetId, { proposedContent, snapshotName, snapshotMessage }) {
  return postJson(`/api/ai/sheets/${sheetId}/apply-edit`, {
    proposedContent,
    snapshotName,
    snapshotMessage,
  })
}

// ── Note endpoints ─────────────────────────────────────────────────

export function summarizeNote(noteId, length = 'medium') {
  return postJson(`/api/ai/notes/${noteId}/summarize`, { length })
}

export function generateNoteFlashcards(noteId, count = 10) {
  return postJson(`/api/ai/notes/${noteId}/flashcards`, { count })
}

export function askAboutNote(noteId, question) {
  return postJson(`/api/ai/notes/${noteId}/ask`, { question })
}

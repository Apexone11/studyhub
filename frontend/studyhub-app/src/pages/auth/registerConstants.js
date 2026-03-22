/* ═══════════════════════════════════════════════════════════════════════════
 * registerConstants.js — Validation rules, step configs, and API helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

import { API } from '../../config'

/* ── Validation rules ──────────────────────────────────────────────────── */
export const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

/* ── Account-field validation ──────────────────────────────────────────── */
export function validateAccountFields(form) {
  if (!form.username.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
    return 'Please fill in all required fields.'
  }
  if (!RULES.username.test(form.username.trim())) {
    return 'Username must be 3-20 characters using letters, numbers, or underscores.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Please enter a valid email address.'
  }
  if (!RULES.password.test(form.password)) {
    return 'Password must be at least 8 characters and include a capital letter and a number.'
  }
  if (form.password !== form.confirmPassword) {
    return 'Passwords do not match.'
  }
  if (!form.termsAccepted) {
    return 'You must accept the Terms of Use and Community Guidelines.'
  }
  return ''
}

/* ── Step configuration builder ────────────────────────────────────────── */
export function getSteps(googleCredential) {
  return googleCredential
    ? [['courses', 'Courses']]
    : [['account', 'Account'], ['verify', 'Verify'], ['courses', 'Courses']]
}

/* ── API helpers (return { ok, data } or { ok, error }) ────────────────── */

export async function apiStartRegistration(form) {
  const response = await fetch(`${API}/api/auth/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      termsAccepted: form.termsAccepted,
    }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Could not create your account.' }
  return { ok: true, data }
}

export async function apiVerifyCode(verificationToken, code) {
  const response = await fetch(`${API}/api/auth/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ verificationToken, code }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Invalid or expired code.' }
  return { ok: true, data }
}

export async function apiResendCode(verificationToken) {
  const response = await fetch(`${API}/api/auth/register/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ verificationToken }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Could not resend code.' }
  return { ok: true, data }
}

export async function apiGoogleAuth(credential) {
  const response = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Google sign-up failed.' }
  return { ok: true, data }
}

export async function apiGoogleComplete(credential, schoolId, courseIds, customCourses) {
  const response = await fetch(`${API}/api/auth/google/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential, schoolId, courseIds, customCourses }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Could not finish registration.' }
  return { ok: true, data }
}

export async function apiCompleteRegistration(verificationToken, schoolId, courseIds, customCourses) {
  const response = await fetch(`${API}/api/auth/register/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ verificationToken, schoolId, courseIds, customCourses }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Could not finish registration.' }
  return { ok: true, data }
}

export async function apiLoadSchools() {
  const response = await fetch(`${API}/api/courses/schools`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Could not load the course catalog.')
  return response.json()
}

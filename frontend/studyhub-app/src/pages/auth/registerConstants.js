/* ═══════════════════════════════════════════════════════════════════════════
 * registerConstants.js — Validation rules, step configs, and API helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

import { API } from '../../config'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'

/* ── Validation rules ──────────────────────────────────────────────────── */
export const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

/* ── Account-field validation ──────────────────────────────────────────── */

/**
 * Per-field validation map. Returns `{ fieldName: message }` so the form can
 * render inline `aria-invalid` errors next to each input. Empty object means
 * the form is valid.
 */
export function validateAccountFieldsMap(form) {
  const errors = {}
  if (!form.username.trim()) errors.username = 'Please enter a username.'
  else if (!RULES.username.test(form.username.trim()))
    errors.username = 'Username must be 3-20 characters using letters, numbers, or underscores.'

  if (!form.email.trim()) errors.email = 'Please enter your email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Please enter a valid email address.'

  if (!form.password) errors.password = 'Please choose a password.'
  else if (!RULES.password.test(form.password))
    errors.password =
      'Password must be at least 8 characters and include a capital letter and a number.'

  if (!form.confirmPassword) errors.confirmPassword = 'Re-enter your password.'
  else if (form.password && form.password !== form.confirmPassword)
    errors.confirmPassword = 'Passwords do not match.'

  if (!form.termsAccepted)
    errors.termsAccepted =
      'You must accept the Terms of Use, Privacy Policy, and Community Guidelines.'

  return errors
}

/**
 * Legacy single-message validator. Returns the first violation's message or
 * empty string. Kept for backward compatibility with existing tests and the
 * banner alert in `RegisterScreen`.
 */
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
    return 'You must accept the Terms of Use, Privacy Policy, and Community Guidelines.'
  }
  return ''
}

/* ── Step configuration builder ────────────────────────────────────────── */
export function getSteps(googleCredential) {
  // Google users are created immediately — no steps needed.
  // Local users: Account → Verify → done.
  return googleCredential
    ? []
    : [
        ['account', 'Account'],
        ['verify', 'Verify'],
      ]
}

/* ── API helpers (return { ok, data } or { ok, error }) ────────────────── */

export async function apiStartRegistration(form, options = {}) {
  const payload = {
    username: form.username.trim(),
    email: form.email.trim(),
    password: form.password,
    confirmPassword: form.confirmPassword,
    accountType: form.accountType || 'student',
    termsAccepted: form.termsAccepted,
    termsVersion: CURRENT_LEGAL_VERSION,
  }
  if (options.referralCode) payload.referralCode = options.referralCode
  const response = await fetch(`${API}/api/auth/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
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

export async function apiGoogleAuth(credential, options = {}) {
  const payload = {
    credential,
    legalAccepted: Boolean(options.legalAccepted),
    legalVersion: options.legalAccepted ? CURRENT_LEGAL_VERSION : null,
  }
  if (options.referralCode) payload.referralCode = options.referralCode
  const response = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Google sign-up failed.' }
  return { ok: true, data }
}

export async function apiCompleteRegistration(verificationToken) {
  const response = await fetch(`${API}/api/auth/register/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ verificationToken }),
  })
  const data = await response.json()
  if (!response.ok) return { ok: false, error: data.error || 'Could not finish registration.' }
  return { ok: true, data }
}

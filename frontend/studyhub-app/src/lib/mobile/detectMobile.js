// src/lib/mobile/detectMobile.js
// Detect whether the app is running inside a Capacitor native shell.
// This is the single source of truth for mobile vs. web routing.

import { Capacitor } from '@capacitor/core'

let _isNative = null

/**
 * Returns `true` when running inside the Capacitor WebView (Android/iOS).
 * Falls back to `false` for the normal browser SPA.
 *
 * The result is cached after the first call because the platform cannot
 * change during a single page session.
 */
export function isNativePlatform() {
  if (_isNative !== null) return _isNative

  try {
    // Capacitor injects a global `Capacitor` object in native shells.
    // The `isNativePlatform()` method is the official check.
    _isNative = Capacitor.isNativePlatform()
  } catch {
    // Fallback: index.html inline script sets __SH_NATIVE__ before modules load
    _isNative = typeof window !== 'undefined' && Boolean(window.__SH_NATIVE__)
  }

  return _isNative
}

/**
 * Returns the platform string: 'android', 'ios', or 'web'.
 */
export function getPlatform() {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

/**
 * Convenience: true only on Android native.
 */
export function isAndroid() {
  return getPlatform() === 'android'
}

/**
 * Convenience: true only on iOS native.
 */
export function isIos() {
  return getPlatform() === 'ios'
}

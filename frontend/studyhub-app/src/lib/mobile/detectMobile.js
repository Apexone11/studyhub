// src/lib/mobile/detectMobile.js
// Detect whether the app is running inside a Capacitor native shell.
// This is the single source of truth for mobile vs. web routing.
//
// IMPORTANT: Do not statically `import` from '@capacitor/core' here. The
// Capacitor runtime injects a global `window.Capacitor` object inside the
// native Android/iOS WebView, and that global is the authoritative source at
// runtime. Statically importing the package would pull mobile-only code into
// the web Vite build, which (a) breaks the dev server when the package isn't
// installed in the web container and (b) couples the web bundle to the
// mobile SDK for a check that is by definition a no-op on the web. Anything
// that truly needs the @capacitor/* packages (deep links, social login, etc.)
// does `await import('@capacitor/...')` behind an `isNativePlatform()` gate,
// so those chunks only load on mobile.

let _isNative = null

// Build-time flag. `vite build --mode mobile` (see scripts/build-mobile.js)
// sets `import.meta.env.MODE === 'mobile'`. That string literal is inlined
// by Vite's define plugin at compile time, so this becomes a constant that
// dead-code-eliminates cleanly in web builds (where MODE !== 'mobile').
//
// The mobile bundle is physically packaged into the Android APK's assets
// and is never served to a browser — so trusting this compile-time flag
// avoids the runtime-sniffing fragility (WebView URL quirks, Capacitor
// injection timing) that was rendering the web HomePage inside the APK
// instead of MobileLandingPage.
const BUILD_MARKED_MOBILE = import.meta.env.MODE === 'mobile'

function getNativeCapacitor() {
  if (typeof window === 'undefined') return null
  const cap = window.Capacitor
  return cap && typeof cap === 'object' ? cap : null
}

/**
 * Returns `true` when running inside the Capacitor WebView (Android/iOS).
 * Falls back to `false` for the normal browser SPA.
 *
 * The result is cached after the first call because the platform cannot
 * change during a single page session.
 */
export function isNativePlatform() {
  if (_isNative !== null) return _isNative

  // Build-time marker wins — a mobile-built bundle is always mobile.
  if (BUILD_MARKED_MOBILE) {
    _isNative = true
    return _isNative
  }

  const cap = getNativeCapacitor()
  if (cap && typeof cap.isNativePlatform === 'function') {
    try {
      _isNative = Boolean(cap.isNativePlatform())
      return _isNative
    } catch {
      /* fall through to the window flag */
    }
  }

  // Fallback: index.html inline script sets __SH_NATIVE__ before modules load.
  _isNative = typeof window !== 'undefined' && Boolean(window.__SH_NATIVE__)
  return _isNative
}

/**
 * Returns the platform string: 'android', 'ios', or 'web'.
 */
export function getPlatform() {
  const cap = getNativeCapacitor()
  if (cap && typeof cap.getPlatform === 'function') {
    try {
      const platform = cap.getPlatform()
      if (typeof platform === 'string' && platform.length > 0) return platform
    } catch {
      /* fall through */
    }
  }
  return 'web'
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

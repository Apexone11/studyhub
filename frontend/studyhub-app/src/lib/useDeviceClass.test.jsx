/**
 * useDeviceClass hook + classifier.
 *
 * Covers:
 *   - phone UA (iPhone) + narrow viewport classifies as 'phone'
 *   - iPad UA classifies as 'tablet' regardless of viewport
 *   - desktop UA + wide viewport classifies as 'desktop'
 *   - touch + viewport 600-1180 classifies as 'tablet' (catches modern
 *     iPadOS Safari, which now ships a Macintosh-style UA)
 *   - desktop UA + tiny viewport (devtools docked narrow) stays
 *     'desktop' — phone gate is conjunctive
 *   - resize listener updates the snapshot
 *   - `resolveDeviceClass` width-only legacy path still works
 *   - `useDeviceClassString` returns the bare string for back-compat
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  classifyDevice,
  resolveDeviceClass,
  useDeviceClass,
  useDeviceClassString,
  DEVICE_CLASS_PHONE,
  DEVICE_CLASS_TABLET,
  DEVICE_CLASS_DESKTOP,
} from './useDeviceClass'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
// Modern iPadOS Safari (since iPadOS 13) ships a Macintosh-style UA;
// the "isTouch + viewport 600-1180" branch is what classifies it.
const IPADOS_MAC_UA = DESKTOP_CHROME_UA

function setViewport(width, height = 800) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: ua })
}

function setMaxTouchPoints(value) {
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value })
}

function setOntouchstart(enabled) {
  if (enabled) {
    // Adding a property to `window` is the canonical iOS feature-detect.
    window.ontouchstart = null
  } else {
    delete window.ontouchstart
  }
}

describe('useDeviceClass — classifier (pure function)', () => {
  it('classifies an iPhone UA on a 390px viewport as phone', () => {
    expect(classifyDevice(IPHONE_UA, 390, true)).toBe(DEVICE_CLASS_PHONE)
  })

  it('classifies an Android phone UA on 360px as phone', () => {
    expect(classifyDevice(ANDROID_PHONE_UA, 360, true)).toBe(DEVICE_CLASS_PHONE)
  })

  it('classifies an iPad UA on a tablet-sized viewport as tablet', () => {
    // iPad UA contains "Mobile/..." which matches the phone regex, but
    // 1024px is wider than the phone-viewport ceiling (768) so the
    // conjunctive phone gate fails and tablet-UA fallthrough wins.
    expect(classifyDevice(IPAD_UA, 1024, true)).toBe(DEVICE_CLASS_TABLET)
    expect(classifyDevice(IPAD_UA, 820, true)).toBe(DEVICE_CLASS_TABLET)
  })

  it('classifies an Android-without-Mobile-token UA as tablet', () => {
    expect(classifyDevice(ANDROID_TABLET_UA, 1100, true)).toBe(DEVICE_CLASS_TABLET)
  })

  it('classifies a desktop UA on a wide viewport as desktop', () => {
    expect(classifyDevice(DESKTOP_CHROME_UA, 1920, false)).toBe(DEVICE_CLASS_DESKTOP)
  })

  it('classifies a desktop UA with devtools docked narrow as desktop (phone gate is conjunctive)', () => {
    expect(classifyDevice(DESKTOP_CHROME_UA, 400, false)).toBe(DEVICE_CLASS_DESKTOP)
  })

  it('uses the touch + viewport-band branch for modern iPadOS Safari (Mac UA)', () => {
    expect(classifyDevice(IPADOS_MAC_UA, 1024, true)).toBe(DEVICE_CLASS_TABLET)
  })

  it('does not promote a non-touch desktop in the tablet viewport band', () => {
    expect(classifyDevice(DESKTOP_CHROME_UA, 1024, false)).toBe(DEVICE_CLASS_DESKTOP)
  })
})

describe('resolveDeviceClass — width-only legacy path', () => {
  it('returns phone for <=767px', () => {
    expect(resolveDeviceClass(360)).toBe(DEVICE_CLASS_PHONE)
    expect(resolveDeviceClass(767)).toBe(DEVICE_CLASS_PHONE)
  })

  it('returns tablet for 768-1179px', () => {
    expect(resolveDeviceClass(768)).toBe(DEVICE_CLASS_TABLET)
    expect(resolveDeviceClass(1024)).toBe(DEVICE_CLASS_TABLET)
    expect(resolveDeviceClass(1179)).toBe(DEVICE_CLASS_TABLET)
  })

  it('returns desktop for >=1180px', () => {
    expect(resolveDeviceClass(1180)).toBe(DEVICE_CLASS_DESKTOP)
    expect(resolveDeviceClass(1920)).toBe(DEVICE_CLASS_DESKTOP)
  })

  it('returns desktop for non-finite inputs', () => {
    expect(resolveDeviceClass(NaN)).toBe(DEVICE_CLASS_DESKTOP)
    expect(resolveDeviceClass(undefined)).toBe(DEVICE_CLASS_DESKTOP)
  })
})

describe('useDeviceClass — React hook', () => {
  const originalUA = window.navigator.userAgent
  const originalMaxTouch = window.navigator.maxTouchPoints
  const originalWidth = window.innerWidth
  const originalHeight = window.innerHeight

  beforeEach(() => {
    setUserAgent(DESKTOP_CHROME_UA)
    setMaxTouchPoints(0)
    setOntouchstart(false)
    setViewport(1440, 900)
  })

  afterEach(() => {
    setUserAgent(originalUA)
    setMaxTouchPoints(originalMaxTouch)
    setOntouchstart(false)
    setViewport(originalWidth, originalHeight)
  })

  it('returns a rich snapshot object', () => {
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current).toEqual(
      expect.objectContaining({
        deviceClass: expect.any(String),
        isTouch: expect.any(Boolean),
        viewportWidth: expect.any(Number),
        viewportHeight: expect.any(Number),
        isLandscape: expect.any(Boolean),
        userAgent: expect.any(String),
      }),
    )
  })

  it('detects iPhone UA + narrow viewport as phone', () => {
    setUserAgent(IPHONE_UA)
    setOntouchstart(true)
    setViewport(390, 844)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.deviceClass).toBe(DEVICE_CLASS_PHONE)
    expect(result.current.isLandscape).toBe(false)
  })

  it('detects iPad UA as tablet', () => {
    setUserAgent(IPAD_UA)
    setOntouchstart(true)
    setViewport(1024, 768)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.deviceClass).toBe(DEVICE_CLASS_TABLET)
    expect(result.current.isLandscape).toBe(true)
  })

  it('detects desktop UA + wide viewport as desktop', () => {
    setUserAgent(DESKTOP_CHROME_UA)
    setViewport(1600, 1000)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.deviceClass).toBe(DEVICE_CLASS_DESKTOP)
    expect(result.current.isTouch).toBe(false)
  })

  it('detects touch via ontouchstart presence', () => {
    setOntouchstart(true)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.isTouch).toBe(true)
  })

  it('detects touch via maxTouchPoints fallback', () => {
    setOntouchstart(false)
    setMaxTouchPoints(5)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.isTouch).toBe(true)
  })

  it('updates the snapshot on resize', () => {
    setUserAgent(DESKTOP_CHROME_UA)
    setViewport(1440, 900)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.deviceClass).toBe(DEVICE_CLASS_DESKTOP)
    expect(result.current.viewportWidth).toBe(1440)

    act(() => {
      // Simulate a window resize. Touch UA stays the same; iPad UA
      // already on, viewport flips to portrait phone-narrow.
      setUserAgent(IPHONE_UA)
      setOntouchstart(true)
      setViewport(390, 844)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.deviceClass).toBe(DEVICE_CLASS_PHONE)
    expect(result.current.viewportWidth).toBe(390)
    expect(result.current.viewportHeight).toBe(844)
  })

  it('updates on orientationchange (iOS-Safari rotation gesture)', () => {
    setUserAgent(IPAD_UA)
    setOntouchstart(true)
    setViewport(1024, 768)
    const { result } = renderHook(() => useDeviceClass())
    expect(result.current.isLandscape).toBe(true)

    act(() => {
      setViewport(768, 1024)
      window.dispatchEvent(new Event('orientationchange'))
    })

    expect(result.current.isLandscape).toBe(false)
  })

  it('removes resize listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useDeviceClass())
    unmount()
    const removedResize = removeSpy.mock.calls.some(([type]) => type === 'resize')
    const removedOrientation = removeSpy.mock.calls.some(([type]) => type === 'orientationchange')
    expect(removedResize).toBe(true)
    expect(removedOrientation).toBe(true)
    removeSpy.mockRestore()
  })
})

describe('useDeviceClassString — legacy bare-string hook', () => {
  it('returns the string device class', () => {
    setUserAgent(DESKTOP_CHROME_UA)
    setMaxTouchPoints(0)
    setOntouchstart(false)
    setViewport(1600, 1000)
    const { result } = renderHook(() => useDeviceClassString())
    expect(result.current).toBe(DEVICE_CLASS_DESKTOP)
  })
})

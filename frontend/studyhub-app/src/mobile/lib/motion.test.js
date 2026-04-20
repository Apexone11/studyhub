// src/mobile/lib/motion.test.js
// Unit tests for the motion helper library.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DUR,
  EASE,
  countUp,
  pageEnter,
  pageExit,
  prefersReducedMotion,
  springPress,
  staggerFeed,
} from './motion'

function setReducedMotion(on) {
  if (on) document.body.classList.add('sh-mobile-reduced-motion')
  else document.body.classList.remove('sh-mobile-reduced-motion')
}

beforeEach(() => {
  setReducedMotion(false)
  document.body.innerHTML = ''
})

afterEach(() => {
  setReducedMotion(false)
})

describe('motion constants', () => {
  it('exposes duration + easing tokens', () => {
    expect(DUR.base).toBe(320)
    expect(EASE.spring).toEqual([0.34, 1.56, 0.64, 1])
  })
})

describe('prefersReducedMotion', () => {
  it('returns true when the user toggle class is on body', () => {
    setReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when no signals set', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('pageEnter / pageExit', () => {
  it('returns null for a missing element', () => {
    expect(pageEnter(null)).toBeNull()
    expect(pageExit(null)).toBeNull()
  })

  it('runs on a real element without throwing', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    expect(() => pageEnter(el, 'forward')).not.toThrow()
    expect(() => pageExit(el, 'back')).not.toThrow()
  })

  it('falls through the reduced-motion branch without throwing', () => {
    setReducedMotion(true)
    const el = document.createElement('div')
    document.body.appendChild(el)
    expect(() => pageEnter(el)).not.toThrow()
    expect(() => pageExit(el)).not.toThrow()
  })
})

describe('springPress', () => {
  it('is a no-op when reduced motion is on', () => {
    setReducedMotion(true)
    const el = document.createElement('button')
    document.body.appendChild(el)
    expect(springPress(el)).toBeNull()
  })

  it('returns an instance on a real element', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    const inst = springPress(el, false)
    expect(inst).toBeTruthy()
  })
})

describe('staggerFeed', () => {
  it('returns null for an empty list', () => {
    expect(staggerFeed([])).toBeNull()
  })

  it('runs on an array of elements', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    expect(() => staggerFeed([a, b], 50)).not.toThrow()
  })
})

describe('countUp', () => {
  it('requires an onUpdate callback', () => {
    expect(countUp(0, 10, 400)).toBeNull()
  })

  it('jumps to the final value under reduced motion', () => {
    setReducedMotion(true)
    const spy = vi.fn()
    countUp(0, 42, 400, spy)
    expect(spy).toHaveBeenCalledWith(42)
  })

  it('runs under normal motion without throwing', () => {
    const spy = vi.fn()
    expect(() => countUp(0, 5, 100, spy)).not.toThrow()
  })
})

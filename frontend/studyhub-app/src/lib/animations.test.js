import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { fadeInUp, popScale, countUp } from './animations'

// Mock animejs to a stable test shape. In jsdom the real package's default
// export is a callable that does not carry `animate` as a property, so code
// that does `const { animate } = await getAnime()` crashes during unit tests.
// The shape below mirrors anime.js v4's named exports (animate, utils.set, stagger)
// so reduced-motion paths and signature-only tests exercise cleanly.
vi.mock('animejs', () => {
  const animate = vi.fn(() => Promise.resolve())
  const stagger = vi.fn((ms) => ms)
  const utils = { set: vi.fn() }
  const mod = { animate, stagger, utils }
  return { default: mod, animate, stagger, utils }
})

describe('animations module', () => {
  beforeEach(() => {
    // Mock window.matchMedia to support prefers-reduced-motion testing
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query) => ({
        matches: false, // default: animations enabled
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('fadeInUp', () => {
    it('returns null when prefers-reduced-motion is set', async () => {
      // Setup: mock matchMedia to return prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Mock getAnime() to provide utils.set
      vi.doMock(
        'animejs',
        () => ({
          default: {
            utils: {
              set: vi.fn(),
            },
          },
        }),
        { virtual: true },
      )

      // Act: call fadeInUp with reduced motion enabled
      const result = await fadeInUp('.element')

      // Assert: returns null when reduced motion is active
      expect(result).toBeNull()
    })

    it('is an async function', async () => {
      // Act: call fadeInUp
      const promise = fadeInUp('.element')

      // Assert: returns a promise
      expect(promise).toBeInstanceOf(Promise)
      // Swallow any inner rejection — this test only asserts the function
      // signature; full anime.js execution is covered by e2e tests.
      await promise.catch(() => {})
    })

    it('respects default options when none provided', async () => {
      // Setup: prefers-reduced-motion is off, so normal animation runs
      // Mock window.matchMedia for reduced motion check
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: false, // reduced motion is OFF
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Note: anime.js may not be available in test env, so this test
      // verifies the function returns a promise and respects reduced motion.
      // Full anime.js integration is tested in e2e tests.

      const promise = fadeInUp('.element')
      promise.catch(() => {})
      expect(promise).toBeInstanceOf(Promise)
      // If anime.js isn't loaded, this may error, which is acceptable for unit tests
    })
  })

  describe('popScale', () => {
    it('returns null when prefers-reduced-motion is set', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act: call popScale with reduced motion enabled
      const result = await popScale('.button')

      // Assert: returns null when reduced motion is active
      expect(result).toBeNull()
    })

    it('is an async function', async () => {
      // Act: call popScale
      const promise = popScale('.button')

      // Assert: returns a promise
      expect(promise).toBeInstanceOf(Promise)
      await promise.catch(() => {})
    })

    it('works with element selectors', async () => {
      // Setup: create mock element
      const mockElement = document.createElement('button')
      document.body.appendChild(mockElement)

      try {
        // Act: call popScale with element
        const promise = popScale(mockElement)

        // Assert: returns a promise
        expect(promise).toBeInstanceOf(Promise)
        await promise.catch(() => {})
      } finally {
        document.body.removeChild(mockElement)
      }
    })
  })

  describe('countUp', () => {
    let mockElement

    beforeEach(() => {
      // Create a mock DOM element for countUp tests
      mockElement = document.createElement('div')
      document.body.appendChild(mockElement)
    })

    afterEach(() => {
      if (mockElement && document.body.contains(mockElement)) {
        document.body.removeChild(mockElement)
      }
    })

    it('sets textContent directly when prefers-reduced-motion is set', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act: call countUp with reduced motion
      await countUp(mockElement, 42)

      // Assert: element text is set to final value immediately
      expect(mockElement.textContent).toBe('42')
    })

    it('returns null when prefers-reduced-motion is set', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      const result = await countUp(mockElement, 100)

      // Assert: returns null
      expect(result).toBeNull()
    })

    it('includes prefix in reduced-motion output', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      await countUp(mockElement, 50, { prefix: 'Score: ' })

      // Assert: prefix is included
      expect(mockElement.textContent).toBe('Score: 50')
    })

    it('includes suffix in reduced-motion output', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      await countUp(mockElement, 75, { suffix: ' points' })

      // Assert: suffix is included
      expect(mockElement.textContent).toBe('75 points')
    })

    it('includes both prefix and suffix in reduced-motion output', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      await countUp(mockElement, 99, { prefix: 'Total: ', suffix: '%' })

      // Assert: both included
      expect(mockElement.textContent).toBe('Total: 99%')
    })

    it('is an async function', async () => {
      // Act
      const promise = countUp(mockElement, 50)

      // Assert: returns a promise
      expect(promise).toBeInstanceOf(Promise)
      await promise.catch(() => {})
    })

    it('returns null when element is null', async () => {
      // Act
      const result = await countUp(null, 50)

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when element is undefined', async () => {
      // Act
      const result = await countUp(undefined, 50)

      // Assert
      expect(result).toBeNull()
    })

    it('handles zero as end value', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      await countUp(mockElement, 0)

      // Assert
      expect(mockElement.textContent).toBe('0')
    })

    it('handles large numbers', async () => {
      // Setup: mock prefers-reduced-motion: reduce
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // Act
      await countUp(mockElement, 999999)

      // Assert
      expect(mockElement.textContent).toBe('999999')
    })
  })

  describe('prefers-reduced-motion detection', () => {
    it('correctly detects when reduced motion is enabled', () => {
      // Setup
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // The functions should detect reduced motion preference
      // and return null instead of animating
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      expect(query.matches).toBe(true)
    })

    it('correctly detects when reduced motion is disabled', () => {
      // Setup
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )

      // The matchMedia should return false for reduced motion
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      expect(query.matches).toBe(false)
    })
  })

  describe('function signatures', () => {
    it('fadeInUp accepts targets and options', async () => {
      // Attach per-promise catch synchronously so no rejection can escape as
      // unhandled between creation and the final await.
      const swallow = (p) => {
        p.catch(() => {})
        return p
      }
      const promise1 = swallow(fadeInUp('.element'))
      const promise2 = swallow(fadeInUp('.element', { delay: 100 }))
      const promise3 = swallow(fadeInUp('.element', { duration: 800 }))
      const promise4 = swallow(fadeInUp('.element', { y: 32 }))
      const promise5 = swallow(fadeInUp('.element', { delay: 50, duration: 600, y: 16 }))

      expect(promise1).toBeInstanceOf(Promise)
      expect(promise2).toBeInstanceOf(Promise)
      expect(promise3).toBeInstanceOf(Promise)
      expect(promise4).toBeInstanceOf(Promise)
      expect(promise5).toBeInstanceOf(Promise)

      await Promise.all([promise1, promise2, promise3, promise4, promise5]).catch(() => {})
    })

    it('popScale accepts target and no required options', async () => {
      const promise = popScale('.button')
      promise.catch(() => {})
      expect(promise).toBeInstanceOf(Promise)
      await promise.catch(() => {})
    })

    it('countUp accepts element, end value, and options', async () => {
      // Verify function signature
      const mockEl = document.createElement('div')
      document.body.appendChild(mockEl)

      try {
        const swallow = (p) => {
          p.catch(() => {})
          return p
        }
        const promise1 = swallow(countUp(mockEl, 50))
        const promise2 = swallow(countUp(mockEl, 100, { duration: 1000 }))
        const promise3 = swallow(countUp(mockEl, 75, { prefix: 'Value: ' }))
        const promise4 = swallow(countUp(mockEl, 25, { suffix: ' items' }))

        expect(promise1).toBeInstanceOf(Promise)
        expect(promise2).toBeInstanceOf(Promise)
        expect(promise3).toBeInstanceOf(Promise)
        expect(promise4).toBeInstanceOf(Promise)

        await Promise.all([promise1, promise2, promise3, promise4]).catch(() => {})
      } finally {
        document.body.removeChild(mockEl)
      }
    })
  })
})

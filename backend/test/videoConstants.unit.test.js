import { describe, it, expect } from 'vitest'

const constants = await import('../src/modules/video/video.constants.js')

describe('video.constants.js', () => {
  describe('VIDEO_DURATION_LIMITS', () => {
    it('exports VIDEO_DURATION_LIMITS with all plan durations', () => {
      expect(constants.VIDEO_DURATION_LIMITS).toBeDefined()
      expect(typeof constants.VIDEO_DURATION_LIMITS).toBe('object')
    })

    it('matches the canonical PLANS spec in payments.constants — Free 30 / Donor 45 / Pro 60 / Admin 90 minutes', () => {
      // Earlier the file hardcoded a flat 600s for every tier, which
      // contradicted the pricing page (Free=30 min, Pro=60 min). The
      // pin keeps the two source files in sync and prevents a regression
      // where a future edit silently re-flattens the durations.
      expect(constants.VIDEO_DURATION_LIMITS).toMatchObject({
        free: 30 * 60,
        donor: 45 * 60,
        pro_monthly: 60 * 60,
        pro_yearly: 60 * 60,
        admin: 90 * 60,
      })
    })

    it('paid tiers must allow longer videos than free (no flattening regression)', () => {
      const free = constants.VIDEO_DURATION_LIMITS.free
      expect(constants.VIDEO_DURATION_LIMITS.donor).toBeGreaterThan(free)
      expect(constants.VIDEO_DURATION_LIMITS.pro_monthly).toBeGreaterThan(free)
      expect(constants.VIDEO_DURATION_LIMITS.pro_yearly).toBeGreaterThan(free)
      expect(constants.VIDEO_DURATION_LIMITS.admin).toBeGreaterThan(free)
    })

    it('all durations are positive integers', () => {
      Object.values(constants.VIDEO_DURATION_LIMITS).forEach((duration) => {
        expect(Number.isInteger(duration)).toBe(true)
        expect(duration).toBeGreaterThan(0)
      })
    })
  })

  describe('VIDEO_SIZE_LIMITS', () => {
    it('exports VIDEO_SIZE_LIMITS with all plan sizes', () => {
      expect(constants.VIDEO_SIZE_LIMITS).toBeDefined()
      expect(typeof constants.VIDEO_SIZE_LIMITS).toBe('object')
    })

    it('has size limits for free, pro_monthly, pro_yearly, donor, and admin plans', () => {
      expect(constants.VIDEO_SIZE_LIMITS.free).toBeDefined()
      expect(constants.VIDEO_SIZE_LIMITS.pro_monthly).toBeDefined()
      expect(constants.VIDEO_SIZE_LIMITS.pro_yearly).toBeDefined()
      expect(constants.VIDEO_SIZE_LIMITS.donor).toBeDefined()
      expect(constants.VIDEO_SIZE_LIMITS.admin).toBeDefined()
    })

    it('all size limits are positive integers', () => {
      Object.values(constants.VIDEO_SIZE_LIMITS).forEach((size) => {
        expect(Number.isInteger(size)).toBe(true)
        expect(size).toBeGreaterThan(0)
      })
    })

    it('pro plans have larger size limits than free', () => {
      expect(constants.VIDEO_SIZE_LIMITS.pro_monthly).toBeGreaterThan(
        constants.VIDEO_SIZE_LIMITS.free,
      )
      expect(constants.VIDEO_SIZE_LIMITS.pro_yearly).toBeGreaterThan(
        constants.VIDEO_SIZE_LIMITS.free,
      )
    })
  })

  describe('MAX_VIDEO_SIZE', () => {
    it('exports MAX_VIDEO_SIZE constant', () => {
      expect(constants.MAX_VIDEO_SIZE).toBeDefined()
      expect(constants.MAX_VIDEO_SIZE).toBe(524288000)
    })

    it('MAX_VIDEO_SIZE is 500MB', () => {
      expect(constants.MAX_VIDEO_SIZE).toBe(500 * 1024 * 1024)
    })

    it('is a positive integer', () => {
      expect(Number.isInteger(constants.MAX_VIDEO_SIZE)).toBe(true)
      expect(constants.MAX_VIDEO_SIZE).toBeGreaterThan(0)
    })
  })

  describe('MAX_VIDEO_DURATION', () => {
    // The fallback used by the upload + transcode path when the user's
    // plan is unknown / unauthenticated. It MUST match the free-tier
    // cap so an unauthenticated request gets the most-restrictive cap
    // by default (least privilege). Earlier this was hardcoded to 600s
    // even after the per-tier values were tier-differentiated; the
    // assertions below pin it to the free-tier value so the two can't
    // drift again.
    it('exports MAX_VIDEO_DURATION as the free-tier fallback', () => {
      expect(constants.MAX_VIDEO_DURATION).toBeDefined()
      expect(constants.MAX_VIDEO_DURATION).toBe(constants.VIDEO_DURATION_LIMITS.free)
    })

    it('matches the pricing-page Free claim of 30 minutes (1800 seconds)', () => {
      expect(constants.MAX_VIDEO_DURATION).toBe(30 * 60)
    })

    it('is a positive integer', () => {
      expect(Number.isInteger(constants.MAX_VIDEO_DURATION)).toBe(true)
      expect(constants.MAX_VIDEO_DURATION).toBeGreaterThan(0)
    })
  })

  describe('CHUNK_SIZE', () => {
    it('exports CHUNK_SIZE constant', () => {
      expect(constants.CHUNK_SIZE).toBeDefined()
      expect(constants.CHUNK_SIZE).toBe(2097152)
    })

    it('CHUNK_SIZE is 2MB', () => {
      expect(constants.CHUNK_SIZE).toBe(2 * 1024 * 1024)
    })

    it('is a positive integer', () => {
      expect(Number.isInteger(constants.CHUNK_SIZE)).toBe(true)
      expect(constants.CHUNK_SIZE).toBeGreaterThan(0)
    })
  })

  describe('MIN_CHUNK_SIZE', () => {
    it('exports MIN_CHUNK_SIZE constant', () => {
      expect(constants.MIN_CHUNK_SIZE).toBeDefined()
      expect(constants.MIN_CHUNK_SIZE).toBe(5242880)
    })

    it('MIN_CHUNK_SIZE is 5MB', () => {
      expect(constants.MIN_CHUNK_SIZE).toBe(5 * 1024 * 1024)
    })

    it('is larger than CHUNK_SIZE', () => {
      expect(constants.MIN_CHUNK_SIZE).toBeGreaterThan(constants.CHUNK_SIZE)
    })
  })

  describe('ALLOWED_VIDEO_MIMES', () => {
    it('exports ALLOWED_VIDEO_MIMES as a Set', () => {
      expect(constants.ALLOWED_VIDEO_MIMES).toBeDefined()
      expect(constants.ALLOWED_VIDEO_MIMES instanceof Set).toBe(true)
    })

    it('contains video/mp4', () => {
      expect(constants.ALLOWED_VIDEO_MIMES.has('video/mp4')).toBe(true)
    })

    it('contains video/webm', () => {
      expect(constants.ALLOWED_VIDEO_MIMES.has('video/webm')).toBe(true)
    })

    it('contains video/quicktime', () => {
      expect(constants.ALLOWED_VIDEO_MIMES.has('video/quicktime')).toBe(true)
    })

    it('contains at least 3 MIME types', () => {
      expect(constants.ALLOWED_VIDEO_MIMES.size).toBeGreaterThanOrEqual(3)
    })
  })

  describe('ALLOWED_VIDEO_EXTENSIONS', () => {
    it('exports ALLOWED_VIDEO_EXTENSIONS as a Set', () => {
      expect(constants.ALLOWED_VIDEO_EXTENSIONS).toBeDefined()
      expect(constants.ALLOWED_VIDEO_EXTENSIONS instanceof Set).toBe(true)
    })

    it('contains .mp4', () => {
      expect(constants.ALLOWED_VIDEO_EXTENSIONS.has('.mp4')).toBe(true)
    })

    it('contains .webm', () => {
      expect(constants.ALLOWED_VIDEO_EXTENSIONS.has('.webm')).toBe(true)
    })

    it('contains .mov', () => {
      expect(constants.ALLOWED_VIDEO_EXTENSIONS.has('.mov')).toBe(true)
    })

    it('all extensions start with a dot', () => {
      for (const ext of constants.ALLOWED_VIDEO_EXTENSIONS) {
        expect(ext.startsWith('.')).toBe(true)
      }
    })
  })

  describe('VIDEO_SIGNATURES', () => {
    it('exports VIDEO_SIGNATURES as an array', () => {
      expect(constants.VIDEO_SIGNATURES).toBeDefined()
      expect(Array.isArray(constants.VIDEO_SIGNATURES)).toBe(true)
    })

    it('contains at least one signature', () => {
      expect(constants.VIDEO_SIGNATURES.length).toBeGreaterThan(0)
    })

    it('each signature has mime, bytes, and offset', () => {
      for (const sig of constants.VIDEO_SIGNATURES) {
        expect(sig.mime).toBeDefined()
        expect(sig.bytes).toBeDefined()
        expect(Array.isArray(sig.bytes)).toBe(true)
        expect(typeof sig.offset).toBe('number')
      }
    })
  })

  describe('TRANSCODE_PRESETS', () => {
    it('exports TRANSCODE_PRESETS as an object', () => {
      expect(constants.TRANSCODE_PRESETS).toBeDefined()
      expect(typeof constants.TRANSCODE_PRESETS).toBe('object')
    })

    it('contains 360p preset', () => {
      expect(constants.TRANSCODE_PRESETS['360p']).toBeDefined()
    })

    it('contains 720p preset', () => {
      expect(constants.TRANSCODE_PRESETS['720p']).toBeDefined()
    })

    it('contains 1080p preset', () => {
      expect(constants.TRANSCODE_PRESETS['1080p']).toBeDefined()
    })

    it('each preset has width and height', () => {
      Object.values(constants.TRANSCODE_PRESETS).forEach((preset) => {
        expect(preset.width).toBeDefined()
        expect(preset.height).toBeDefined()
        expect(Number.isInteger(preset.width)).toBe(true)
        expect(Number.isInteger(preset.height)).toBe(true)
        expect(preset.width).toBeGreaterThan(0)
        expect(preset.height).toBeGreaterThan(0)
      })
    })

    it('presets have increasing quality resolutions', () => {
      expect(constants.TRANSCODE_PRESETS['360p'].width).toBeLessThan(
        constants.TRANSCODE_PRESETS['720p'].width,
      )
      expect(constants.TRANSCODE_PRESETS['720p'].width).toBeLessThan(
        constants.TRANSCODE_PRESETS['1080p'].width,
      )
    })

    it('each preset may have bitrate information', () => {
      Object.values(constants.TRANSCODE_PRESETS).forEach((preset) => {
        if (preset.bitrate !== undefined) {
          expect(Number.isInteger(preset.bitrate)).toBe(true)
          expect(preset.bitrate).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('VIDEO_STATUS', () => {
    it('exports VIDEO_STATUS as an object', () => {
      expect(constants.VIDEO_STATUS).toBeDefined()
      expect(typeof constants.VIDEO_STATUS).toBe('object')
    })

    it('contains PROCESSING status', () => {
      expect(constants.VIDEO_STATUS.PROCESSING).toBeDefined()
      expect(constants.VIDEO_STATUS.PROCESSING).toBe('processing')
    })

    it('contains READY status', () => {
      expect(constants.VIDEO_STATUS.READY).toBeDefined()
      expect(constants.VIDEO_STATUS.READY).toBe('ready')
    })

    it('contains FAILED status', () => {
      expect(constants.VIDEO_STATUS.FAILED).toBeDefined()
      expect(constants.VIDEO_STATUS.FAILED).toBe('failed')
    })

    it('all status values are strings', () => {
      Object.values(constants.VIDEO_STATUS).forEach((status) => {
        expect(typeof status).toBe('string')
      })
    })
  })

  describe('PLAYBACK_SPEEDS', () => {
    it('exports PLAYBACK_SPEEDS as an array', () => {
      expect(constants.PLAYBACK_SPEEDS).toBeDefined()
      expect(Array.isArray(constants.PLAYBACK_SPEEDS)).toBe(true)
    })

    it('contains at least 6 standard speeds', () => {
      expect(constants.PLAYBACK_SPEEDS.length).toBeGreaterThanOrEqual(6)
    })

    it('contains 0.5x speed', () => {
      expect(constants.PLAYBACK_SPEEDS).toContain(0.5)
    })

    it('contains 1x speed (normal)', () => {
      expect(constants.PLAYBACK_SPEEDS).toContain(1)
    })

    it('contains 1.5x speed', () => {
      expect(constants.PLAYBACK_SPEEDS).toContain(1.5)
    })

    it('contains 2x speed', () => {
      expect(constants.PLAYBACK_SPEEDS).toContain(2)
    })

    it('all speeds are positive numbers', () => {
      for (const speed of constants.PLAYBACK_SPEEDS) {
        expect(typeof speed).toBe('number')
        expect(speed).toBeGreaterThan(0)
      }
    })

    it('speeds are in ascending order', () => {
      for (let i = 1; i < constants.PLAYBACK_SPEEDS.length; i++) {
        expect(constants.PLAYBACK_SPEEDS[i]).toBeGreaterThan(constants.PLAYBACK_SPEEDS[i - 1])
      }
    })
  })

  describe('ALLOWED_CAPTION_MIMES', () => {
    it('exports ALLOWED_CAPTION_MIMES', () => {
      expect(constants.ALLOWED_CAPTION_MIMES).toBeDefined()
    })

    it('is a Set or array-like structure', () => {
      expect(
        constants.ALLOWED_CAPTION_MIMES instanceof Set ||
          Array.isArray(constants.ALLOWED_CAPTION_MIMES) ||
          typeof constants.ALLOWED_CAPTION_MIMES === 'object',
      ).toBe(true)
    })
  })

  describe('ALLOWED_CAPTION_EXTENSIONS', () => {
    it('exports ALLOWED_CAPTION_EXTENSIONS', () => {
      expect(constants.ALLOWED_CAPTION_EXTENSIONS).toBeDefined()
    })

    it('is a Set or array-like structure', () => {
      expect(
        constants.ALLOWED_CAPTION_EXTENSIONS instanceof Set ||
          Array.isArray(constants.ALLOWED_CAPTION_EXTENSIONS) ||
          typeof constants.ALLOWED_CAPTION_EXTENSIONS === 'object',
      ).toBe(true)
    })
  })

  describe('MAX_CAPTION_LANGUAGES', () => {
    it('exports MAX_CAPTION_LANGUAGES', () => {
      expect(constants.MAX_CAPTION_LANGUAGES).toBeDefined()
      expect(Number.isInteger(constants.MAX_CAPTION_LANGUAGES)).toBe(true)
      expect(constants.MAX_CAPTION_LANGUAGES).toBeGreaterThan(0)
    })
  })
})

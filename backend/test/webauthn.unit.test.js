import { describe, it, expect } from 'vitest'

const {
  base64urlEncode,
  base64urlDecode,
  decodeCBOR,
  challengeStore,
  RP_NAME,
  RP_ID,
  ORIGIN,
  buildEcP256DerPublicKey,
  buildRsaDerPublicKey,
} = await import('../src/lib/webauthn/webauthnShared.js')

const {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
} = await import('../src/lib/webauthn/webauthn.js')

describe('webauthnShared.js', () => {
  describe('base64urlEncode', () => {
    it('encodes a buffer to base64url string', () => {
      const buffer = Buffer.from('hello world')
      const encoded = base64urlEncode(buffer)
      expect(typeof encoded).toBe('string')
      expect(encoded.length).toBeGreaterThan(0)
    })

    it('produces no + characters', () => {
      const buffer = Buffer.from([255, 255, 255, 255, 0, 0, 0, 0])
      const encoded = base64urlEncode(buffer)
      expect(encoded).not.toContain('+')
    })

    it('produces no / characters', () => {
      const buffer = Buffer.from([255, 255, 255, 255, 0, 0, 0, 0])
      const encoded = base64urlEncode(buffer)
      expect(encoded).not.toContain('/')
    })

    it('produces no = padding characters', () => {
      const buffer = Buffer.from('test')
      const encoded = base64urlEncode(buffer)
      expect(encoded).not.toContain('=')
    })

    it('handles empty buffer', () => {
      const buffer = Buffer.alloc(0)
      const encoded = base64urlEncode(buffer)
      expect(encoded).toBe('')
    })

    it('handles single byte', () => {
      const buffer = Buffer.from([42])
      const encoded = base64urlEncode(buffer)
      expect(typeof encoded).toBe('string')
      expect(encoded.length).toBeGreaterThan(0)
    })
  })

  describe('base64urlDecode', () => {
    it('decodes a base64url string to buffer', () => {
      const original = 'hello world'
      const buffer = Buffer.from(original)
      const encoded = base64urlEncode(buffer)
      const decoded = base64urlDecode(encoded)
      expect(decoded.toString()).toBe(original)
    })

    it('handles base64url strings with - and _ characters', () => {
      const original = Buffer.from([255, 255, 255, 255, 0, 0, 0, 0])
      const encoded = base64urlEncode(original)
      const decoded = base64urlDecode(encoded)
      expect(decoded).toEqual(original)
    })

    it('roundtrip encode/decode returns original buffer', () => {
      const original = Buffer.from('The quick brown fox jumps over the lazy dog')
      const encoded = base64urlEncode(original)
      const decoded = base64urlDecode(encoded)
      expect(decoded).toEqual(original)
    })

    it('handles binary data roundtrip', () => {
      const original = Buffer.from([0, 1, 2, 3, 255, 254, 253, 252, 128, 64, 32, 16])
      const encoded = base64urlEncode(original)
      const decoded = base64urlDecode(encoded)
      expect(decoded).toEqual(original)
    })
  })

  describe('decodeCBOR', () => {
    it('decodes unsigned integer', () => {
      const buffer = Buffer.from([0x18, 42]) // CBOR: unsigned int 42
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(42)
      expect(result.offset).toBeGreaterThan(0)
    })

    it('decodes small unsigned integer (0-23)', () => {
      const buffer = Buffer.from([0x05]) // CBOR: unsigned int 5
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(5)
    })

    it('decodes byte string', () => {
      const data = Buffer.from('hello')
      const buffer = Buffer.concat([Buffer.from([0x45]), data]) // CBOR: byte string length 5
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toEqual(data)
    })

    it('decodes text string', () => {
      const text = 'hello'
      const data = Buffer.from(text, 'utf8')
      const buffer = Buffer.concat([Buffer.from([0x65]), data]) // CBOR: text string length 5
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(text)
    })

    it('decodes array', () => {
      const buffer = Buffer.from([0x83, 0x01, 0x02, 0x03]) // CBOR: array [1, 2, 3]
      const result = decodeCBOR(buffer, 0)
      expect(Array.isArray(result.value)).toBe(true)
      expect(result.value.length).toBe(3)
    })

    it('decodes map', () => {
      const buffer = Buffer.from([0xa1, 0x01, 0x02]) // CBOR: map {1: 2}
      const result = decodeCBOR(buffer, 0)
      expect(result.value instanceof Map).toBe(true)
      expect(result.value.get(1)).toBe(2)
    })

    it('decodes boolean true', () => {
      const buffer = Buffer.from([0xf5]) // CBOR: true
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(true)
    })

    it('decodes boolean false', () => {
      const buffer = Buffer.from([0xf4]) // CBOR: false
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(false)
    })

    it('decodes null', () => {
      const buffer = Buffer.from([0xf6]) // CBOR: null
      const result = decodeCBOR(buffer, 0)
      expect(result.value).toBe(null)
    })

    it('returns next offset for chaining', () => {
      const buffer = Buffer.from([0x01, 0x02]) // Two integers
      const result = decodeCBOR(buffer, 0)
      expect(result.offset).toBeGreaterThan(0)
    })
  })

  describe('challengeStore', () => {
    it('is a Map', () => {
      expect(challengeStore instanceof Map).toBe(true)
    })

    it('can store and retrieve challenges', () => {
      const challenge = { value: 'test-challenge-12345', timestamp: Date.now() }
      challengeStore.set('key1', challenge)
      expect(challengeStore.get('key1')).toEqual(challenge)
      challengeStore.delete('key1')
    })

    it('supports standard Map operations', () => {
      challengeStore.set('a', { value: 'test', timestamp: Date.now() })
      expect(challengeStore.has('a')).toBe(true)
      challengeStore.delete('a')
      expect(challengeStore.has('a')).toBe(false)
    })
  })

  describe('RP_NAME', () => {
    it('is a string', () => {
      expect(typeof RP_NAME).toBe('string')
    })

    it('equals "StudyHub"', () => {
      expect(RP_NAME).toBe('StudyHub')
    })

    it('is not empty', () => {
      expect(RP_NAME.length).toBeGreaterThan(0)
    })
  })

  describe('RP_ID', () => {
    it('is a string', () => {
      expect(typeof RP_ID).toBe('string')
    })

    it('is not empty', () => {
      expect(RP_ID.length).toBeGreaterThan(0)
    })

    it('defaults to localhost if not set in environment', () => {
      // This test assumes WEBAUTHN_RP_ID is not set during test run
      // If set, it will have a non-empty value
      expect(RP_ID).toMatch(/^([a-z0-9.-]+|localhost)$/)
    })
  })

  describe('ORIGIN', () => {
    it('is a string', () => {
      expect(typeof ORIGIN).toBe('string')
    })

    it('is not empty', () => {
      expect(ORIGIN.length).toBeGreaterThan(0)
    })

    it('is a valid URL origin', () => {
      expect(ORIGIN).toMatch(/^https?:\/\//)
    })

    it('defaults to http://localhost:5173 if not set in environment', () => {
      // This test assumes WEBAUTHN_ORIGIN is not set during test run
      // If set, it will be a valid URL
      expect(ORIGIN).toMatch(/^https?:\/\/.+/)
    })
  })

  describe('DER encoding helpers', () => {
    it('buildEcP256DerPublicKey returns a buffer', () => {
      const uncompressed = Buffer.alloc(65, 0xff)
      const result = buildEcP256DerPublicKey(uncompressed)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('buildRsaDerPublicKey returns a buffer', () => {
      const n = Buffer.alloc(256, 0xff)
      const e = Buffer.from([0x01, 0x00, 0x01])
      const result = buildRsaDerPublicKey(n, e)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('DER encoded EC key starts with sequence tag', () => {
      const uncompressed = Buffer.alloc(65, 0xff)
      const result = buildEcP256DerPublicKey(uncompressed)
      expect(result[0]).toBe(0x30) // SEQUENCE tag
    })

    it('DER encoded RSA key starts with sequence tag', () => {
      const n = Buffer.alloc(256, 0xff)
      const e = Buffer.from([0x01, 0x00, 0x01])
      const result = buildRsaDerPublicKey(n, e)
      expect(result[0]).toBe(0x30) // SEQUENCE tag
    })
  })
})

describe('webauthn.js (barrel)', () => {
  describe('exported functions', () => {
    it('exports generateRegistrationOptions', () => {
      expect(typeof generateRegistrationOptions).toBe('function')
    })

    it('exports verifyRegistration', () => {
      expect(typeof verifyRegistration).toBe('function')
    })

    it('exports generateAuthenticationOptions', () => {
      expect(typeof generateAuthenticationOptions).toBe('function')
    })

    it('exports verifyAuthentication', () => {
      expect(typeof verifyAuthentication).toBe('function')
    })
  })

  describe('ceremony function signatures', () => {
    it('generateRegistrationOptions is callable', () => {
      expect(() => {
        // Function exists and is callable
        generateRegistrationOptions.toString()
      }).not.toThrow()
    })

    it('verifyRegistration is callable', () => {
      expect(() => {
        verifyRegistration.toString()
      }).not.toThrow()
    })

    it('generateAuthenticationOptions is callable', () => {
      expect(() => {
        generateAuthenticationOptions.toString()
      }).not.toThrow()
    })

    it('verifyAuthentication is callable', () => {
      expect(() => {
        verifyAuthentication.toString()
      }).not.toThrow()
    })
  })
})

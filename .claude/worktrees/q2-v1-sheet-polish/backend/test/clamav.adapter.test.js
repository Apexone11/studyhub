import { describe, expect, it } from 'vitest'
import { parseClamAvReply } from '../src/lib/clamav'

describe('clamav adapter parser', () => {
  it('parses clean response', () => {
    const parsed = parseClamAvReply('stream: OK')
    expect(parsed.status).toBe('clean')
    expect(parsed.isClean).toBe(true)
  })

  it('parses infected response', () => {
    const parsed = parseClamAvReply('stream: Eicar-Test-Signature FOUND')
    expect(parsed.status).toBe('infected')
    expect(parsed.isClean).toBe(false)
    expect(parsed.threat).toMatch(/Eicar/i)
  })

  it('handles malformed scanner response as error', () => {
    const parsed = parseClamAvReply('')
    expect(parsed.status).toBe('error')
    expect(parsed.isClean).toBe(false)
  })
})
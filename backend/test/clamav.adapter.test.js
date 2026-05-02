import net from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseClamAvReply, scanBufferWithClamAv } from '../src/lib/clamav'

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

describe('clamav INSTREAM wire protocol', () => {
  // Regression guard for the May 2026 production fix:
  // clamd 1.x+ rejects bare INSTREAM with "UNKNOWN COMMAND". Streaming commands
  // must use the `z` (NUL-terminated) or `n` (newline-terminated) prefix.
  let server
  let port
  let originalDisabled
  let originalNodeEnv
  let receivedFirstChunk

  beforeEach(async () => {
    originalDisabled = process.env.CLAMAV_DISABLED
    originalNodeEnv = process.env.NODE_ENV
    process.env.CLAMAV_DISABLED = 'false'
    process.env.NODE_ENV = 'production'
    receivedFirstChunk = null

    server = net.createServer((socket) => {
      socket.once('data', (data) => {
        receivedFirstChunk = Buffer.from(data)
        socket.write('stream: OK\n')
        socket.end()
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = server.address().port
  })

  afterEach(async () => {
    if (originalDisabled === undefined) delete process.env.CLAMAV_DISABLED
    else process.env.CLAMAV_DISABLED = originalDisabled
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    await new Promise((resolve) => server.close(resolve))
  })

  it('prefixes the streaming command with z to satisfy clamd 1.x', async () => {
    await scanBufferWithClamAv(Buffer.from('hello world', 'utf8'), {
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
    })

    expect(receivedFirstChunk).not.toBeNull()
    const expectedOpener = Buffer.concat([Buffer.from('zINSTREAM'), Buffer.from([0])])
    const opener = receivedFirstChunk.subarray(0, 10)
    expect(opener.equals(expectedOpener)).toBe(true)
  })
})

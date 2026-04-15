import { describe, it, expect } from 'vitest'
import { ChunkBuffer } from '../src/modules/notes/notes.chunks.js'

const U = 1

describe('notes.chunks.ChunkBuffer', () => {
  it('assembles ordered chunks in sequence', () => {
    const buf = new ChunkBuffer()
    expect(buf.append(U, 's1', 0, 3, 'hello ')).toEqual({ complete: false })
    expect(buf.append(U, 's1', 1, 3, 'there ')).toEqual({ complete: false })
    const final = buf.append(U, 's1', 2, 3, 'world')
    expect(final.complete).toBe(true)
    expect(final.content).toBe('hello there world')
  })

  it('rejects out-of-order chunk', () => {
    const buf = new ChunkBuffer()
    buf.append(U, 's2', 0, 3, 'a')
    expect(() => buf.append(U, 's2', 2, 3, 'c')).toThrow(/out of order/i)
  })

  it('rejects non-zero first chunk', () => {
    const buf = new ChunkBuffer()
    expect(() => buf.append(U, 'snew', 1, 3, 'x')).toThrow(/out of order/i)
  })

  it('rejects chunkCount mismatch', () => {
    const buf = new ChunkBuffer()
    buf.append(U, 's4', 0, 3, 'a')
    expect(() => buf.append(U, 's4', 1, 4, 'b')).toThrow(/chunkCount/i)
  })

  it('expires stale sessions after TTL', async () => {
    const buf = new ChunkBuffer({ ttlMs: 10 })
    buf.append(U, 's3', 0, 2, 'a')
    await new Promise((r) => setTimeout(r, 30))
    buf.sweep()
    expect(() => buf.append(U, 's3', 1, 2, 'b')).toThrow(/out of order|expired/i)
  })

  it('clears completed session so saveId can be reused after a restart', () => {
    const buf = new ChunkBuffer()
    const final = buf.append(U, 'reuse', 0, 1, 'whole')
    expect(final.complete).toBe(true)
    // After completion, the next append with same saveId starts fresh:
    const next = buf.append(U, 'reuse', 0, 1, 'again')
    expect(next.complete).toBe(true)
    expect(next.content).toBe('again')
  })
})

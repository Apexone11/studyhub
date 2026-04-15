class ChunkBuffer {
  constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
    this.sessions = new Map()
    this.ttlMs = ttlMs
  }

  append(saveId, chunkIndex, chunkCount, chunk) {
    const now = Date.now()
    let sess = this.sessions.get(saveId)
    if (!sess) {
      if (chunkIndex !== 0) throw new Error('chunk out of order')
      sess = { parts: [], expected: chunkCount, updatedAt: now }
      this.sessions.set(saveId, sess)
    }
    if (chunkIndex !== sess.parts.length) throw new Error('chunk out of order')
    if (chunkCount !== sess.expected) throw new Error('chunkCount mismatch')
    sess.parts.push(chunk)
    sess.updatedAt = now
    if (sess.parts.length === sess.expected) {
      const content = sess.parts.join('')
      this.sessions.delete(saveId)
      return { complete: true, content }
    }
    return { complete: false }
  }

  sweep() {
    const now = Date.now()
    for (const [id, sess] of this.sessions) {
      if (now - sess.updatedAt > this.ttlMs) this.sessions.delete(id)
    }
  }
}

const defaultChunkBuffer = new ChunkBuffer()
const sweeper = setInterval(() => defaultChunkBuffer.sweep(), 60 * 1000)
if (sweeper.unref) sweeper.unref()

module.exports = { ChunkBuffer, defaultChunkBuffer }

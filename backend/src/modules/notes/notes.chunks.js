class ChunkBuffer {
  constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
    this.sessions = new Map()
    this.ttlMs = ttlMs
  }

  // Append a chunk to the buffer. The internal key namespaces by userId to
  // prevent cross-user saveId collision (malicious or accidental). Two
  // different users sending the same saveId get isolated buffers.
  append(userId, saveId, chunkIndex, chunkCount, chunk) {
    const now = Date.now()
    const key = `${userId}:${saveId}`
    let sess = this.sessions.get(key)
    if (!sess) {
      if (chunkIndex !== 0) throw new Error('chunk out of order')
      sess = { parts: [], expected: chunkCount, updatedAt: now }
      this.sessions.set(key, sess)
    }
    if (chunkIndex !== sess.parts.length) throw new Error('chunk out of order')
    if (chunkCount !== sess.expected) throw new Error('chunkCount mismatch')
    sess.parts.push(chunk)
    sess.updatedAt = now
    if (sess.parts.length === sess.expected) {
      const content = sess.parts.join('')
      this.sessions.delete(key)
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

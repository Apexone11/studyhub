const net = require('node:net')

const DEFAULT_CLAMAV_HOST = process.env.CLAMAV_HOST || 'clamav'
const DEFAULT_CLAMAV_PORT = Number.parseInt(process.env.CLAMAV_PORT || '3310', 10)
const DEFAULT_CLAMAV_TIMEOUT_MS = Number.parseInt(process.env.CLAMAV_TIMEOUT_MS || '12000', 10)

function parseClamAvReply(replyText) {
  const message = String(replyText || '').trim()
  if (!message) {
    return {
      status: 'error',
      isClean: false,
      threat: null,
      message: 'Empty scanner response.',
    }
  }

  if (message.endsWith('OK')) {
    return {
      status: 'clean',
      isClean: true,
      threat: null,
      message,
    }
  }

  const foundIndex = message.lastIndexOf(' FOUND')
  if (foundIndex > 0) {
    const prefix = message.slice(0, foundIndex)
    const colonIndex = prefix.indexOf(':')
    const threat = (colonIndex >= 0 ? prefix.slice(colonIndex + 1) : prefix).trim() || 'Unknown threat'
    return {
      status: 'infected',
      isClean: false,
      threat,
      message,
    }
  }

  return {
    status: 'error',
    isClean: false,
    threat: null,
    message,
  }
}

function scanBufferWithClamAv(buffer, options = {}) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8')

  if (process.env.NODE_ENV === 'test' || String(process.env.CLAMAV_DISABLED || '').toLowerCase() === 'true') {
    return Promise.resolve({
      status: 'clean',
      isClean: true,
      threat: null,
      message: 'Scanner disabled for this environment.',
      engine: 'disabled',
    })
  }

  const host = options.host || DEFAULT_CLAMAV_HOST
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_CLAMAV_PORT
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : DEFAULT_CLAMAV_TIMEOUT_MS

  return new Promise((resolve) => {
    let settled = false
    let response = ''

    const socket = net.createConnection({ host, port }, () => {
      const streamCommand = Buffer.from('INSTREAM\0')
      socket.write(streamCommand)

      const chunkSize = 64 * 1024
      for (let offset = 0; offset < content.length; offset += chunkSize) {
        const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.length))
        const lengthBuffer = Buffer.alloc(4)
        lengthBuffer.writeUInt32BE(chunk.length, 0)
        socket.write(lengthBuffer)
        socket.write(chunk)
      }

      const endBuffer = Buffer.alloc(4)
      endBuffer.writeUInt32BE(0, 0)
      socket.write(endBuffer)
    })

    function finalize(result) {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (response.includes('\u0000') || response.includes('\n')) {
        const parsed = parseClamAvReply(response.split('\0').join('').trim())
        finalize({
          ...parsed,
          engine: 'clamav',
        })
      }
    })

    socket.on('timeout', () => {
      finalize({
        status: 'error',
        isClean: false,
        threat: null,
        message: `Scanner timeout after ${timeoutMs}ms.`,
        engine: 'clamav',
      })
    })

    socket.on('error', (error) => {
      finalize({
        status: 'error',
        isClean: false,
        threat: null,
        message: `Scanner unavailable: ${error.message}`,
        engine: 'clamav',
      })
    })

    socket.on('end', () => {
      if (!settled) {
        const parsed = parseClamAvReply(response.split('\0').join('').trim())
        finalize({
          ...parsed,
          engine: 'clamav',
        })
      }
    })
  })
}

module.exports = {
  parseClamAvReply,
  scanBufferWithClamAv,
}

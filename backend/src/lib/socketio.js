/**
 * socketio.js — Real-time messaging via Socket.io
 *
 * Configures a Socket.io server with:
 * - JWT auth from HTTP-only cookies
 * - Online user tracking
 * - Typing indicators
 * - Read receipts
 * - Conversation room management
 */

const socketIo = require('socket.io')
const { verifyAuthToken } = require('./authTokens')
const prisma = require('./prisma')
const { captureError } = require('../monitoring/sentry')

let io = null
const onlineUsers = new Map() // userId -> Set<socketId>

// Simple per-socket rate limiter for high-frequency events
const socketRateLimits = new Map() // socketId -> { event: { count, resetAt } }

function isSocketRateLimited(socketId, event, maxPerMinute = 30) {
  const key = `${socketId}:${event}`
  const now = Date.now()
  const entry = socketRateLimits.get(key)

  if (!entry || now > entry.resetAt) {
    socketRateLimits.set(key, { count: 1, resetAt: now + 60000 })
    return false
  }

  entry.count++
  if (entry.count > maxPerMinute) {
    return true
  }
  return false
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of socketRateLimits) {
    if (now > entry.resetAt) socketRateLimits.delete(key)
  }
}, 5 * 60 * 1000)

function initSocketIO(httpServer) {
  const isProd = process.env.NODE_ENV === 'production'
  const allowedOrigins = isProd
    ? [
        process.env.FRONTEND_URL,
        process.env.FRONTEND_URL_ALT,
      ].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:4173']

  io = new socketIo.Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  })

  // Auth middleware: extract JWT from cookie header
  io.use((socket, next) => {
    try {
      // Parse cookie header manually for studyhub_session
      const cookieHeader = socket.handshake.headers.cookie || ''
      const cookies = parseCookies(cookieHeader)
      const token = cookies.studyhub_session || null

      if (!token) {
        return next(new Error('Auth required'))
      }

      const decoded = verifyAuthToken(token)
      socket.userId = decoded.sub
      socket.username = null // Will be populated after DB lookup

      next()
    } catch (err) {
      captureError(err, { source: 'socketio-auth', socketId: socket.id })
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket) => {
    try {
      // Fetch user details from DB
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { id: true, username: true },
      })

      if (!user) {
        socket.disconnect(true)
        return
      }

      socket.username = user.username

      // Track online user
      if (!onlineUsers.has(socket.userId)) {
        onlineUsers.set(socket.userId, new Set())
      }
      onlineUsers.get(socket.userId).add(socket.id)

      // Join personal room for private delivery
      socket.join(`user:${socket.userId}`)

      // Join any active conversation rooms (user's conversations)
      const conversations = await prisma.conversationParticipant.findMany({
        where: { userId: socket.userId },
        select: { conversationId: true },
      })

      for (const { conversationId } of conversations) {
        socket.join(`conversation:${conversationId}`)
      }

      // Join active study group rooms
      try {
        const groupMemberships = await prisma.studyGroupMember.findMany({
          where: { userId: socket.userId, status: 'active' },
          select: { groupId: true },
        })
        for (const { groupId } of groupMemberships) {
          socket.join(`studygroup:${groupId}`)
        }
      } catch { /* graceful degradation if table missing */ }

      // Notify only conversation and group participants that this user is online
      // (previously broadcast to all connected users — privacy leak)
      for (const { conversationId } of conversations) {
        io.to(`conversation:${conversationId}`).emit('user:online', { userId: socket.userId, username: socket.username })
      }

      // Handle typing indicators (rate limited: max 20 per minute)
      // Validates room membership before broadcasting to prevent unauthorized emission.
      socket.on('typing:start', async (data) => {
        const { conversationId } = data
        if (!conversationId) return
        if (isSocketRateLimited(socket.id, 'typing', 20)) return

        // Verify user is a participant before broadcasting
        try {
          const participant = await prisma.conversationParticipant.findUnique({
            where: { conversationId_userId: { conversationId, userId: socket.userId } },
          })
          if (!participant) return
        } catch { return }

        io.to(`conversation:${conversationId}`).emit('typing:start', {
          userId: socket.userId,
          username: socket.username,
          conversationId,
        })
      })

      socket.on('typing:stop', async (data) => {
        const { conversationId } = data
        if (!conversationId) return
        if (isSocketRateLimited(socket.id, 'typing', 20)) return

        // Verify user is a participant before broadcasting
        try {
          const participant = await prisma.conversationParticipant.findUnique({
            where: { conversationId_userId: { conversationId, userId: socket.userId } },
          })
          if (!participant) return
        } catch { return }

        io.to(`conversation:${conversationId}`).emit('typing:stop', {
          userId: socket.userId,
          conversationId,
        })
      })

      // Handle read receipts
      socket.on('message:read', async (data) => {
        try {
          const { conversationId, messageId } = data
          if (!conversationId) return

          // Update lastReadAt for the conversation participant
          await prisma.conversationParticipant.update({
            where: {
              conversationId_userId: {
                conversationId,
                userId: socket.userId,
              },
            },
            data: { lastReadAt: new Date() },
          })

          // Broadcast read receipt to conversation
          io.to(`conversation:${conversationId}`).emit('message:read', {
            userId: socket.userId,
            conversationId,
            messageId,
            readAt: new Date().toISOString(),
          })
        } catch (err) {
          captureError(err, { source: 'socketio-message-read' })
        }
      })

      // Handle conversation join (rate limited: max 30 per minute)
      socket.on('conversation:join', async (data) => {
        try {
          const { conversationId } = data
          if (!conversationId) return
          if (isSocketRateLimited(socket.id, 'join', 30)) return

          // Verify user is a participant
          const participant = await prisma.conversationParticipant.findUnique({
            where: {
              conversationId_userId: {
                conversationId,
                userId: socket.userId,
              },
            },
          })

          if (!participant) return

          socket.join(`conversation:${conversationId}`)

          // Notify others in conversation
          io.to(`conversation:${conversationId}`).emit('user:joined', {
            userId: socket.userId,
            conversationId,
          })
        } catch (err) {
          captureError(err, { source: 'socketio-conversation-join' })
        }
      })

      // Handle conversation leave
      socket.on('conversation:leave', async (data) => {
        try {
          const { conversationId } = data
          if (!conversationId) return

          socket.leave(`conversation:${conversationId}`)

          // Notify others in conversation
          io.to(`conversation:${conversationId}`).emit('user:left', {
            userId: socket.userId,
            conversationId,
          })
        } catch (err) {
          captureError(err, { source: 'socketio-conversation-leave' })
        }
      })

      // Handle disconnect
      socket.on('disconnect', () => {
        const userSockets = onlineUsers.get(socket.userId)
        if (userSockets) {
          userSockets.delete(socket.id)
          if (userSockets.size === 0) {
            onlineUsers.delete(socket.userId)
            // Notify only rooms the user was in that they are offline
            for (const room of socket.rooms) {
              if (room !== socket.id) {
                io.to(room).emit('user:offline', { userId: socket.userId })
              }
            }
          }
        }

        // Clean up rate limit entries for this socket
        for (const key of socketRateLimits.keys()) {
          if (key.startsWith(`${socket.id}:`)) socketRateLimits.delete(key)
        }
      })
    } catch (err) {
      captureError(err, { source: 'socketio-connection', socketId: socket.id })
      socket.disconnect(true)
    }
  })

  return io
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocketIO first.')
  }
  return io
}

function getOnlineUsers() {
  return Array.from(onlineUsers.keys())
}

/**
 * Parse cookies from header string
 * @param {string} cookieHeader
 * @returns {object}
 */
function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf('=')
      if (separatorIndex === -1) return cookies

      const key = cookie.slice(0, separatorIndex).trim()
      const value = cookie.slice(separatorIndex + 1).trim()
      cookies[key] = decodeURIComponent(value)
      return cookies
    }, {})
}

module.exports = {
  initSocketIO,
  getIO,
  getOnlineUsers,
}

# Reference 13 — Socket.io Security

## Files to Read

- `backend/src/lib/socketio.js` — Socket.io server config, per-socket rate limiting
- `backend/src/lib/socketEvents.js` — canonical event name constants (backend)
- `frontend/studyhub-app/src/lib/useSocket.js` — socket connection
- `frontend/studyhub-app/src/lib/socketEvents.js` — canonical event name constants (frontend)
- `backend/src/modules/messaging/messaging.routes.js` — message handlers

---

## Check 13.1 — Socket Authentication via Cookie

**Rule per CLAUDE.md:** The Socket.io client MUST connect with `withCredentials: true` to send the `studyhub_session` cookie.

**Verify in `useSocket.js`:**

```js
// CORRECT
const socket = io(BACKEND_ORIGIN, {
  withCredentials: true,
  transports: ['websocket', 'polling'],
})
```

**Violation:** Without `withCredentials: true`, the session cookie is NOT sent → server cannot authenticate the socket → anonymous users can receive real-time events.

---

## Check 13.2 — Socket Authentication Middleware Server-Side

**Verify in `socketio.js`:** The Socket.io server has an authentication middleware that validates the session cookie before accepting the connection.

```js
// CORRECT
io.use(async (socket, next) => {
  try {
    const cookie = socket.request.headers.cookie
    const token = parseCookieToken(cookie, 'studyhub_session')
    const user = await verifyToken(token)
    if (!user) return next(new Error('Unauthorized'))
    socket.data.user = user
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
})
```

**Violation:** No auth middleware → any WebSocket client can connect and listen to all events → CRITICAL.

---

## Check 13.3 — Per-Socket Rate Limiting

**Rule per CLAUDE.md:** Per-socket rate limits:

- Typing events (`typing:start`, `typing:stop`): **20/min**
- Join events (`conversation:join`): **30/min**

**Verify in `socketio.js`:**

```js
// CORRECT
const typingLimiter = createSocketRateLimiter({ max: 20, windowMs: 60_000 })
socket.on('typing:start', typingLimiter(socket, async (data) => { ... }))
```

**Violation:** No per-socket rate limiting → bot floods typing events → DoS / spam.

---

## Check 13.4 — Event Name Constants Used (No Hardcoded Strings)

**Rule per CLAUDE.md:** All Socket.io event names MUST use constants from `socketEvents.js`. Hardcoded event strings cause silent failures (event fires but no listener matches).

**Verify both files define matching constants:**

- `backend/src/lib/socketEvents.js`
- `frontend/studyhub-app/src/lib/socketEvents.js`

**Canonical backend event names:**
| Constant | String Value |
|---|---|
| `MESSAGE_NEW` | `message:new` |
| `MESSAGE_EDIT` | `message:edit` |
| `MESSAGE_DELETE` | `message:delete` |
| `TYPING_START` | `typing:start` |
| `TYPING_STOP` | `typing:stop` |
| `CONVERSATION_JOIN` | `conversation:join` |
| `MESSAGE_READ` | `message:read` |
| `REACTION_ADD` | `reaction:add` |
| `REACTION_REMOVE` | `reaction:remove` |

**Common drift bugs (historical pattern #6):**

```js
// WRONG — wrong string
socket.on('message:edited', ...)   // should be 'message:edit'
socket.on('message:deleted', ...)  // should be 'message:delete'
socket.on('typing:update', ...)    // should be 'typing:start'/'typing:stop'
socket.on('message:room:join', ...) // should be 'conversation:join'
```

**Grep for raw string event names:**

```
socket\.on\(['"]message:\|socket\.emit\(['"]message:
```

Each match should reference the constant, not a literal string.

---

## Check 13.5 — Room Authorization on conversation:join

**Rule:** A user joining a conversation room must be verified as a participant of that conversation server-side.

**Verify:**

```js
// CORRECT
socket.on(CONVERSATION_JOIN, async ({ conversationId }) => {
  const participant = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: socket.data.user.userId },
  })
  if (!participant) return // silently deny — don't join unauthorized room
  socket.join(`conversation:${conversationId}`)
})
```

**Violation:** Any socket can join any room → receives all messages in that room → CRITICAL.

---

## Check 13.6 — Message Length Enforced on Socket Path

**Rule per CLAUDE.md:** Max message length = 5000 characters. This must be validated on the HTTP `POST /api/messages` endpoint AND on any socket message path.

```js
// CORRECT
if (data.content.length > MAX_MESSAGE_LENGTH) return // silently drop or send error event
```

---

## Severity Reference for Socket.io Issues

| Issue                                   | OWASP | Severity |
| --------------------------------------- | ----- | -------- |
| No socket auth middleware               | A01   | CRITICAL |
| Room join without participant check     | A01   | CRITICAL |
| `withCredentials: false` on client      | A01   | HIGH     |
| Hardcoded event strings (not constants) | A03   | MEDIUM   |
| No per-socket rate limiting             | A05   | MEDIUM   |
| No message length check on socket       | A03   | LOW      |

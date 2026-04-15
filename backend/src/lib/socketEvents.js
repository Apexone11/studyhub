/**
 * socketEvents.js -- Shared Socket.io event name constants.
 *
 * Use these constants instead of hardcoding event name strings to prevent
 * typo bugs and ensure consistency between backend and frontend.
 */

const SOCKET_EVENTS = {
  // Message events
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_READ: 'message:read',

  // Typing indicator events
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Conversation events
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',

  // Reaction events
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',

  // Poll events
  POLL_VOTE: 'poll:vote',
  POLL_CLOSE: 'poll:close',

  // User presence events
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  USER_JOINED: 'user:joined',
  USER_LEFT: 'user:left',

  // Study group discussion events
  GROUP_DISCUSSION_NEW: 'group:discussion:new',
  GROUP_DISCUSSION_REPLY: 'group:discussion:reply',

  // Account events (cross-device propagation)
  USER_ROLE_CHANGED: 'user:roleChanged',
}

module.exports = SOCKET_EVENTS

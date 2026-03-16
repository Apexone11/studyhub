/**
 * Creates an in-app notification. Silently skips if actor is recipient.
 */
async function createNotification(prisma, { userId, type, message, actorId, sheetId, linkPath }) {
  if (userId === actorId) return // never notify yourself
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        message,
        actorId: actorId || null,
        sheetId: sheetId || null,
        linkPath: linkPath || null,
      }
    })
  } catch (err) {
    // Non-fatal — log and continue
    console.error('createNotification error:', err.message)
  }
}

module.exports = { createNotification }

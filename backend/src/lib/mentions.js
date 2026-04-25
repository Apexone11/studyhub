const { createNotification } = require('./notify')

const MENTION_PATTERN = /(^|[\s(])@([a-zA-Z0-9_]{3,20})(?=$|[\s),.!?:;])/g

function extractMentionUsernames(text = '') {
  const usernames = new Set()
  MENTION_PATTERN.lastIndex = 0
  let match = MENTION_PATTERN.exec(text)

  while (match) {
    usernames.add(match[2].toLowerCase())
    match = MENTION_PATTERN.exec(text)
  }

  return [...usernames].slice(0, 10)
}

async function notifyMentionedUsers(
  prisma,
  { text, actorId, actorUsername, message, linkPath, excludeUserIds = [] },
) {
  const usernames = extractMentionUsernames(text)
  if (usernames.length === 0) return []

  const users = await prisma.user.findMany({
    where: {
      OR: usernames.map((username) => ({
        username: { equals: username, mode: 'insensitive' },
      })),
    },
    select: { id: true, username: true },
  })

  const excluded = new Set([actorId, ...excludeUserIds].filter(Boolean))

  await Promise.all(
    users
      .filter((user) => !excluded.has(user.id))
      .map((user) =>
        createNotification(prisma, {
          userId: user.id,
          type: 'mention',
          message: message || `${actorUsername} mentioned you.`,
          actorId,
          linkPath,
        }),
      ),
  )

  return users
}

module.exports = {
  extractMentionUsernames,
  notifyMentionedUsers,
}

require('dotenv').config()
const { sendEmailSmoke, validateEmailTransport } = require('../src/lib/email')

async function main() {
  const strict = String(process.env.EMAIL_STARTUP_STRICT || '').toLowerCase() === 'true'
  const result = await validateEmailTransport({ strict })

  if (!result.ok) {
    process.exitCode = 1
    return
  }

  const recipient = process.env.EMAIL_SMOKE_TO || undefined
  const delivery = await sendEmailSmoke(recipient)
  console.log(JSON.stringify({
    ok: true,
    recipient: recipient || 'ADMIN_EMAIL',
    messageId: delivery?.messageId || null,
    accepted: delivery?.accepted || [],
    rejected: delivery?.rejected || [],
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

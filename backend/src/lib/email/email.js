// Barrel re-export — preserves the original public API so existing
// require('./lib/email') and require('../../lib/email') calls keep working.

const { getAdminEmail, validateEmailTransport } = require('./emailTransport')
const {
  sendPasswordReset,
  sendEmailVerification,
  sendSubscriptionWelcome,
  sendDonationThankYou,
  sendPaymentReceipt,
  sendCourseRequestNotice,
  sendHighRiskSheetAlert,
  sendEmailSmoke,
} = require('./emailTemplates')

module.exports = {
  getAdminEmail,
  sendPasswordReset,
  sendEmailVerification,
  sendSubscriptionWelcome,
  sendDonationThankYou,
  sendPaymentReceipt,
  sendCourseRequestNotice,
  sendHighRiskSheetAlert,
  sendEmailSmoke,
  validateEmailTransport,
}

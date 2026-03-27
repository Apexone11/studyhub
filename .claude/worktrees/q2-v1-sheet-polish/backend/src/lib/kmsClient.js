const { KMSClient } = require('@aws-sdk/client-kms')

function getKmsClient() {
  const region = process.env.AWS_REGION || 'us-east-2'
  return new KMSClient({ region })
}

module.exports = { getKmsClient }

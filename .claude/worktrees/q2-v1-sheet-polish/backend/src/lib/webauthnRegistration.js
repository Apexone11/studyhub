/**
 * WebAuthn registration ceremony functions.
 */
const {
  crypto,
  RP_NAME,
  RP_ID,
  ORIGIN,
  challengeStore,
  base64urlEncode,
  base64urlDecode,
  decodeCBOR,
} = require('./webauthnShared')

function generateRegistrationOptions(user) {
  const challenge = crypto.randomBytes(32)
  const userId = Buffer.from(String(user.id))

  challengeStore.set(`reg_${user.id}`, {
    challenge: base64urlEncode(challenge),
    timestamp: Date.now(),
  })

  return {
    challenge: base64urlEncode(challenge),
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: base64urlEncode(userId),
      name: user.username,
      displayName: user.username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256 (ECDSA w/ SHA-256)
      { alg: -257, type: 'public-key' },  // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestation: 'none',
  }
}

function verifyRegistration(credential, userId) {
  // 1. Retrieve and validate the stored challenge
  const stored = challengeStore.get(`reg_${userId}`)
  if (!stored) {
    return { verified: false, error: 'No registration challenge found. Please restart.' }
  }
  challengeStore.delete(`reg_${userId}`)

  if (Date.now() - stored.timestamp > 120_000) {
    return { verified: false, error: 'Challenge expired. Please try again.' }
  }

  // 2. Parse clientDataJSON
  const clientDataJSON = base64urlDecode(credential.response.clientDataJSON)
  let clientData
  try {
    clientData = JSON.parse(clientDataJSON.toString('utf8'))
  } catch {
    return { verified: false, error: 'Invalid clientDataJSON.' }
  }

  if (clientData.type !== 'webauthn.create') {
    return { verified: false, error: 'Unexpected clientData type.' }
  }
  if (clientData.challenge !== stored.challenge) {
    return { verified: false, error: 'Challenge mismatch.' }
  }
  if (clientData.origin !== ORIGIN) {
    return { verified: false, error: `Origin mismatch: expected ${ORIGIN}, got ${clientData.origin}.` }
  }

  // 3. Parse attestationObject (CBOR)
  const attestationBuffer = base64urlDecode(credential.response.attestationObject)
  let attestation
  try {
    attestation = decodeCBOR(attestationBuffer).value
  } catch {
    return { verified: false, error: 'Invalid attestation object.' }
  }

  const authData = attestation.get('authData')
  if (!authData || authData.length < 37) {
    return { verified: false, error: 'Invalid authenticator data.' }
  }

  // 4. Verify RP ID hash
  const rpIdHash = authData.slice(0, 32)
  const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest()
  if (!rpIdHash.equals(expectedRpIdHash)) {
    return { verified: false, error: 'RP ID hash mismatch.' }
  }

  // 5. Check flags
  const flags = authData[32]
  const userPresent = (flags & 0x01) !== 0
  const attestedCredentialData = (flags & 0x40) !== 0
  const backedUp = (flags & 0x10) !== 0
  const deviceType = (flags & 0x08) !== 0 ? 'multiDevice' : 'singleDevice'

  if (!userPresent) {
    return { verified: false, error: 'User presence flag not set.' }
  }
  if (!attestedCredentialData) {
    return { verified: false, error: 'No attested credential data in registration.' }
  }

  // 6. Extract counter
  const counter = authData.readUInt32BE(33)

  // 7. Extract credential ID and public key from attested credential data
  const _aaguid = authData.slice(37, 53)
  const credIdLength = authData.readUInt16BE(53)
  const credentialId = authData.slice(55, 55 + credIdLength)
  const publicKeyCBOR = authData.slice(55 + credIdLength)

  // Parse COSE public key
  let _coseKey
  try {
    _coseKey = decodeCBOR(publicKeyCBOR).value
  } catch {
    return { verified: false, error: 'Failed to parse COSE public key.' }
  }

  return {
    verified: true,
    credentialId: base64urlEncode(credentialId),
    publicKey: publicKeyCBOR, // Store as raw CBOR bytes
    counter,
    deviceType,
    backedUp,
    transports: credential.transports || [],
  }
}

module.exports = {
  generateRegistrationOptions,
  verifyRegistration,
}

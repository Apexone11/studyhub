/**
 * WebAuthn authentication ceremony functions.
 */
const {
  crypto,
  RP_ID,
  ORIGIN,
  challengeStore,
  base64urlEncode,
  base64urlDecode,
  decodeCBOR,
  buildEcP256DerPublicKey,
  buildRsaDerPublicKey,
} = require('./webauthnShared')

function generateAuthenticationOptions(userId, credentials) {
  const challenge = crypto.randomBytes(32)

  challengeStore.set(`auth_${userId}`, {
    challenge: base64urlEncode(challenge),
    timestamp: Date.now(),
  })

  return {
    challenge: base64urlEncode(challenge),
    rpId: RP_ID,
    timeout: 60000,
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      type: 'public-key',
      transports: c.transports ? c.transports.split(',') : undefined,
    })),
    userVerification: 'preferred',
  }
}

function verifyAuthentication(credential, expectedCredential, userId) {
  // 1. Retrieve and validate the stored challenge
  const stored = challengeStore.get(`auth_${userId}`)
  if (!stored) {
    return { verified: false, error: 'No authentication challenge found. Please restart.' }
  }
  challengeStore.delete(`auth_${userId}`)

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

  if (clientData.type !== 'webauthn.get') {
    return { verified: false, error: 'Unexpected clientData type.' }
  }
  if (clientData.challenge !== stored.challenge) {
    return { verified: false, error: 'Challenge mismatch.' }
  }
  if (clientData.origin !== ORIGIN) {
    return {
      verified: false,
      error: `Origin mismatch: expected ${ORIGIN}, got ${clientData.origin}.`,
    }
  }

  // 3. Parse authenticatorData
  const authDataBuffer = base64urlDecode(credential.response.authenticatorData)
  if (authDataBuffer.length < 37) {
    return { verified: false, error: 'Invalid authenticator data.' }
  }

  // 4. Verify RP ID hash
  const rpIdHash = authDataBuffer.slice(0, 32)
  const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest()
  if (!rpIdHash.equals(expectedRpIdHash)) {
    return { verified: false, error: 'RP ID hash mismatch.' }
  }

  // 5. Check flags
  const flags = authDataBuffer[32]
  const userPresent = (flags & 0x01) !== 0
  if (!userPresent) {
    return { verified: false, error: 'User presence flag not set.' }
  }

  // 6. Check counter (must be greater than stored counter to prevent replay)
  const newCounter = authDataBuffer.readUInt32BE(33)
  if (expectedCredential.counter > 0 && newCounter <= expectedCredential.counter) {
    return { verified: false, error: 'Counter did not increase. Possible cloned authenticator.' }
  }

  // 7. Verify signature
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest()
  const signedData = Buffer.concat([authDataBuffer, clientDataHash])
  const signature = base64urlDecode(credential.response.signature)

  // Parse the stored COSE public key to get the algorithm and key parameters
  let coseKey
  try {
    coseKey = decodeCBOR(Buffer.from(expectedCredential.publicKey)).value
  } catch {
    return { verified: false, error: 'Failed to parse stored public key.' }
  }

  const alg = coseKey.get(3) // COSE algorithm identifier

  let verified = false

  if (alg === -7) {
    // ES256 — ECDSA with P-256 and SHA-256
    const x = coseKey.get(-2)
    const y = coseKey.get(-3)
    if (!x || !y) {
      return { verified: false, error: 'Invalid EC key: missing x or y coordinates.' }
    }

    // Build uncompressed EC point: 0x04 || x || y
    const publicKeyUncompressed = Buffer.concat([Buffer.from([0x04]), x, y])

    // Encode as SubjectPublicKeyInfo DER for P-256
    const ecPublicKeyDer = buildEcP256DerPublicKey(publicKeyUncompressed)
    const keyObject = crypto.createPublicKey({ key: ecPublicKeyDer, format: 'der', type: 'spki' })

    verified = crypto.createVerify('SHA256').update(signedData).verify(keyObject, signature)
  } else if (alg === -257) {
    // RS256 — RSASSA-PKCS1-v1_5 with SHA-256
    const n = coseKey.get(-1)
    const e = coseKey.get(-2)
    if (!n || !e) {
      return { verified: false, error: 'Invalid RSA key: missing n or e.' }
    }

    const rsaPublicKeyDer = buildRsaDerPublicKey(n, e)
    const keyObject = crypto.createPublicKey({ key: rsaPublicKeyDer, format: 'der', type: 'spki' })

    verified = crypto.createVerify('SHA256').update(signedData).verify(keyObject, signature)
  } else {
    return { verified: false, error: `Unsupported algorithm: ${alg}` }
  }

  if (!verified) {
    return { verified: false, error: 'Signature verification failed.' }
  }

  return { verified: true, newCounter }
}

module.exports = {
  generateAuthenticationOptions,
  verifyAuthentication,
}

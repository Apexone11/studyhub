/**
 * WebAuthn utilities for passkey registration and authentication.
 *
 * NOTE: This is a minimal implementation using built-in Node.js crypto and
 * manual CBOR/attestation parsing. For full FIDO2 compliance (attestation
 * statement verification, metadata service, Android SafetyNet, etc.), use
 * a library like @simplewebauthn/server. This implementation covers the
 * "none" attestation format which is sufficient for first-party passkeys.
 */
const crypto = require('node:crypto')

const RP_NAME = 'StudyHub'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173'

// In-memory challenge store. In production, use Redis or a database table.
const challengeStore = new Map()

// ── Base64url helpers ───────────────────────────────────────────────────

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  return Buffer.from(base64, 'base64')
}

// ── Minimal CBOR decoder (supports maps, byte strings, integers, text) ─

function decodeCBOR(buffer, offset = 0) {
  const major = (buffer[offset] >> 5) & 0x07
  const additional = buffer[offset] & 0x1f
  let value // eslint-disable-line no-unused-vars
  let nextOffset = offset + 1

  function readLength(additional, start) {
    if (additional < 24) return { length: additional, offset: start }
    if (additional === 24) return { length: buffer[start], offset: start + 1 }
    if (additional === 25) return { length: buffer.readUInt16BE(start), offset: start + 2 }
    if (additional === 26) return { length: buffer.readUInt32BE(start), offset: start + 4 }
    throw new Error('CBOR: unsupported length encoding')
  }

  if (major === 0) {
    // Unsigned integer
    const { length, offset: next } = readLength(additional, nextOffset)
    return { value: length, offset: next }
  }

  if (major === 1) {
    // Negative integer
    const { length, offset: next } = readLength(additional, nextOffset)
    return { value: -1 - length, offset: next }
  }

  if (major === 2) {
    // Byte string
    const { length, offset: dataStart } = readLength(additional, nextOffset)
    return { value: buffer.slice(dataStart, dataStart + length), offset: dataStart + length }
  }

  if (major === 3) {
    // Text string
    const { length, offset: dataStart } = readLength(additional, nextOffset)
    return { value: buffer.slice(dataStart, dataStart + length).toString('utf8'), offset: dataStart + length }
  }

  if (major === 4) {
    // Array
    const { length: count, offset: start } = readLength(additional, nextOffset)
    const arr = []
    let pos = start
    for (let i = 0; i < count; i++) {
      const result = decodeCBOR(buffer, pos)
      arr.push(result.value)
      pos = result.offset
    }
    return { value: arr, offset: pos }
  }

  if (major === 5) {
    // Map
    const { length: count, offset: start } = readLength(additional, nextOffset)
    const map = new Map()
    let pos = start
    for (let i = 0; i < count; i++) {
      const keyResult = decodeCBOR(buffer, pos)
      const valResult = decodeCBOR(buffer, keyResult.offset)
      map.set(keyResult.value, valResult.value)
      pos = valResult.offset
    }
    return { value: map, offset: pos }
  }

  if (major === 7) {
    // Simple values and floats
    if (additional === 20) return { value: false, offset: nextOffset }
    if (additional === 21) return { value: true, offset: nextOffset }
    if (additional === 22) return { value: null, offset: nextOffset }
    throw new Error('CBOR: unsupported simple value')
  }

  throw new Error(`CBOR: unsupported major type ${major}`)
}

// ── Registration ────────────────────────────────────────────────────────

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

// ── Authentication ──────────────────────────────────────────────────────

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
    return { verified: false, error: `Origin mismatch: expected ${ORIGIN}, got ${clientData.origin}.` }
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

// ── DER encoding helpers ────────────────────────────────────────────────

function derLength(length) {
  if (length < 0x80) return Buffer.from([length])
  if (length < 0x100) return Buffer.from([0x81, length])
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff])
}

function derSequence(contents) {
  const body = Buffer.concat(contents)
  return Buffer.concat([Buffer.from([0x30]), derLength(body.length), body])
}

function derBitString(contents) {
  // Bit string with 0 unused bits
  const body = Buffer.concat([Buffer.from([0x00]), contents])
  return Buffer.concat([Buffer.from([0x03]), derLength(body.length), body])
}

function _derOctetString(contents) {
  return Buffer.concat([Buffer.from([0x04]), derLength(contents.length), contents])
}

function derObjectIdentifier(oid) {
  return Buffer.concat([Buffer.from([0x06]), derLength(oid.length), oid])
}

function buildEcP256DerPublicKey(uncompressedPoint) {
  // OID for id-ecPublicKey (1.2.840.10045.2.1)
  const ecPublicKeyOid = Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])
  // OID for prime256v1 / P-256 (1.2.840.10045.3.1.7)
  const p256Oid = Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])

  const algorithmIdentifier = derSequence([
    derObjectIdentifier(ecPublicKeyOid),
    derObjectIdentifier(p256Oid),
  ])

  return derSequence([algorithmIdentifier, derBitString(uncompressedPoint)])
}

function derInteger(buffer) {
  // Ensure positive interpretation: prepend 0x00 if high bit set
  let buf = buffer
  if (buf[0] & 0x80) {
    buf = Buffer.concat([Buffer.from([0x00]), buf])
  }
  return Buffer.concat([Buffer.from([0x02]), derLength(buf.length), buf])
}

function buildRsaDerPublicKey(n, e) {
  // OID for rsaEncryption (1.2.840.113549.1.1.1)
  const rsaOid = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])

  const algorithmIdentifier = derSequence([
    derObjectIdentifier(rsaOid),
    Buffer.from([0x05, 0x00]), // NULL
  ])

  const rsaPublicKey = derSequence([derInteger(n), derInteger(e)])

  return derSequence([algorithmIdentifier, derBitString(rsaPublicKey)])
}

// ── Challenge cleanup ───────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now()
  for (const [key, val] of challengeStore) {
    if (now - val.timestamp > 120_000) challengeStore.delete(key)
  }
}, 300_000)

module.exports = {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
}

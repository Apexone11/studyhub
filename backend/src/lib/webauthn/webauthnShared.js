/**
 * Shared WebAuthn utilities: constants, base64url helpers, CBOR decoder,
 * DER encoding helpers, and challenge store.
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
    return {
      value: buffer.slice(dataStart, dataStart + length).toString('utf8'),
      offset: dataStart + length,
    }
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

function derInteger(buffer) {
  // Ensure positive interpretation: prepend 0x00 if high bit set
  let buf = buffer
  if (buf[0] & 0x80) {
    buf = Buffer.concat([Buffer.from([0x00]), buf])
  }
  return Buffer.concat([Buffer.from([0x02]), derLength(buf.length), buf])
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
  crypto,
  RP_NAME,
  RP_ID,
  ORIGIN,
  challengeStore,
  base64urlEncode,
  base64urlDecode,
  decodeCBOR,
  buildEcP256DerPublicKey,
  buildRsaDerPublicKey,
}

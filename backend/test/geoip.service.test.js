/**
 * geoip.service — isPrivateOrLocal unit tests.
 *
 * Enforces that we skip geo lookup for every address range where the
 * result would be meaningless (loopback, RFC1918, link-local, container-
 * internal, IPv6 ULA / link-local / loopback / IPv4-mapped).
 */
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

let isPrivateOrLocal

beforeAll(() => {
  const mod = require('../src/lib/geoip.service')
  isPrivateOrLocal = mod.isPrivateOrLocal
})

describe('isPrivateOrLocal', () => {
  describe('loopback', () => {
    it('IPv4 127.0.0.1', () => expect(isPrivateOrLocal('127.0.0.1')).toBe(true))
    it('IPv6 ::1', () => expect(isPrivateOrLocal('::1')).toBe(true))
    it('literal "localhost"', () => expect(isPrivateOrLocal('localhost')).toBe(true))
  })

  describe('IPv4 RFC1918', () => {
    it('10.0.0.1', () => expect(isPrivateOrLocal('10.0.0.1')).toBe(true))
    it('10.255.255.255', () => expect(isPrivateOrLocal('10.255.255.255')).toBe(true))
    it('192.168.1.1', () => expect(isPrivateOrLocal('192.168.1.1')).toBe(true))
    it('172.16.0.1', () => expect(isPrivateOrLocal('172.16.0.1')).toBe(true))
    it('172.31.255.255', () => expect(isPrivateOrLocal('172.31.255.255')).toBe(true))
    it('172.15.0.1 (just below range)', () => expect(isPrivateOrLocal('172.15.0.1')).toBe(false))
    it('172.32.0.1 (just above range)', () => expect(isPrivateOrLocal('172.32.0.1')).toBe(false))
  })

  describe('IPv4 link-local', () => {
    it('169.254.1.2', () => expect(isPrivateOrLocal('169.254.1.2')).toBe(true))
  })

  describe('IPv4-mapped IPv6', () => {
    it('::ffff:127.0.0.1 recurses to loopback', () =>
      expect(isPrivateOrLocal('::ffff:127.0.0.1')).toBe(true))
    it('::ffff:10.0.0.1 recurses to RFC1918', () =>
      expect(isPrivateOrLocal('::ffff:10.0.0.1')).toBe(true))
    it('::ffff:8.8.8.8 recurses to public', () =>
      expect(isPrivateOrLocal('::ffff:8.8.8.8')).toBe(false))
  })

  describe('IPv6 link-local (fe80::/10)', () => {
    it('fe80::1', () => expect(isPrivateOrLocal('fe80::1')).toBe(true))
    it('fe80::1234:5678:9abc:def0', () =>
      expect(isPrivateOrLocal('fe80::1234:5678:9abc:def0')).toBe(true))
    it('febf::1 (top of range)', () => expect(isPrivateOrLocal('febf::1')).toBe(true))
    it('fec0::1 (just above range)', () => expect(isPrivateOrLocal('fec0::1')).toBe(false))
  })

  describe('IPv6 unique local (fc00::/7)', () => {
    it('fc00::1', () => expect(isPrivateOrLocal('fc00::1')).toBe(true))
    it('fd00::1', () => expect(isPrivateOrLocal('fd00::1')).toBe(true))
    it('fdff:1234::abcd', () => expect(isPrivateOrLocal('fdff:1234::abcd')).toBe(true))
    it('fe00::1 (just above range, is link-local-adjacent)', () =>
      expect(isPrivateOrLocal('fe00::1')).toBe(false))
    it('fb00::1 (just below range)', () => expect(isPrivateOrLocal('fb00::1')).toBe(false))
  })

  describe('public addresses', () => {
    it('IPv4 8.8.8.8', () => expect(isPrivateOrLocal('8.8.8.8')).toBe(false))
    it('IPv4 1.1.1.1', () => expect(isPrivateOrLocal('1.1.1.1')).toBe(false))
    it('IPv6 2001:4860:4860::8888 (Google public)', () =>
      expect(isPrivateOrLocal('2001:4860:4860::8888')).toBe(false))
    it('IPv6 2606:4700:4700::1111 (Cloudflare public)', () =>
      expect(isPrivateOrLocal('2606:4700:4700::1111')).toBe(false))
  })

  describe('invalid inputs', () => {
    it('empty string', () => expect(isPrivateOrLocal('')).toBe(false))
    it('null', () => expect(isPrivateOrLocal(null)).toBe(false))
    it('undefined', () => expect(isPrivateOrLocal(undefined)).toBe(false))
    it('non-string', () => expect(isPrivateOrLocal(42)).toBe(false))
  })
})

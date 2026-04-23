#!/usr/bin/env node
/* global process */
/**
 * sync-mobile-lan-ip — keep the dev mobile build honest across DHCP changes.
 *
 * Run before `vite build --mode mobile` + `cap sync`. Detects the current
 * primary LAN IPv4 address, then:
 *
 *   1. Rewrites VITE_MOBILE_API_URL in .env.mobile.local
 *   2. Rewrites the single <domain> line in network_security_config.xml
 *      that holds the dev-machine LAN IP
 *
 * Idempotent. Safe to run on every build. Does nothing (exit 0) if no
 * usable LAN IP is detected — the previous values are left alone.
 *
 * Why this exists: the first pass of the mobile dev setup hardcoded the
 * LAN IP in two files. DHCP lease renewals silently broke the phone
 * build every time the laptop got a new address.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

const ENV_FILE = path.join(projectRoot, '.env.mobile.local')
const NSC_FILE = path.join(
  projectRoot,
  'android',
  'app',
  'src',
  'main',
  'res',
  'xml',
  'network_security_config.xml',
)

const PORT = Number(process.env.MOBILE_DEV_PORT) || 4000

/**
 * Return the first non-internal IPv4 address. Prefers `192.168.*` /
 * `10.*` (private LAN) over anything that looks like a VPN or virtual
 * adapter (Hyper-V, WSL, VMware bridge). Returns null if nothing found.
 */
function detectLanIp() {
  const nets = networkInterfaces()
  const candidates = []
  for (const name of Object.keys(nets)) {
    const looksVirtual = /vEthernet|VMware|VirtualBox|WSL|Hyper-V|Loopback|vmnet/i.test(name)
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4') continue
      if (net.internal) continue
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) continue
      candidates.push({ name, address: net.address, virtual: looksVirtual })
    }
  }
  if (candidates.length === 0) return null
  const real = candidates.find((c) => !c.virtual)
  return (real || candidates[0]).address
}

function updateEnvFile(ip) {
  const url = `http://${ip}:${PORT}`
  if (!existsSync(ENV_FILE)) {
    // Bootstrap from scratch if missing.
    const seed = `VITE_MOBILE_API_URL=${url}\nVITE_MOBILE_BUILD=1\n`
    writeFileSync(ENV_FILE, seed, 'utf8')
    return { changed: true, url, reason: 'created' }
  }
  const src = readFileSync(ENV_FILE, 'utf8')
  const next = src.replace(/^VITE_MOBILE_API_URL=.*$/m, `VITE_MOBILE_API_URL=${url}`)
  const hasLine = /^VITE_MOBILE_API_URL=/m.test(src)
  const final = hasLine ? next : `${src.trimEnd()}\nVITE_MOBILE_API_URL=${url}\n`
  if (final === src) return { changed: false, url, reason: 'already-current' }
  writeFileSync(ENV_FILE, final, 'utf8')
  return { changed: true, url, reason: 'rewrote' }
}

function updateNetworkSecurityConfig(ip) {
  if (!existsSync(NSC_FILE)) {
    return { changed: false, reason: 'nsc-missing' }
  }
  const src = readFileSync(NSC_FILE, 'utf8')
  // Match the single <domain> line that holds a 10.*, 192.168.*, or 172.16-31.*
  // address — i.e. the LAN IP slot. Leaves 10.0.2.2 (emulator alias),
  // localhost, 127.0.0.1 alone because those aren't valid LAN IPs.
  const lanIpDomainRe =
    /<domain includeSubdomains="false">(10\.(?!0\.2\.2\b)\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)<\/domain>/
  const replacement = `<domain includeSubdomains="false">${ip}</domain>`
  if (lanIpDomainRe.test(src)) {
    const next = src.replace(lanIpDomainRe, replacement)
    if (next === src) return { changed: false, reason: 'already-current' }
    writeFileSync(NSC_FILE, next, 'utf8')
    return { changed: true, reason: 'rewrote' }
  }
  // No LAN IP entry found — inject one before </domain-config>.
  const inject = src.replace(/(\s*)<\/domain-config>/, `$1    ${replacement}$1</domain-config>`)
  if (inject === src) return { changed: false, reason: 'no-anchor' }
  writeFileSync(NSC_FILE, inject, 'utf8')
  return { changed: true, reason: 'injected' }
}

function main() {
  const ip = detectLanIp()
  if (!ip) {
    console.log('[sync-mobile-lan-ip] no usable LAN IP detected; leaving config untouched')
    return
  }
  const envResult = updateEnvFile(ip)
  const nscResult = updateNetworkSecurityConfig(ip)
  const line = (label, r) =>
    r.changed
      ? `[sync-mobile-lan-ip] ${label}: ${r.reason} -> ${r.url || ip}`
      : `[sync-mobile-lan-ip] ${label}: ${r.reason} (${r.url || ip})`
  console.log(line('.env.mobile.local', envResult))
  console.log(line('network_security_config.xml', nscResult))
}

main()

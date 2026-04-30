const STOCK_HOSTS = [
  'gettyimages.com',
  'shutterstock.com',
  'istockphoto.com',
  'alamy.com',
  'depositphotos.com',
]
const STRONG_TEXT_PATTERNS = [
  /\bgetty images\b/gi,
  /\bshutterstock\b/gi,
  /\badobe stock\b/gi,
  /\balamy\b/gi,
  /\breprinted with permission\b/gi,
  /\ball rights reserved\b/gi,
]
const COPYRIGHT_PATTERN = /(?:©|&copy;)\s*(?:19|20)\d{2}\b/gi
const WATERMARK_PATTERN = /(?:watermark|(?:^|[/_-])wm[_-]|(?:^|[/_-])sample[_-])/i

function stripAttributionContainers(html) {
  return String(html || '')
    .replace(/<(footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(
      /<[^>]+(?:class|aria-label|role)\s*=\s*["'][^"']*(?:attribution|citation|credits?)[^"']*["'][\s\S]*?<\/[^>]+>/gi,
      ' ',
    )
}

function textContent(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

function hostnameFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function detectCopyrightSignals(html) {
  const value = String(html || '')
  const text = textContent(stripAttributionContainers(value))
  const signals = []

  for (const pattern of STRONG_TEXT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      signals.push({
        type: 'text',
        strength: 'strong',
        message: `Copyright text signal: ${match[0]}`,
      })
    }
  }

  COPYRIGHT_PATTERN.lastIndex = 0
  for (const match of text.matchAll(COPYRIGHT_PATTERN)) {
    signals.push({
      type: 'text',
      strength: 'medium',
      message: `Copyright notice signal: ${match[0]}`,
    })
  }

  for (const match of value.matchAll(/\b(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const hostname = hostnameFromUrl(match[1])
    if (STOCK_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      signals.push({
        type: 'url',
        strength: 'strong',
        message: `Stock media host detected: ${hostname}`,
      })
    }
    if (WATERMARK_PATTERN.test(match[1])) {
      signals.push({
        type: 'filename',
        strength: 'weak',
        message: 'Watermark-like filename detected.',
      })
    }
  }

  const strongSignals = signals.filter((signal) => signal.strength === 'strong').length
  const weakSignals = signals.length - strongSignals
  const scoreDeduction = Math.min(70, strongSignals * 20 + weakSignals * 5)

  return { signals, scoreDeduction }
}

module.exports = { STOCK_HOSTS, detectCopyrightSignals, stripAttributionContainers }
